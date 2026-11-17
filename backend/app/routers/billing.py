"""Plans and billing: the pricing page's data, your plan and usage, the free
trial, Bachs checkout, the Bachs webhook, plan changes, cancelling and refunds."""
import hashlib
import json
import secrets
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import bachs, billing, config, events, plans
from ..db import get_db
from ..security import current_user

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
        "renews": {cur: bachs.recurring(cur) for cur in config.CURRENCIES},  # NGN: one-off payments per period, for now
        "enforced": config.PLAN_LIMITS,
        "trialDays": config.TRIAL_DAYS,
        "refundDays": config.REFUND_DAYS,
        "plans": plans.public_catalog(),
        "templates": {"free": sorted(plans.FREE_TEMPLATES | plans.LEGACY_TEMPLATES), "starter": sorted(plans.STARTER_TEMPLATES)},
    }


def summary(db: sqlite3.Connection, user_id: str) -> dict:
    info = plans.current(db, user_id)
    p = plans.PLANS[info["plan"]]
    counts = {r["type"]: r["n"] for r in db.execute("SELECT type, COUNT(*) AS n FROM projects WHERE user_id = ? GROUP BY type", (user_id,))}
    storage = db.execute("SELECT COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ?", (user_id,)).fetchone()[0]
    sub = db.execute("SELECT customer_ref FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
    window = config.REFUND_DAYS * plans.DAY_MS
    now = plans.now_ms()
    payments = [{
        "reference": r["reference"], "plan": r["plan"], "interval": r["interval"], "amount": r["amount"],
        "currency": r["currency"], "status": r["status"], "paidAt": r["paid_at"], "refundStatus": r["refund_status"],
        "refundable": (r["status"] == "success" and r["refund_status"] in (None, "failed") and bool(r["paid_at"])
                       and now - r["paid_at"] <= window and r["amount"] > 0),
    } for r in db.execute("SELECT * FROM payments WHERE user_id = ? AND status != 'pending' ORDER BY created_at DESC LIMIT 20", (user_id,))]
    return {
        **info,
        "name": p["name"],
        "enforced": config.PLAN_LIMITS,
        "limits": {"projects": p["projects"], "perType": p["per_type"], "storageMb": p["storage_mb"], "aiUnits": p["ai_units"],
                   "pdfTypes": list(p["pdf_types"]) if p["pdf_types"] and config.PLAN_LIMITS else None},
        "usage": {"projects": {"total": sum(counts.values()), **counts}, "storageBytes": storage, "ai": plans.ai_usage(db, user_id, info)},
        "canManageCard": bool(sub and sub["customer_ref"] and config.BACHS_API_KEY),
        "payments": payments,
    }


@router.get("/me")
def my_billing(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    return summary(db, user["id"])


@router.post("/trial")
def start_trial(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """A free Pro trial, once per account, no card."""
    if config.TRIAL_DAYS <= 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "There’s no free trial at the moment.")
    info = plans.current(db, user["id"])
    if not info["trialAvailable"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "You’ve already used your free trial.")
    if plans.PLANS[info["plan"]]["rank"] >= plans.PLANS["pro"]["rank"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have Pro features.")
    now = plans.now_ms()
    db.execute("UPDATE users SET trial_used_at = ?, trial_ends_at = ? WHERE id = ?", (now, now + config.TRIAL_DAYS * plans.DAY_MS, user["id"]))
    events.log(db, "billing.trial", user["id"], days=config.TRIAL_DAYS)
    return summary(db, user["id"])


class CheckoutIn(BaseModel):
    plan: Literal["starter", "pro", "premium"]
    interval: Literal["monthly", "yearly"]
    currency: Literal["NGN", "USD"] = "USD"


@router.post("/checkout")
def checkout(body: CheckoutIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Start paying (returns Bachs's checkout page), or switch an existing subscription.
    USD renews automatically; NGN is a one-off payment for the period (renewed by paying again)."""
    if not bachs.configured(body.currency):
        return _unavailable()
    if not user.get("email_verified", True):
        from .account import unverified_response
        return unverified_response()
    info = plans.current(db, user["id"])
    key = (body.plan, body.interval, body.currency)
    recurring = bachs.recurring(body.currency)
    product = config.BACHS_PRODUCTS[key] if recurring else None
    sub = db.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user["id"],)).fetchone()
    renewing = info["source"] == "subscription" and info["renews"]
    if renewing and (info["plan"], info["interval"], info["currency"] or "USD") == key:
        raise HTTPException(status.HTTP_409_CONFLICT, "You’re already on this plan.")
    if renewing and recurring and sub and sub["subscription_ref"] and (sub["currency"] or "USD") == body.currency:
        # Already paying: change the plan on the same subscription (no second subscription).
        same_period = info["interval"] == body.interval
        try:
            bachs.change_plan(sub["subscription_ref"], product, now=same_period)
        except bachs.BachsError as e:
            return _fail(e)
        if same_period:  # Bachs charges or credits the difference now
            db.execute("UPDATE subscriptions SET plan = ?, updated_at = ? WHERE user_id = ?", (body.plan, plans.now_ms(), user["id"]))
        events.log(db, "billing.changed", user["id"], plan=body.plan, interval=body.interval, now=same_period)
        return {"changed": True, "when": "now" if same_period else "next_renewal", "billing": summary(db, user["id"])}
    reference = f"dx_{secrets.token_hex(12)}"
    db.execute("""INSERT INTO payments (reference, user_id, email, plan, interval, amount, currency, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
               (reference, user["id"], user["email"], body.plan, body.interval, config.PRICES[key], body.currency, plans.now_ms()))
    customer = {"customer_id": sub["customer_ref"]} if sub and sub["customer_ref"] else {"email": user["email"], "name": user["name"]}
    try:
        data = bachs.create_checkout(
            currency=body.currency, product_id=product, amount_cents=None if product else config.PRICES[key],
            customer=customer, reference=reference,
            success_url=f"{config.PUBLIC_URL}/billing/callback", cancel_url=f"{config.PUBLIC_URL}/pricing?checkout=cancelled",
            metadata={"user_id": user["id"], "plan": body.plan, "interval": body.interval, "currency": body.currency},
        )
    except bachs.BachsError as e:
        db.execute("UPDATE payments SET status = 'failed' WHERE reference = ?", (reference,))
        return _fail(e)
    db.execute("UPDATE payments SET checkout_ref = ? WHERE reference = ?", (data.get("checkout_id"), reference))
    events.log(db, "billing.checkout", user["id"], plan=body.plan, interval=body.interval, currency=body.currency)
    return {"url": data.get("checkout_url"), "checkoutId": data.get("checkout_id")}


@router.get("/verify")
def verify(checkout_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Where Bachs sends the visitor back (?checkout_id=...): confirm it and switch the plan on."""
    row = db.execute("SELECT status FROM payments WHERE checkout_ref = ? AND user_id = ?", (checkout_id, user["id"])).fetchone()
    if not row:
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
    elif row["status"] == "failed":
        payment = "failed"
    return {"payment": payment, "billing": summary(db, user["id"])}


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
    if info["source"] == "trial":
        db.execute("UPDATE users SET trial_ends_at = ? WHERE id = ?", (plans.now_ms(), user["id"]))
        events.log(db, "billing.trial_ended", user["id"])
        return summary(db, user["id"])
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
    """Full refund of a payment made in the last REFUND_DAYS days. The plan ends now."""
    row = db.execute("SELECT * FROM payments WHERE reference = ? AND user_id = ?", (body.reference, user["id"])).fetchone()
    if not row or row["status"] != "success":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn’t find that payment.")
    if row["refund_status"] in ("pending", "processed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This payment has already been refunded.")
    if not row["paid_at"] or plans.now_ms() - row["paid_at"] > config.REFUND_DAYS * plans.DAY_MS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Refunds are available for {config.REFUND_DAYS} days after a payment. "
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
    billing.cancel_remote(db, user["id"], at_period_end=False, reason="Refunded")
    now = plans.now_ms()
    db.execute("UPDATE subscriptions SET status = 'cancelled', current_period_end = ?, updated_at = ? WHERE user_id = ?", (now, now, user["id"]))
    events.log(db, "billing.refund", user["id"], amount=row["amount"], currency=row["currency"])
    return summary(db, user["id"])
