"""Credits, unlocks, and the checks that keep each account within what it has.

Dixlab is pay-as-you-go: people buy credit packs once and credits never expire.
  * AI actions spend credits (AI_COSTS).
  * Paid features are unlocked with credits, once, for good (UNLOCKS): premium
    templates, visitor insights, custom domains, password pages, removing the
    Dixlab footer, and extra projects or storage (these can be bought again).
  * New accounts start with config.WELCOME_CREDITS free credits.

Older paid plans still count: an account with a plan given by an admin, or a
subscription that hasn't run out, has everything its plan included (Pro and
Premium: every feature). Running out of credits never touches existing work.

With DIXLAB_PLAN_LIMITS=false every account gets everything."""
import sqlite3
import time

from fastapi import HTTPException, status

from . import config

DAY_MS = 86_400_000
GRACE_MS = 3 * DAY_MS          # a failed renewal keeps the plan this long while Bachs retries
MB = 1024 * 1024

# Free templates; every other template needs the "Premium templates" unlock.
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
        "analytics_days": 0,
        "name": "Free", "rank": 0, "projects": 1, "per_type": None, "templates": FREE_TEMPLATES,
        "ai_units": 10, "storage_mb": 100,
        "pdf_types": None,        # PDF export for every type (Free still has just one asset)
    },
    "starter": {
        "analytics_days": 0,
        "name": "Starter", "rank": 1, "projects": UNLIMITED, "per_type": {"cv": 3, "portfolio": 2, "case": 5},
        "templates": STARTER_TEMPLATES, "ai_units": 100, "storage_mb": 1024, "pdf_types": None,
    },
    "pro": {
        "analytics_days": 30,
        "name": "Pro", "rank": 2, "projects": UNLIMITED, "per_type": {"cv": UNLIMITED, "portfolio": 5, "case": 15},
        "templates": None, "ai_units": 300, "storage_mb": 5 * 1024, "pdf_types": None,
    },
    "premium": {
        "analytics_days": 365,
        "name": "Premium", "rank": 3, "projects": UNLIMITED, "per_type": None,
        "templates": None, "ai_units": 800, "storage_mb": 10 * 1024, "pdf_types": None,
    },
}
ORDER = ("free", "starter", "pro", "premium")
PAID = ("starter", "pro", "premium")
INTERVALS = ("monthly", "yearly")
INTERVAL_DAYS = {"monthly": 30, "yearly": 365}
TYPE_NAMES = {"portfolio": ("portfolio", "portfolios"), "cv": ("CV", "CVs"), "case": ("case study", "case studies")}
# Credits each AI request costs. Asking the next interview question is free;
# write-ups and changes are counted. Priced from what the AI provider charges:
# about $0.002 per heavy action on Groq, about $0.12 on Claude Opus 5.5 (with
# thinking), against roughly $0.018 a credit, so even Claude leaves a margin.
AI_COSTS = {
    "interview_next": 0,
    "interview_draft_portfolio": 10,  # generate portfolio content
    "interview_draft_case": 15,       # generate a case study
    "customize": 5,                   # improve content ("Describe a change")
    "assist_profiles": 15,            # read someone's public profiles to shape a CV or portfolio
    "assist_tailor_cv": 20,           # advanced workflow: tailor a CV to a job advert
    "assist_case_links": 15,          # write a case study from project links (repo, Figma, site)
    "assist_translate": 10,           # translate a page into another language
}


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
            "trialAvailable": bool(u) and not u["trial_used_at"] and config.TRIAL_DAYS > 0}
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


# ---------------------------------------------------------------- unlocks (paid with credits, kept for good)

BASE_PROJECTS = 1          # everyone: one CV, portfolio or case study
BASE_STORAGE_MB = 200
STORAGE_STEP_MB = 1024     # each "more storage" unlock
UNLOCKS = {
    "templates": {"name": "Premium templates", "credits": 300, "stack": False,
                  "desc": "Publish with every premium and 3D template, now and the ones we add later."},
    "insights": {"name": "Visitor insights", "credits": 300, "stack": False,
                 "desc": "See where visitors come from, what they open, how far they read, and who downloads your CV."},
    "subdomain": {"name": "Your Dixlab address", "credits": 200, "stack": False,
                  "desc": "A free web address for your page, like yourname.dixlab.click. No domain to buy."},
    "password": {"name": "Password-protected pages", "credits": 200, "stack": False,
                 "desc": "Share NDA or client work only with people who have the password."},
    "branding": {"name": "Remove “Made with Dixlab”", "credits": 200, "stack": False,
                 "desc": "Your published pages without the Dixlab footer."},
    "project": {"name": "One more project", "credits": 100, "stack": True,
                "desc": "Room for one more CV, portfolio or case study. Buy as many as you need."},
    "storage": {"name": "1 GB more storage", "credits": 100, "stack": True,
                "desc": "More space for images, videos and files."},
}
INSIGHT_DAYS = 365


def _legacy(plan: str) -> dict:
    """What an older paid plan (admin-given or a subscription still running) includes."""
    if _rank(plan) >= _rank("pro"):
        return {f: True for f in UNLOCKS if not UNLOCKS[f]["stack"]} | {"projects": None, "storage_mb": PLANS[plan]["storage_mb"]}
    if plan == "starter":
        return {"templates": True, "projects": None, "storage_mb": PLANS["starter"]["storage_mb"]}
    return {}


def unlocked(db: sqlite3.Connection, user_id: str) -> dict:
    """{feature: count} bought with credits."""
    return {r["feature"]: r["count"] for r in db.execute("SELECT feature, count FROM unlocks WHERE user_id = ?", (user_id,))}


def entitlements(db: sqlite3.Connection, user_id: str) -> dict:
    """Everything this account can do right now (features, project and storage limits)."""
    if not config.PLAN_LIMITS:
        return {f: True for f in UNLOCKS if not UNLOCKS[f]["stack"]} | {
            "projects": None, "storage_mb": config.MAX_STORAGE_BYTES_PER_USER // MB, "insightDays": INSIGHT_DAYS}
    got = unlocked(db, user_id)
    out = {f: bool(got.get(f)) for f in UNLOCKS if not UNLOCKS[f]["stack"]}
    out["projects"] = BASE_PROJECTS + got.get("project", 0)
    out["storage_mb"] = BASE_STORAGE_MB + got.get("storage", 0) * STORAGE_STEP_MB
    for k, v in _legacy(current(db, user_id)["plan"]).items():
        if k == "projects":
            out["projects"] = None
        elif k == "storage_mb":
            out["storage_mb"] = max(out["storage_mb"], v)
        elif v:
            out[k] = True
    out["insightDays"] = INSIGHT_DAYS if out["insights"] else 0
    return out


def has(db: sqlite3.Connection, user_id: str, feature: str) -> bool:
    return bool(entitlements(db, user_id).get(feature))


def unlock_error(feature: str, message: str | None = None, db: sqlite3.Connection | None = None,
                 user_id: str | None = None) -> HTTPException:
    """402 naming the unlock that's needed; the app offers it (and credit packs if the balance is short)."""
    u = UNLOCKS[feature]
    return HTTPException(status.HTTP_402_PAYMENT_REQUIRED, {
        "code": "unlock_needed", "feature": feature, "credits": u["credits"], "name": u["name"],
        "message": message or f"{u['name']} is a one-time unlock for {u['credits']} credits.",
        "balance": balance(db, user_id) if db is not None and user_id else None})


def require(db: sqlite3.Connection, user_id: str, feature: str, message: str | None = None) -> None:
    if not has(db, user_id, feature):
        raise unlock_error(feature, message, db, user_id)


# ---------------------------------------------------------------- credits

def _id() -> str:
    import secrets
    return f"cr-{secrets.token_hex(8)}"


def add_credits(db: sqlite3.Connection, user_id: str, delta: int, reason: str, ref: str | None = None) -> bool:
    """Add (or, with a negative delta, take) credits. With `ref`, it happens once only. True if it was recorded."""
    cur = db.execute("INSERT INTO credit_ledger (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?) "
                     "ON CONFLICT(ref) DO NOTHING", (_id(), user_id, int(delta), reason, ref, now_ms()))
    return cur.rowcount > 0


def welcome(db: sqlite3.Connection, user_id: str) -> None:
    """The free starting credits, once per account (also for accounts made before credits)."""
    if config.WELCOME_CREDITS > 0:
        add_credits(db, user_id, config.WELCOME_CREDITS, "welcome", ref=f"welcome:{user_id}")


def balance(db: sqlite3.Connection, user_id: str) -> int:
    if config.WELCOME_CREDITS > 0 and not db.execute("SELECT 1 FROM credit_ledger WHERE ref = ?", (f"welcome:{user_id}",)).fetchone():
        welcome(db, user_id)
    return int(db.execute("SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE user_id = ?", (user_id,)).fetchone()[0])


def history(db: sqlite3.Connection, user_id: str, limit: int = 30) -> list[dict]:
    return [{"delta": r["delta"], "reason": r["reason"], "at": r["created_at"]} for r in db.execute(
        "SELECT delta, reason, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
        (user_id, limit))]


def spend(db: sqlite3.Connection, user_id: str, amount: int, reason: str) -> None:
    """Take credits, or raise 402 if there aren't enough."""
    have = balance(db, user_id)
    if amount > have:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, {
            "code": "credits_low", "message": f"That needs {amount} credits and you have {have}. Buy a credit pack to continue.",
            "needed": amount, "balance": have})
    add_credits(db, user_id, -amount, reason)


def buy_unlock(db: sqlite3.Connection, user_id: str, feature: str) -> dict:
    u = UNLOCKS.get(feature)
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown feature.")
    if not u["stack"] and has(db, user_id, feature):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{u['name']} is already unlocked.")
    spend(db, user_id, u["credits"], f"unlock:{feature}")
    db.execute("INSERT INTO unlocks (user_id, feature, count, updated_at) VALUES (?, ?, 1, ?) "
               "ON CONFLICT(user_id, feature) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at",
               (user_id, feature, now_ms()))
    return entitlements(db, user_id)


# ---------------------------------------------------------------- the checks

def pdf_allowed(db: sqlite3.Connection, user_id: str, ptype: str) -> bool:
    """PDF export is for everyone."""
    return True


def upgrade_error(code: str, message: str, needed: str, plan: str) -> HTTPException:
    """Kept for older callers: 402 with a reason the frontend shows."""
    return HTTPException(status.HTTP_402_PAYMENT_REQUIRED, {"code": code, "message": message, "needed": needed, "plan": plan})


def check_new_project(db: sqlite3.Connection, user_id: str, ptype: str) -> None:
    """Raise 402 if there's no room for another project."""
    if not config.PLAN_LIMITS:
        return
    limit = entitlements(db, user_id)["projects"]
    if limit is None:
        return
    total = db.execute("SELECT COUNT(*) FROM projects WHERE user_id = ?", (user_id,)).fetchone()[0]
    if total >= limit:
        one = "one project" if limit == 1 else f"{limit} projects"
        raise unlock_error("project", f"You have room for {one}. Add room for another for {UNLOCKS['project']['credits']} credits "
                           "(it’s yours for good), or delete one you no longer need.", db, user_id)


def check_template(db: sqlite3.Connection, user_id: str, template: str, names: dict | None = None) -> None:
    """Raise 402 if this template needs the premium templates unlock (checked when publishing)."""
    if not config.PLAN_LIMITS or template in FREE_TEMPLATES or template in LEGACY_TEMPLATES:
        return
    if not has(db, user_id, "templates"):
        label = (names or {}).get(template, template.capitalize())
        raise unlock_error("templates", f"{label} is a premium template. Unlock every premium template for "
                           f"{UNLOCKS['templates']['credits']} credits, once, or switch to a free one.", db, user_id)


def storage_limit(db: sqlite3.Connection, user_id: str) -> int:
    if not config.PLAN_LIMITS:
        return config.MAX_STORAGE_BYTES_PER_USER
    return entitlements(db, user_id)["storage_mb"] * MB


def _month_start_ms() -> int:
    import calendar
    t = time.gmtime()
    return calendar.timegm((t.tm_year, t.tm_mon, 1, 0, 0, 0)) * 1000


def ai_usage(db: sqlite3.Connection, user_id: str, info: dict | None = None) -> dict:
    """Credits spent on AI this month, and the balance (admin dashboard and the account page)."""
    spent = db.execute("SELECT COALESCE(-SUM(delta), 0) FROM credit_ledger WHERE user_id = ? AND reason LIKE 'ai:%' AND created_at >= ?",
                       (user_id, _month_start_ms())).fetchone()[0]
    return {"units": int(spent), "balance": balance(db, user_id)}


def ai_included(db: sqlite3.Connection, user_id: str) -> bool:
    """Older Pro and Premium plans (admin-given, or a subscription still running) include AI without credits."""
    return _rank(current(db, user_id)["plan"]) >= _rank("pro")


def ai_block(db: sqlite3.Connection, user_id: str, feature: str) -> tuple[str, str, str] | None:
    """(code, message, needed) when there aren't enough credits for this AI request, else None."""
    if not config.PLAN_LIMITS or ai_included(db, user_id):
        return None
    cost = AI_COSTS.get(feature, 5)
    if cost == 0:
        return None
    have = balance(db, user_id)
    if cost > have:
        return "ai_credits", (f"This uses {cost} credits and you have {have}. Your work is safe and you can keep editing by hand, "
                              "or buy a credit pack (credits never expire)."), "credits"
    return None


def record_ai(db: sqlite3.Connection, user_id: str, feature: str) -> None:
    cost = AI_COSTS.get(feature, 5)
    if cost and config.PLAN_LIMITS and not ai_included(db, user_id):
        add_credits(db, user_id, -cost, f"ai:{feature}")


def public_catalog() -> dict:
    """What the pricing page shows: packs, unlocks and what AI costs."""
    return {
        "packs": [{"id": pid, "credits": p["credits"], "prices": p["prices"]} for pid, p in config.CREDIT_PACKS.items()],
        "unlocks": [{"id": k, **v} for k, v in UNLOCKS.items()],
        "aiCosts": {k: v for k, v in AI_COSTS.items() if v},
        "welcome": config.WELCOME_CREDITS,
        "base": {"projects": BASE_PROJECTS, "storageMb": BASE_STORAGE_MB},
        "freeTemplates": sorted(FREE_TEMPLATES | LEGACY_TEMPLATES),
    }
