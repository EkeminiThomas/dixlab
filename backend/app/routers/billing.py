"""Credits and billing: the pricing page's data, your balance and unlocks, buying
credit packs (one-off Bachs payments), unlocking features with credits, the
Bachs webhook, refunds, and managing an older subscription."""
import hashlib
import json
import secrets
import logging
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import bachs, billing, config, events, plans
from ..db import get_db
from ..security import current_user

log = logging.getLogger("dixlab")
router = APIRouter(prefix="/api/billing", tags=["billing"])


def _unavailable() -> JSONResponse:
    return JSONResponse({"error": "Payments aren’t set up on this server yet.", "unavailable": True}, status_code=503)


def _fail(e: bachs.BachsError) -> JSONResponse:
    return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/plans")
def list_plans():
    """Public: what the pricing page shows."""
    return {
        "currencies": list(config.CURRENCIES),
        "configured": {cur: bachs.configured(cur) for cur in config.CURRENCIES},
        "enforced": config.PLAN_LIMITS,
        "refundDays": config.REFUND_DAYS,
        **plans.public_catalog(),
    }


def _pack_of(row) -> dict | None:
    return config.CREDIT_PACKS.get(row["interval"]) if row["plan"] == "credits" else None


def summary(db: sqlite3.Connection, user_id: str) -> dict:
    info = plans.current(db, user_id)
    ent = plans.entitlements(db, user_id)
    bal = plans.balance(db, user_id)
    counts = {r["type"]: r["n"] for r in db.execute("SELECT type, COUNT(*) AS n FROM projects WHERE user_id = ? GROUP BY type", (user_id,))}
    storage = db.execute("SELECT COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ?", (user_id,)).fetchone()[0]
    sub = db.execute("SELECT customer_ref FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
    window = config.REFUND_DAYS * plans.DAY_MS
    now = plans.now_ms()
    payments = []
    for r in db.execute("SELECT * FROM payments WHERE user_id = ? AND status != 'pending' ORDER BY created_at DESC LIMIT 20", (user_id,)):
        pack = _pack_of(r)
        refundable = (r["plan"] != "domain" and r["status"] == "success" and r["refund_status"] in (None, "failed") and bool(r["paid_at"])
                      and now - r["paid_at"] <= window and r["amount"] > 0 and (not pack or bal >= pack["credits"]))
        payments.append({"reference": r["reference"], "plan": r["plan"], "interval": r["interval"], "amount": r["amount"],
                         "currency": r["currency"], "status": r["status"], "paidAt": r["paid_at"], "refundStatus": r["refund_status"],
                         "credits": pack["credits"] if pack else None, "refundable": refundable})
    legacy = None
    if info["plan"] != "free":
        legacy = {"plan": info["plan"], "name": plans.PLANS[info["plan"]]["name"], "source": info["source"], "status": info["status"],
                  "interval": info["interval"], "currency": info["currency"], "periodEnd": info["periodEnd"],
                  "renews": info["renews"], "cancelAtPeriodEnd": info["cancelAtPeriodEnd"]}
    return {
        "enforced": config.PLAN_LIMITS,
        "credits": bal,
        "features": {k: v for k, v in ent.items() if k not in ("projects", "storage_mb", "insightDays")},
        "limits": {"projects": ent["projects"], "storageMb": ent["storage_mb"], "insightDays": ent["insightDays"]},
        "unlocks": plans.unlocked(db, user_id),
        "history": plans.history(db, user_id),
        "legacy": legacy,
        "usage": {"projects": {"total": sum(counts.values()), **counts}, "storageBytes": storage, "ai": plans.ai_usage(db, user_id, info)},
        "canManageCard": bool(sub and sub["customer_ref"] and config.BACHS_API_KEY and legacy and legacy["renews"]),
        "payments": payments,
    }


@router.get("/me")
def my_billing(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    return summary(db, user["id"])


class UnlockIn(BaseModel):
    feature: str


@router.post("/unlock")
def unlock(body: UnlockIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Spend credits on a feature; it stays unlocked for good."""
    plans.buy_unlock(db, user["id"], body.feature)
    events.log(db, "billing.unlock", user["id"], feature=body.feature, credits=plans.UNLOCKS[body.feature]["credits"])
    return summary(db, user["id"])


class CheckoutIn(BaseModel):
    pack: str
    currency: Literal["NGN", "USD"] = "USD"


@router.post("/checkout")
def checkout(body: CheckoutIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Buy a credit pack: a one-off payment on Bachs's checkout page. Credits arrive when Bachs confirms it."""
    pack = config.CREDIT_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown credit pack.")
    if not bachs.configured(body.currency):
        return _unavailable()
    if not user.get("email_verified", True):
        from .account import unverified_response
        return unverified_response()
    amount = pack["prices"][body.currency]
    sub = db.execute("SELECT customer_ref FROM subscriptions WHERE user_id = ?", (user["id"],)).fetchone()
    reference = f"dx_{secrets.token_hex(12)}"
    db.execute("""INSERT INTO payments (reference, user_id, email, plan, interval, amount, currency, status, created_at)
                  VALUES (?, ?, ?, 'credits', ?, ?, ?, 'pending', ?)""",
               (reference, user["id"], user["email"], body.pack, amount, body.currency, plans.now_ms()))
    customer = {"customer_id": sub["customer_ref"]} if sub and sub["customer_ref"] else {"email": user["email"], "name": user["name"]}
    try:
        data = bachs.create_checkout(
            currency=body.currency, amount_cents=amount, customer=customer, reference=reference,
            # Our own reference in the path, so coming back always identifies the payment, whatever Bachs adds.
            success_url=f"{config.PUBLIC_URL}/billing/callback/{reference}", cancel_url=f"{config.PUBLIC_URL}/pricing?checkout=cancelled",
            metadata={"user_id": user["id"], "plan": "credits", "interval": body.pack, "credits": pack["credits"], "currency": body.currency},
        )
    except bachs.BachsError as e:
        db.execute("UPDATE payments SET status = 'failed' WHERE reference = ?", (reference,))
        return _fail(e)
    checkout_id = _checkout_id(data)
    if not checkout_id:
        log.warning("Bachs created a checkout without an id we recognise (fields: %s)", ", ".join(sorted(data)))
    db.execute("UPDATE payments SET checkout_ref = ? WHERE reference = ?", (checkout_id, reference))
    events.log(db, "billing.checkout", user["id"], pack=body.pack, credits=pack["credits"], currency=body.currency)
    return {"url": data.get("checkout_url") or data.get("url"), "checkoutId": checkout_id}


def _checkout_id(data: dict) -> str | None:
    return data.get("checkout_id") or data.get("id") or (data.get("checkout") or {}).get("checkout_id")


def _claim_checkout(db, checkout_id: str, user_id: str):
    """A checkout this account started but that isn't on record under its id: find our payment
    from Bachs's copy (its reference, or the account in its metadata) and record the id."""
    if not bachs.configured():
        return None
    try:
        data = bachs.get_checkout(checkout_id)
    except bachs.BachsError as e:
        log.warning("Couldn't look up checkout %s at Bachs: %s", checkout_id, e)
        return None
    meta = data.get("metadata") or {}
    log.warning("Matching checkout %s from Bachs (fields: %s; reference=%s, metadata user matches: %s)", checkout_id,
                ", ".join(sorted(data)), bool(data.get("reference") or meta.get("reference")), meta.get("user_id") == user_id)
    ref = data.get("reference") or meta.get("reference")
    row = db.execute("SELECT reference, user_id FROM payments WHERE reference = ?", (ref,)).fetchone() if ref else None
    if row and row["user_id"] != user_id:
        return None  # someone else's checkout
    if not row:
        if meta.get("user_id") != user_id:
            return None
        row = db.execute("SELECT reference, user_id FROM payments WHERE user_id = ? AND status = 'pending' AND plan = ? "
                         "AND interval = ? ORDER BY created_at DESC LIMIT 1",
                         (user_id, meta.get("plan"), meta.get("interval"))).fetchone()
        if not row:
            return None
    db.execute("UPDATE payments SET checkout_ref = ? WHERE reference = ?", (checkout_id, row["reference"]))
    return db.execute("SELECT status FROM payments WHERE reference = ?", (row["reference"],)).fetchone()


@router.get("/verify")
def verify(checkout_id: str = "", ref: str = "", user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Where Bachs sends the visitor back (/billing/callback/<ref>?checkout_id=...): confirm it and switch the plan on."""
    row = None
    if ref:
        found = db.execute("SELECT status, checkout_ref FROM payments WHERE reference = ? AND user_id = ?", (ref, user["id"])).fetchone()
        if found:
            if checkout_id and not found["checkout_ref"]:
                db.execute("UPDATE payments SET checkout_ref = ? WHERE reference = ?", (checkout_id, ref))
            checkout_id = checkout_id or found["checkout_ref"] or ""
            row = found
    if not row and checkout_id:
        row = db.execute("SELECT status FROM payments WHERE checkout_ref = ? AND user_id = ?", (checkout_id, user["id"])).fetchone()
    if row and not checkout_id:
        # We know the payment but not Bachs's id yet: the webhook will confirm it (it matches by our reference).
        return {"payment": "success" if row["status"] == "success" else "pending", "billing": summary(db, user["id"])}
    if not row and checkout_id:
        # Not saved under this id (or saved under another name): ask Bachs for the checkout and match it
        # by our own reference or the account it was made for, then carry on as normal.
        row = _claim_checkout(db, checkout_id, user["id"])
    if not row:
        log.warning("Checkout %s (back from Bachs) doesn't match a payment of user %s", checkout_id, user["id"])
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn’t find that payment.")
    payment = "success" if row["status"] == "success" else "pending"
    if row["status"] == "pending":
        if not bachs.configured():
            return _unavailable()
        try:
            data = bachs.get_checkout(checkout_id)
        except bachs.BachsError as e:
            return _fail(e)
        if billing.apply_checkout(db, data):
            payment = "success"
        elif data.get("status") in ("expired", "cancelled") or (data.get("charge") or {}).get("status") == "failed":
            db.execute("UPDATE payments SET status = 'failed' WHERE checkout_ref = ?", (checkout_id,))
            payment = "failed"
        else:
            log.warning("Checkout %s isn't confirmed yet: status=%s payment_status=%s charge=%s (fields: %s)", checkout_id,
                        data.get("status"), data.get("payment_status"), (data.get("charge") or {}).get("status"), ", ".join(sorted(data)))
    elif row["status"] == "failed":
        payment = "failed"
    return {"payment": payment, "billing": summary(db, user["id"]), "domainOrder": _domain_order(db, user["id"], ref, checkout_id)}


def _domain_order(db, user_id: str, ref: str, checkout_id: str):
    """For the return page: the domain this payment bought, if it was one."""
    row = db.execute("SELECT reference FROM payments WHERE user_id = ? AND plan = 'domain' AND (reference = ? OR checkout_ref = ?)",
                     (user_id, ref or "-", checkout_id or "-")).fetchone()
    if not row:
        return None
    from . import domains
    return domains.order_out(db.execute("SELECT * FROM domain_orders WHERE reference = ?", (row["reference"],)).fetchone())


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, db: sqlite3.Connection = Depends(get_db)):
    """Bachs's server tells us about checkouts, subscriptions, invoices and refunds."""
    body = await request.body()
    if not config.BACHS_WEBHOOK_SECRET:
        return _unavailable()
    if not bachs.signature_ok(body, request.headers):
        return JSONResponse({"error": "Invalid signature."}, status_code=400)  # Bachs doesn't retry 4xx
    try:
        event = json.loads(body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON."}, status_code=400)
    key = str(event.get("id") or hashlib.sha256(body).hexdigest())  # deliveries are at-least-once: apply each event once
    if db.execute("SELECT 1 FROM billing_events WHERE key = ?", (key,)).fetchone():
        return {"ok": True, "duplicate": True}
    db.execute("INSERT INTO billing_events (key, type, created_at) VALUES (?, ?, ?)", (key, str(event.get("type")), plans.now_ms()))
    billing.handle_event(db, event)
    return {"ok": True}


@router.post("/cancel")
def cancel(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Stop renewing. The plan stays until the end of the period already paid for."""
    info = plans.current(db, user["id"])
    if info["source"] != "subscription" or not info["renews"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "There’s no renewing plan to cancel. A paid period just ends; nothing is charged again.")
    sub = db.execute("SELECT subscription_ref FROM subscriptions WHERE user_id = ?", (user["id"],)).fetchone()
    if sub["subscription_ref"]:
        try:
            bachs.cancel_subscription(sub["subscription_ref"], at_period_end=True, reason="Cancelled in Dixlab")
        except bachs.BachsError as e:
            return _fail(e)
    # (No subscription id yet: it's cancelled at Bachs as soon as the id arrives.)
    db.execute("UPDATE subscriptions SET status = 'non_renewing', updated_at = ? WHERE user_id = ?", (plans.now_ms(), user["id"]))
    events.log(db, "billing.cancelled", user["id"], plan=info["plan"])
    return summary(db, user["id"])


@router.get("/manage")
def manage_billing(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Bachs's customer portal: update the card, see invoices."""
    sub = db.execute("SELECT customer_ref FROM subscriptions WHERE user_id = ?", (user["id"],)).fetchone()
    if not sub or not sub["customer_ref"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "There’s no billing account to manage yet.")
    if not config.BACHS_API_KEY:
        return _unavailable()
    try:
        return {"url": bachs.portal_url(sub["customer_ref"])}
    except bachs.BachsError as e:
        return _fail(e)


class RefundIn(BaseModel):
    reference: str


@router.post("/refund")
def refund(body: RefundIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Full refund of a payment made in the last REFUND_DAYS days: a credit pack's credits are
    taken back (so only while they're unused); an older plan payment ends the plan now."""
    row = db.execute("SELECT * FROM payments WHERE reference = ? AND user_id = ?", (body.reference, user["id"])).fetchone()
    if not row or row["status"] != "success":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn’t find that payment.")
    if row["refund_status"] in ("pending", "processed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This payment has already been refunded.")
    if not row["paid_at"] or plans.now_ms() - row["paid_at"] > config.REFUND_DAYS * plans.DAY_MS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Refunds are available for {config.REFUND_DAYS} days after a payment. "
                            "Email us if something went wrong.")
    pack = _pack_of(row)
    if pack and plans.balance(db, user["id"]) < pack["credits"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "Some of these credits have been used, so this pack can’t be refunded. "
                            "Email us if something went wrong.")
    if not config.BACHS_API_KEY:
        return _unavailable()
    charge_ref = row["charge_ref"]
    if not charge_ref and row["checkout_ref"]:
        try:
            charge = bachs.get_checkout(row["checkout_ref"]).get("charge") or {}
            charge_ref = charge.get("id") or charge.get("payment_id")
        except bachs.BachsError as e:
            return _fail(e)
    if not charge_ref:
        raise HTTPException(status.HTTP_409_CONFLICT, "This payment can’t be refunded automatically yet. Email us and we’ll sort it out.")
    try:
        bachs.refund(charge_ref, reference=f"rf_{row['reference']}"[:128], reason="Refund requested in Dixlab within the refund window")
    except bachs.BachsError as e:
        return _fail(e)
    db.execute("UPDATE payments SET refund_status = 'pending', charge_ref = ? WHERE reference = ?", (charge_ref, row["reference"]))
    if pack:  # the pack's credits go back with the money
        plans.add_credits(db, user["id"], -pack["credits"], "refund", ref=f"refund:{row['reference']}")
    else:     # an older plan payment: the plan ends now
        billing.cancel_remote(db, user["id"], at_period_end=False, reason="Refunded")
        now = plans.now_ms()
        db.execute("UPDATE subscriptions SET status = 'cancelled', current_period_end = ?, updated_at = ? WHERE user_id = ?", (now, now, user["id"]))
    events.log(db, "billing.refund", user["id"], amount=row["amount"], currency=row["currency"])
    return summary(db, user["id"])
