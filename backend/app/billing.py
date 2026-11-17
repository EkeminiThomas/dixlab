"""Turning Bachs checkouts, subscriptions and invoices into an account's plan.

The flow: checkout creates a pending payment and sends the visitor to Bachs's
hosted checkout. When they pay, Bachs sends `checkout.completed` (and redirects
back, where we read the same checkout); either one switches the plan on, and
applying it twice changes nothing. Afterwards `customer.subscription.*` keeps
the plan, status and period in step, and `invoice.paid` records each renewal.
Webhooks are the source of truth; the redirect only makes it instant."""
import json
import logging
import sqlite3
from datetime import datetime

from . import bachs, config, events
from .plans import DAY_MS, INTERVAL_DAYS, PAID, now_ms

log = logging.getLogger("dixlab.billing")
PAID_STATES = {"paid", "succeeded", "accepted", "overpaid", "no_payment_required"}


def plan_for_product(product_id: str | None) -> tuple[str, str, str] | None:
    """(plan, interval, currency) of a Bachs product."""
    for key, value in config.BACHS_PRODUCTS.items():
        if product_id and value == product_id:
            return key
    return None


def _ms(iso) -> int | None:
    if not iso:
        return None
    try:
        return int(datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return None


def _meta(data: dict) -> dict:
    meta = data.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except ValueError:
            meta = {}
    return meta if isinstance(meta, dict) else {}


def _customer_id(data: dict) -> str | None:
    c = data.get("customer") or {}
    return c.get("customer_id") or c.get("id") if isinstance(c, dict) else None


def _find_user(db: sqlite3.Connection, data: dict) -> str | None:
    uid = _meta(data).get("user_id")
    if uid and db.execute("SELECT 1 FROM users WHERE id = ?", (uid,)).fetchone():
        return uid
    cid = _customer_id(data)
    if cid:
        row = db.execute("SELECT user_id FROM subscriptions WHERE customer_ref = ?", (cid,)).fetchone()
        if row:
            return row["user_id"]
    c = data.get("customer") or {}
    email = (c.get("email") or "").strip() if isinstance(c, dict) else ""
    if email:
        row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            return row["id"]
    return None


def _save_subscription(db: sqlite3.Connection, user_id: str, plan: str, interval: str, status: str,
                       period_end: int | None, customer_ref: str | None = None, subscription_ref: str | None = None,
                       currency: str | None = None) -> None:
    now = now_ms()
    db.execute("""INSERT INTO subscriptions (user_id, plan, interval, currency, status, current_period_end, customer_ref, subscription_ref,
                    created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, interval = excluded.interval, status = excluded.status,
                    currency = COALESCE(excluded.currency, subscriptions.currency),
                    current_period_end = COALESCE(excluded.current_period_end, subscriptions.current_period_end),
                    customer_ref = COALESCE(excluded.customer_ref, subscriptions.customer_ref),
                    subscription_ref = excluded.subscription_ref,
                    updated_at = excluded.updated_at""",
               (user_id, plan, interval, currency, status, period_end, customer_ref, subscription_ref, now, now))


def cancel_remote(db: sqlite3.Connection, user_id: str, at_period_end: bool = False, reason: str | None = None) -> bool:
    """Stop Bachs charging this account. Best effort: True if done (or nothing to do)."""
    sub = db.execute("SELECT subscription_ref, status FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
    if not sub or not sub["subscription_ref"] or not config.BACHS_API_KEY or sub["status"] == "cancelled":
        return True
    try:
        bachs.cancel_subscription(sub["subscription_ref"], at_period_end=at_period_end, reason=reason)
        return True
    except bachs.BachsError as e:
        log.warning("Couldn't cancel the Bachs subscription of %s: %s", user_id, e)
        return False


def apply_checkout(db: sqlite3.Connection, data: dict) -> bool:
    """A finished checkout (the webhook's data, or GET /checkout-sessions/{id}). True if it changed anything."""
    checkout_id = data.get("checkout_id")
    charge = data.get("charge") or {}
    paid = data.get("status") == "completed" and (data.get("payment_status") in PAID_STATES or charge.get("status") in PAID_STATES)
    if not checkout_id or not paid:
        return False
    row = db.execute("SELECT * FROM payments WHERE checkout_ref = ?", (checkout_id,)).fetchone()
    if not row and data.get("reference"):
        row = db.execute("SELECT * FROM payments WHERE reference = ?", (data["reference"],)).fetchone()
    meta = _meta(data)
    plan, interval = (row["plan"], row["interval"]) if row else (meta.get("plan"), meta.get("interval"))
    user_id = row["user_id"] if row else _find_user(db, data)
    if plan not in PAID or interval not in INTERVAL_DAYS or not user_id:
        log.warning("Bachs checkout %s doesn't match a Dixlab plan payment", checkout_id)
        return False
    if row and row["status"] in ("success", "review"):
        return False  # already applied (or held for a person to check)
    invoice = charge.get("invoice") or {}
    sub_ref = (data.get("subscription") or {}).get("subscription_id") or charge.get("subscription_id") or invoice.get("subscription_id")
    charge_ref = charge.get("id") or charge.get("payment_id")
    paid_at = _ms(data.get("completed_at")) or now_ms()
    amount = bachs.cents(data.get("amount") or charge.get("amount") or 0)
    currency = (data.get("currency") or charge.get("currency") or (row["currency"] if row else None) or "").upper()
    # The payment must be what we asked for: the right currency and at least the price.
    if row and ((row["currency"] and currency and currency != row["currency"]) or (amount and amount < row["amount"])):
        db.execute("UPDATE payments SET status = 'review', charge_ref = ? WHERE reference = ?", (charge_ref, row["reference"]))
        events.log(db, "billing.mismatch", user_id, expected=row["amount"], paid=amount, currency=currency, expected_currency=row["currency"])
        log.warning("Bachs checkout %s paid %s %s, expected %s %s: held for review", checkout_id, amount, currency, row["amount"], row["currency"])
        return False
    if row:
        db.execute("""UPDATE payments SET status = 'success', paid_at = ?, amount = COALESCE(NULLIF(?, 0), amount),
                        currency = COALESCE(?, currency), charge_ref = ?, subscription_ref = ?, invoice_ref = ? WHERE reference = ?""",
                   (paid_at, amount, data.get("currency"), charge_ref, sub_ref, invoice.get("invoice_id"), row["reference"]))
    else:
        db.execute("""INSERT INTO payments (reference, user_id, plan, interval, amount, currency, status, checkout_ref, charge_ref,
                        subscription_ref, invoice_ref, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, ?)""",
                   (data.get("reference") or checkout_id, user_id, plan, interval, amount, data.get("currency"), checkout_id,
                    charge_ref, sub_ref, invoice.get("invoice_id"), paid_at, now_ms()))
    old = db.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
    if old and old["subscription_ref"] and old["subscription_ref"] != sub_ref and old["status"] not in ("cancelled", "prepaid"):
        cancel_remote(db, user_id, reason="Switched to a new Dixlab plan")  # never charge two subscriptions
    length = INTERVAL_DAYS[interval] * DAY_MS
    if sub_ref:  # a renewing subscription (USD)
        status, period_end = "active", _ms(invoice.get("period_end")) or paid_at + length
    else:        # a one-off payment for one period (NGN): renewing it early adds to the time left
        status = "prepaid"
        same = old and (old["plan"], old["interval"]) == (plan, interval) and (old["current_period_end"] or 0) > paid_at
        period_end = (old["current_period_end"] if same else paid_at) + length
    _save_subscription(db, user_id, plan, interval, status, period_end, _customer_id(data), sub_ref, currency or None)
    # Paying ends any trial, and uses up the one trial.
    db.execute("UPDATE users SET trial_ends_at = NULL, trial_used_at = COALESCE(trial_used_at, ?) WHERE id = ?", (now_ms(), user_id))
    events.log(db, "billing.paid", user_id, plan=plan, interval=interval, amount=amount, currency=currency)
    return True


def apply_subscription(db: sqlite3.Connection, sub: dict, deleted: bool = False) -> bool:
    """customer.subscription.created / .updated / .deleted: keep plan, status and period in step."""
    sub_ref = sub.get("subscription_id") or sub.get("id")
    if not sub_ref:
        return False
    row = db.execute("SELECT * FROM subscriptions WHERE subscription_ref = ?", (sub_ref,)).fetchone()
    user_id = row["user_id"] if row else _find_user(db, sub)
    if not user_id:
        return False
    current = row or db.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
    if current and current["subscription_ref"] and current["subscription_ref"] != sub_ref:
        return False  # an old subscription (e.g. the one replaced by a plan switch)
    product = sub.get("product_id") or (sub.get("product") or {}).get("id")
    found = plan_for_product(product)
    plan_interval = found[:2] if found else ((current["plan"], current["interval"]) if current else None)
    currency = found[2] if found else (current["currency"] if current else None)
    if not plan_interval:
        return False
    raw = "canceled" if deleted else (sub.get("status") or "active")
    if raw in ("canceled", "cancelled", "paused"):
        status = "cancelled"
    elif raw in ("past_due", "unpaid"):
        status = "past_due"
    else:
        status = "non_renewing" if sub.get("cancel_at_period_end") else "active"
    period_end = _ms(sub.get("current_period_end")) or (current["current_period_end"] if current else None)
    if status == "active" and current and current["status"] == "non_renewing" and not current["subscription_ref"]:
        # They cancelled in Dixlab before Bachs told us the subscription's id: cancel it there now.
        try:
            bachs.cancel_subscription(sub_ref, at_period_end=True, reason="Cancelled in Dixlab")
        except bachs.BachsError as e:
            log.warning("Couldn't cancel Bachs subscription %s: %s", sub_ref, e)
        status = "non_renewing"
    if status == "cancelled":
        ended = _ms(sub.get("canceled_at")) or now_ms()
        period_end = min(period_end or ended, ended) if not sub.get("cancel_at_period_end") else period_end
    _save_subscription(db, user_id, *plan_interval, status, period_end, _customer_id(sub), sub_ref, currency)
    if not current or current["status"] != status or (current["plan"], current["interval"]) != plan_interval:
        events.log(db, f"billing.subscription_{status}", user_id, plan=plan_interval[0], interval=plan_interval[1])
    return True


def apply_invoice_paid(db: sqlite3.Connection, inv: dict) -> bool:
    """A paid invoice: the first payment (already recorded at checkout) or a renewal."""
    sub_ref = (inv.get("subscription") or {}).get("subscription_id")
    invoice_ref = inv.get("invoice_id")
    sub = db.execute("SELECT * FROM subscriptions WHERE subscription_ref = ?", (sub_ref,)).fetchone() if sub_ref else None
    if not sub or not invoice_ref:
        return False
    if db.execute("SELECT 1 FROM payments WHERE invoice_ref = ?", (invoice_ref,)).fetchone():
        return False
    charge = inv.get("charge") or {}
    charge_ref = charge.get("id") or charge.get("payment_id") if isinstance(charge, dict) else None
    amount = bachs.cents(inv.get("amount_paid") or inv.get("total") or 0)
    first = db.execute("SELECT reference FROM payments WHERE subscription_ref = ? AND invoice_ref IS NULL AND status = 'success'",
                       (sub_ref,)).fetchone()
    now = now_ms()
    if first:
        db.execute("UPDATE payments SET invoice_ref = ?, charge_ref = COALESCE(charge_ref, ?) WHERE reference = ?",
                   (invoice_ref, charge_ref, first["reference"]))
    else:
        db.execute("""INSERT INTO payments (reference, user_id, plan, interval, amount, currency, status, charge_ref, invoice_ref,
                        subscription_ref, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?)""",
                   (invoice_ref, sub["user_id"], sub["plan"], sub["interval"], amount, inv.get("currency"), charge_ref,
                    invoice_ref, sub_ref, now, now))
        events.log(db, "billing.renewed", sub["user_id"], plan=sub["plan"], amount=amount, currency=inv.get("currency"))
    period_end = _ms(inv.get("period_end"))
    status = sub["status"] if sub["status"] in ("non_renewing",) else "active"
    db.execute("UPDATE subscriptions SET status = ?, current_period_end = MAX(COALESCE(current_period_end, 0), COALESCE(?, 0)), updated_at = ? "
               "WHERE user_id = ?", (status, period_end, now, sub["user_id"]))
    return True


def apply_invoice_failed(db: sqlite3.Connection, inv: dict) -> bool:
    sub_ref = (inv.get("subscription") or {}).get("subscription_id")
    if not sub_ref:
        return False
    row = db.execute("SELECT user_id FROM subscriptions WHERE subscription_ref = ?", (sub_ref,)).fetchone()
    if not row:
        return False
    db.execute("UPDATE subscriptions SET status = 'past_due', updated_at = ? WHERE user_id = ?", (now_ms(), row["user_id"]))
    events.log(db, "billing.payment_failed", row["user_id"])
    return True


def apply_refund(db: sqlite3.Connection, data: dict, ok: bool) -> bool:
    charge_ref = data.get("charge_id")
    if not charge_ref:
        return False
    return db.execute("UPDATE payments SET refund_status = ? WHERE charge_ref = ?", ("processed" if ok else "failed", charge_ref)).rowcount > 0


def handle_event(db: sqlite3.Connection, event: dict) -> bool:
    kind = event.get("type") or ""
    data = event.get("data") or {}
    if kind == "checkout.completed":
        return apply_checkout(db, data)
    if kind in ("customer.subscription.created", "customer.subscription.updated"):
        return apply_subscription(db, data)
    if kind == "customer.subscription.deleted":
        return apply_subscription(db, data, deleted=True)
    if kind == "invoice.paid":
        return apply_invoice_paid(db, data)
    if kind == "invoice.payment_failed":
        return apply_invoice_failed(db, data)
    if kind in ("refund.paid", "refund.failed"):
        return apply_refund(db, data, ok=kind == "refund.paid")
    return False
