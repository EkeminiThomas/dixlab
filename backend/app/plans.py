"""Plans: what Free, Starter, Pro and Premium include, which plan an account
is on, and the checks that keep each account within its plan.

An account's plan comes from (highest wins): a plan given by an admin, a paid
plan that hasn't run out, or a free Pro trial. Everyone else is Free.
Going down a plan never deletes anything: work beyond the new plan stays saved
and published pages stay live; only new projects, publishing with a template
the plan doesn't include, and AI help are limited.

AI is measured in usage units per billing period (see AI_COSTS). Running out
never touches existing work: people keep editing by hand, and the app falls
back to its built-in (non-AI) helpers.

With DIXLAB_PLAN_LIMITS=false every account gets everything."""
import sqlite3
import time

from fastapi import HTTPException, status

from . import config

DAY_MS = 86_400_000
GRACE_MS = 3 * DAY_MS          # a failed renewal keeps the plan this long while Bachs retries
MB = 1024 * 1024

# Templates in three tiers: basic (Free), premium (Starter), advanced (Pro and Premium).
FREE_TEMPLATES = {"folio", "plain", "snapshot"}
STARTER_TEMPLATES = FREE_TEMPLATES | {
    "bento", "grid", "journal", "casebook",          # portfolios
    "classic", "meridian", "margin", "graduate",      # CVs
    "chronicle", "brief", "impact", "lab",           # case studies
}
LEGACY_TEMPLATES = {"studio", "outline", "narrative"}  # the original builder's templates stay open to everyone

UNLIMITED = None  # still subject to fair-use limits (DIXLAB_MAX_PROJECTS_PER_USER)
PLANS = {
    "free": {
        "name": "Free", "rank": 0, "projects": 1, "per_type": None, "templates": FREE_TEMPLATES,
        "ai_units": 10, "storage_mb": 100,
        "pdf_types": None,        # PDF export for every type (Free still has just one asset)
    },
    "starter": {
        "name": "Starter", "rank": 1, "projects": UNLIMITED, "per_type": {"cv": 3, "portfolio": 2, "case": 5},
        "templates": STARTER_TEMPLATES, "ai_units": 100, "storage_mb": 1024, "pdf_types": None,
    },
    "pro": {
        "name": "Pro", "rank": 2, "projects": UNLIMITED, "per_type": {"cv": UNLIMITED, "portfolio": 5, "case": 15},
        "templates": None, "ai_units": 300, "storage_mb": 5 * 1024, "pdf_types": None,
    },
    "premium": {
        "name": "Premium", "rank": 3, "projects": UNLIMITED, "per_type": None,
        "templates": None, "ai_units": 800, "storage_mb": 10 * 1024, "pdf_types": None,
    },
}
ORDER = ("free", "starter", "pro", "premium")
PAID = ("starter", "pro", "premium")
INTERVALS = ("monthly", "yearly")
INTERVAL_DAYS = {"monthly": 30, "yearly": 365}
TYPE_NAMES = {"portfolio": ("portfolio", "portfolios"), "cv": ("CV", "CVs"), "case": ("case study", "case studies")}
# Usage units each AI request costs (the white paper's table). Asking the next
# interview question is included; the write-ups and changes are counted.
AI_COSTS = {
    "interview_next": 0,
    "interview_draft_portfolio": 10,  # generate portfolio content
    "interview_draft_case": 15,       # generate a case study
    "customize": 5,                   # improve content ("Describe a change")
    "assist_profiles": 15,            # read someone's public profiles to shape a CV or portfolio
    "assist_tailor_cv": 20,           # advanced workflow: tailor a CV to a job advert
}
# AI features that need at least this plan, whatever units are left.
AI_MIN_PLAN = {"assist_tailor_cv": "pro"}  # "Advanced CV tailoring" is part of Pro and Premium


def now_ms() -> int:
    return int(time.time() * 1000)


def month() -> str:
    return time.strftime("%Y-%m", time.gmtime())


def template_tier(template: str) -> str:
    """The lowest plan that includes a template."""
    if template in FREE_TEMPLATES or template in LEGACY_TEMPLATES:
        return "free"
    return "starter" if template in STARTER_TEMPLATES else "pro"


def _rank(plan: str) -> int:
    return PLANS.get(plan, PLANS["free"])["rank"]


def current(db: sqlite3.Connection, user_id: str) -> dict:
    """The account's plan right now, and where it comes from."""
    u = db.execute("SELECT plan_override, trial_used_at, trial_ends_at FROM users WHERE id = ?", (user_id,)).fetchone()
    sub = db.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
    now = now_ms()
    info = {"plan": "free", "source": "free", "status": None, "interval": None, "currency": None, "periodEnd": None,
            "renews": False, "cancelAtPeriodEnd": False, "trialEndsAt": None,
            "trialAvailable": bool(u) and not u["trial_used_at"]}
    if sub and sub["plan"] in PAID and sub["current_period_end"]:
        grace = GRACE_MS if sub["status"] == "past_due" else 0
        if now < sub["current_period_end"] + grace:
            info.update(plan=sub["plan"], source="subscription", status=sub["status"], interval=sub["interval"],
                        currency=sub["currency"], periodEnd=sub["current_period_end"],
                        renews=sub["status"] in ("active", "past_due"),
                        cancelAtPeriodEnd=sub["status"] in ("non_renewing", "cancelled"))
    if info["source"] == "free" and u and u["trial_ends_at"] and now < u["trial_ends_at"]:
        info.update(plan="pro", source="trial", trialEndsAt=u["trial_ends_at"])
    if u and u["plan_override"] in PLANS and _rank(u["plan_override"]) >= _rank(info["plan"]):
        info.update(plan=u["plan_override"], source="override")
    return info


def plan_of(db: sqlite3.Connection, user_id: str) -> str:
    return current(db, user_id)["plan"] if config.PLAN_LIMITS else "premium"


def pdf_allowed(db: sqlite3.Connection, user_id: str, ptype: str) -> bool:
    """Whether this account's plan includes PDF export for this kind of project."""
    types = PLANS[plan_of(db, user_id)]["pdf_types"]
    return types is None or ptype in types


def upgrade_error(code: str, message: str, needed: str, plan: str) -> HTTPException:
    """402 with what to upgrade to; the frontend opens its upgrade dialog."""
    return HTTPException(status.HTTP_402_PAYMENT_REQUIRED,
                         {"code": code, "message": message, "needed": needed, "plan": plan})


def _type_limit(plan: str, ptype: str):
    per = PLANS[plan]["per_type"]
    return per.get(ptype, UNLIMITED) if per else UNLIMITED


def _next_with_room(plan: str, ptype: str, used: int) -> str:
    """The cheapest plan above `plan` with room for one more of this type."""
    for p in ORDER[ORDER.index(plan) + 1:]:
        limit = _type_limit(p, ptype)
        if limit is UNLIMITED or limit > used:
            return p
    return "premium"


def check_new_project(db: sqlite3.Connection, user_id: str, ptype: str) -> None:
    """Raise 402 if the plan has no room for another project of this type."""
    if not config.PLAN_LIMITS:
        return
    plan = plan_of(db, user_id)
    p = PLANS[plan]
    total = db.execute("SELECT COUNT(*) FROM projects WHERE user_id = ?", (user_id,)).fetchone()[0]
    if p["projects"] is not UNLIMITED and total >= p["projects"]:
        raise upgrade_error("plan_limit", "Free includes one project: a CV, a portfolio or a case study. Upgrade to Starter "
                            "to make all three, with more of each.", "starter", plan)
    limit = _type_limit(plan, ptype)
    if limit is not UNLIMITED:
        used = db.execute("SELECT COUNT(*) FROM projects WHERE user_id = ? AND type = ?", (user_id, ptype)).fetchone()[0]
        if used >= limit:
            one, many = TYPE_NAMES[ptype]
            needed = _next_with_room(plan, ptype, used)
            raise upgrade_error("plan_limit", f"{p['name']} includes {limit} {many if limit != 1 else one}. "
                                f"Upgrade to {PLANS[needed]['name']} for more, or delete one you no longer need.", needed, plan)


def check_template(db: sqlite3.Connection, user_id: str, template: str, names: dict | None = None) -> None:
    """Raise 402 if the plan doesn't include this template (checked when publishing)."""
    if not config.PLAN_LIMITS:
        return
    plan = plan_of(db, user_id)
    allowed = PLANS[plan]["templates"]
    if allowed is None or template in allowed or template in LEGACY_TEMPLATES:
        return
    tier = template_tier(template)
    label = (names or {}).get(template, template.capitalize())
    kind = "a premium" if tier == "starter" else "an advanced"
    raise upgrade_error("template_locked", f"{label} is {kind} template, on {PLANS[tier]['name']} and above. Upgrade to publish "
                        f"with it, or switch to a template on your plan.", tier, plan)


def storage_limit(db: sqlite3.Connection, user_id: str) -> int:
    if not config.PLAN_LIMITS:
        return config.MAX_STORAGE_BYTES_PER_USER
    return PLANS[plan_of(db, user_id)]["storage_mb"] * MB


def usage_cycle(info: dict) -> str:
    """Which allowance period usage counts towards: the paid period (it resets when
    a new one starts), the trial, or the calendar month on Free."""
    if info["source"] == "subscription" and info["periodEnd"]:
        return f"p{info['periodEnd']}"
    if info["source"] == "trial" and info["trialEndsAt"]:
        return f"t{info['trialEndsAt']}"
    return month()


def ai_usage(db: sqlite3.Connection, user_id: str, info: dict | None = None) -> dict:
    info = info or current(db, user_id)
    row = db.execute("SELECT count FROM ai_usage WHERE user_id = ? AND month = ? AND feature = 'units'",
                     (user_id, usage_cycle(info))).fetchone()
    return {"units": row["count"] if row else 0, "allowance": PLANS[info["plan"]]["ai_units"]}


def ai_block(db: sqlite3.Connection, user_id: str, feature: str) -> tuple[str, str, str] | None:
    """(code, message, plan needed) when the plan can't run this AI request, else None."""
    if not config.PLAN_LIMITS:
        return None
    info = current(db, user_id)
    needs = AI_MIN_PLAN.get(feature)
    if needs and _rank(info["plan"]) < _rank(needs):
        return "ai_plan", f"Tailoring your CV to a job is part of {PLANS[needs]['name']} and Premium.", needs
    cost = AI_COSTS.get(feature, 5)
    if cost == 0:
        return None
    usage = ai_usage(db, user_id, info)
    if usage["units"] + cost > usage["allowance"]:
        name = PLANS[info["plan"]]["name"]
        nxt = ORDER[min(ORDER.index(info["plan"]) + 1, len(ORDER) - 1)]
        tail = (f" Upgrade to {PLANS[nxt]['name']} for more, or wait for your allowance to reset."
                if info["plan"] != "premium" else " It resets at the start of your next billing period.")
        return "ai_quota", (f"You’ve used this period’s AI allowance on {name} ({usage['allowance']} units). Your work is safe "
                            f"and you can keep editing by hand.{tail}"), nxt
    return None


def record_ai(db: sqlite3.Connection, user_id: str, feature: str) -> None:
    cost = AI_COSTS.get(feature, 5)
    if cost:
        cycle = usage_cycle(current(db, user_id))
        db.execute("""INSERT INTO ai_usage (user_id, month, feature, count) VALUES (?, ?, 'units', ?)
                      ON CONFLICT(user_id, month, feature) DO UPDATE SET count = count + excluded.count""", (user_id, cycle, cost))


def public_catalog() -> list[dict]:
    """The plans as the pricing page shows them."""
    out = []
    for key in ORDER:
        p = PLANS[key]
        out.append({
            "id": key, "name": p["name"], "rank": p["rank"],
            "prices": None if key == "free" else {cur: {i: config.PRICES[(key, i, cur)] for i in INTERVALS} for cur in config.CURRENCIES},
            "limits": {"projects": p["projects"], "perType": p["per_type"], "storageMb": p["storage_mb"], "aiUnits": p["ai_units"],
                       "pdfTypes": list(p["pdf_types"]) if p["pdf_types"] else None},
        })
    return out
