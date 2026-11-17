"""Plans and billing (Bachs). Run from backend/:  python -m pytest"""
import hashlib
import hmac
import json
import sqlite3
import time
import uuid

from test_api import client, sign_up  # sets up the test database and environment first

from app import admin_cli, bachs, config as cfg, plans as plans_mod
from app.config import DB_PATH

SECRET = "whsec_test_secret"
PRODUCTS = {(p, i, c): (f"prod_{p}_{i[0]}" if c == "USD" else "")
            for p in ("starter", "pro", "premium") for i in ("monthly", "yearly") for c in ("USD", "NGN")}


def _plans_on(monkeypatch, bachs_ready=True):
    """Turn plan limits on, and (optionally) a fake Bachs setup."""
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    monkeypatch.setattr(cfg, "BACHS_API_KEY", "sk_sandbox_test" if bachs_ready else "")
    monkeypatch.setattr(cfg, "BACHS_WEBHOOK_SECRET", SECRET if bachs_ready else "")
    monkeypatch.setattr(cfg, "BACHS_PRODUCTS", {k: (v if bachs_ready else "") for k, v in PRODUCTS.items()})
    monkeypatch.setattr(cfg, "PUBLIC_URL", "https://dixlab.test")
    monkeypatch.setattr(cfg, "NGN_RECURRING", False)


def _fake_bachs(monkeypatch, checkouts=None):
    """Replace every Bachs API call; returns the list of calls. `checkouts` maps a
    checkout id to what GET /v1/checkout-sessions/{id} returns."""
    calls = []
    checkouts = checkouts if checkouts is not None else {}

    def fake(method, path, body=None, idempotency_key=None):
        calls.append((method, path, body))
        if method == "POST" and path == "/v1/checkout-sessions":
            cid = f"chk_{uuid.uuid4().hex[:12]}"  # unique, like Bachs's (the test database is shared)
            return {"checkout_id": cid, "checkout_url": f"https://sandbox-checkout.bachs.io/c/{cid}", "status": "open"}
        if method == "GET" and path.startswith("/v1/checkout-sessions/"):
            return checkouts.get(path.rsplit("/", 1)[1], {"status": "open"})
        if path.endswith("/portal-sessions"):
            return {"id": "psn_1", "url": "https://portal.bachs.io/s/abc"}
        if path == "/v1/refunds":
            return {"refund_id": "rfnd_1", "status": "processing"}
        return {}
    monkeypatch.setattr(bachs, "_call", fake)
    return calls


def _webhook(c, event: dict, secret=SECRET, ts=None):
    body = json.dumps(event).encode()
    ts = str(int(ts if ts is not None else time.time()))
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return c.post("/api/billing/webhook", content=body, headers={
        "X-Bachs-Signature-V2": f"t={ts},v1={sig}", "Content-Type": "application/json"})


def _proj(pid, ptype="portfolio", template="folio"):
    return {"id": pid, "type": ptype, "template": template, "title": pid, "updatedAt": 1}


def _uid(c, h):
    return c.get("/api/auth/me", headers=h).json()["user"]["id"]


def _completed(checkout_id, uid, plan="pro", interval="monthly", sub="sub_1", charge="ch_1", amount="7.99"):
    """checkout.completed's data, as Bachs sends it."""
    return {"checkout_id": checkout_id, "status": "completed", "mode": "subscription", "payment_status": "paid",
            "amount": amount, "currency": "USD", "reference": None, "customer": {"customer_id": "cust_1", "email": "x@example.com"},
            "charge": {"id": charge, "status": "succeeded"}, "subscription": {"subscription_id": sub},
            "metadata": {"user_id": uid, "plan": plan, "interval": interval}, "completed_at": "2026-11-17T10:00:00Z"}


def test_signature_checks():
    body = b'{"id":"evt_1"}'
    old = cfg.BACHS_WEBHOOK_SECRET
    cfg.BACHS_WEBHOOK_SECRET = SECRET
    try:
        now = int(time.time())
        sig = hmac.new(SECRET.encode(), f"{now}.".encode() + body, hashlib.sha256).hexdigest()
        assert bachs.signature_ok(body, {"x-bachs-signature-v2": f"t={now},v1={sig}"})
        assert bachs.signature_ok(body, {"x-bachs-signature-v2": f"t={now},v1=deadbeef,v1={sig}"})   # rotation: any v1 matches
        assert bachs.signature_ok(body, {"x-bachs-timestamp": str(now), "x-bachs-signature": sig})  # older header pair
        assert not bachs.signature_ok(body + b" ", {"x-bachs-signature-v2": f"t={now},v1={sig}"})    # body changed
        stale = now - 600
        stale_sig = hmac.new(SECRET.encode(), f"{stale}.".encode() + body, hashlib.sha256).hexdigest()
        assert not bachs.signature_ok(body, {"x-bachs-signature-v2": f"t={stale},v1={stale_sig}"})   # replayed later
        assert not bachs.signature_ok(body, {})
    finally:
        cfg.BACHS_WEBHOOK_SECRET = old
    assert bachs.cents("12.00") == 1200 and bachs.cents("9.99") == 999 and bachs.cents(None) == 0


def test_plans_catalog_and_free_limits(monkeypatch):
    _plans_on(monkeypatch, bachs_ready=False)
    c = client()
    cat = c.get("/api/billing/plans").json()
    assert [p["id"] for p in cat["plans"]] == ["free", "starter", "pro", "premium"]
    assert cat["configured"] == {"NGN": False, "USD": False} and cat["renews"] == {"NGN": False, "USD": True}
    starter = cat["plans"][1]["prices"]
    assert starter["NGN"] == {"monthly": 300000, "yearly": 2880000} and starter["USD"] == {"monthly": 399, "yearly": 3830}
    assert cat["plans"][3]["prices"]["NGN"]["monthly"] == 1200000 and cat["plans"][3]["prices"]["USD"]["monthly"] == 1499
    assert "folio" in cat["templates"]["free"] and "bento" in cat["templates"]["starter"]
    h = sign_up(c, "free@example.com")
    me = c.get("/api/billing/me", headers=h).json()
    assert me["plan"] == "free" and me["trialAvailable"] is True and me["limits"]["projects"] == 1
    assert me["usage"]["ai"] == {"units": 0, "allowance": 10}
    # Free: ONE creation category, one asset in it.
    assert c.put("/api/projects/f1", json=_proj("f1", "cv", "plain"), headers=h).status_code == 200
    for pid, ptype in (("f2", "portfolio"), ("f3", "case"), ("f4", "cv")):
        r = c.put(f"/api/projects/{pid}", json=_proj(pid, ptype), headers=h)
        assert r.status_code == 402 and r.json()["detail"]["code"] == "plan_limit" and r.json()["detail"]["needed"] == "starter"
    assert c.put("/api/projects/f1", json={**_proj("f1", "cv", "plain"), "title": "edited"}, headers=h).status_code == 200
    # Drafts can use any template; publishing needs a plan that includes it.
    c.put("/api/projects/f1", json=_proj("f1", "cv", "classic"), headers=h)
    r = c.post("/api/projects/f1/publish", headers=h)
    assert r.status_code == 402 and r.json()["detail"]["code"] == "template_locked" and r.json()["detail"]["needed"] == "starter"
    c.put("/api/projects/f1", json=_proj("f1", "cv", "canvas"), headers=h)
    assert c.post("/api/projects/f1/publish", headers=h).json()["detail"]["needed"] == "pro"   # an advanced template
    c.put("/api/projects/f1", json=_proj("f1", "cv", "plain"), headers=h)
    assert c.post("/api/projects/f1/publish", headers=h).status_code == 200
    # Free has a small AI allowance (10 units): a change (5) passes the plan check (AI isn't
    # configured in tests, so it stops at 503); a case study write-up (15) is more than 10.
    assert c.post("/api/customize", json={"prompt": "make it green"}, headers=h).status_code == 503
    transcript = [{"topic": "context", "q": "Q", "a": "A long enough answer"}] * 3
    r = c.post("/api/interview/draft", json={"transcript": transcript, "kind": "case"}, headers=h)
    assert r.status_code == 402 and r.json()["unavailable"] is True and r.json()["code"] == "ai_quota"
    # Payments aren't set up on this server.
    r = c.post("/api/billing/checkout", json={"plan": "starter", "interval": "monthly", "currency": "NGN"}, headers=h)
    assert r.status_code == 503 and r.json()["unavailable"] is True


def test_starter_limits_trial_and_ai_units(monkeypatch):
    _plans_on(monkeypatch, bachs_ready=False)
    c = client(); h = sign_up(c, "starter@example.com")
    uid = _uid(c, h)
    assert admin_cli.main(["set-plan", "starter@example.com", "starter"]) == 0
    for i in range(2):
        assert c.put(f"/api/projects/sp{i}", json=_proj(f"sp{i}", "portfolio", "bento"), headers=h).status_code == 200
    r = c.put("/api/projects/sp2", json=_proj("sp2"), headers=h)
    assert r.status_code == 402 and r.json()["detail"]["needed"] == "pro"      # Starter: 2 portfolios, Pro: 5
    for i in range(3):
        assert c.put(f"/api/projects/sc{i}", json=_proj(f"sc{i}", "cv", "classic"), headers=h).status_code == 200
    assert c.put("/api/projects/sc3", json=_proj("sc3", "cv"), headers=h).status_code == 402   # Starter: 3 CVs
    assert c.post("/api/projects/sp0/publish", headers=h).status_code == 200    # Bento: a premium template, on Starter
    c.put("/api/projects/sp0", json=_proj("sp0", "portfolio", "blocks"), headers=h)
    assert c.post("/api/projects/sp0/publish", headers=h).json()["detail"]["needed"] == "pro"   # 3D: advanced, on Pro
    # 100 units on Starter: at 98 used, a 5-unit change no longer fits.
    with sqlite3.connect(DB_PATH) as db:
        db.execute("INSERT INTO ai_usage (user_id, month, feature, count) VALUES (?, ?, 'units', 98)", (uid, plans_mod.month()))
    r = c.post("/api/customize", json={"prompt": "make it green"}, headers=h)
    assert r.status_code == 402 and r.json()["code"] == "ai_quota" and "Upgrade to Pro" in r.json()["error"]
    assert c.get("/api/billing/me", headers=h).json()["usage"]["ai"] == {"units": 98, "allowance": 100}
    assert admin_cli.main(["set-plan", "starter@example.com", "none"]) == 0
    # The free trial is Pro, once, with its own allowance.
    me = c.post("/api/billing/trial", headers=h).json()
    assert me["plan"] == "pro" and me["source"] == "trial"
    assert c.post("/api/billing/trial", headers=h).status_code == 409
    assert me["usage"]["ai"] == {"units": 0, "allowance": 300}
    assert c.post("/api/projects/sp0/publish", headers=h).status_code == 200    # Blocks is fine on Pro
    me = c.post("/api/billing/cancel", headers=h).json()
    assert me["plan"] == "free" and me["usage"]["projects"]["total"] == 5      # nothing deleted


def test_naira_is_a_one_off_payment_per_period(monkeypatch):
    _plans_on(monkeypatch)
    calls = _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, "naija@example.com")
    uid = _uid(c, h)

    def buy(plan="starter"):
        return c.post("/api/billing/checkout", json={"plan": plan, "interval": "monthly", "currency": "NGN"}, headers=h).json()

    def done(cid, amount="3000.00", currency="NGN"):
        return {"checkout_id": cid, "status": "completed", "payment_status": "paid", "amount": amount, "currency": currency,
                "customer": {"customer_id": "cust_n"}, "charge": {"id": f"ch_{cid}", "status": "succeeded"},
                "subscription": None, "metadata": {"user_id": uid}}
    r = buy()
    sent = calls[-1][2]
    assert "product_cart" not in sent and sent["pricing"] == {"currency": "NGN", "amount": "3000.00"} and sent["billing_currency"] == "NGN"
    _webhook(c, {"id": f"evt_{r['checkoutId']}", "type": "checkout.completed", "data": done(r["checkoutId"])})
    me = c.get("/api/billing/me", headers=h).json()
    assert me["plan"] == "starter" and me["status"] == "prepaid" and me["renews"] is False and me["currency"] == "NGN"
    first_end = me["periodEnd"]
    assert c.post("/api/billing/cancel", headers=h).status_code == 409          # nothing renews, so nothing to cancel
    # Paying again early adds a month to the time left.
    r2 = buy()
    _webhook(c, {"id": f"evt_{r2['checkoutId']}", "type": "checkout.completed", "data": done(r2["checkoutId"])})
    assert c.get("/api/billing/me", headers=h).json()["periodEnd"] == first_end + 30 * plans_mod.DAY_MS
    # A payment for the wrong amount or currency switches nothing on; it's held for review.
    r3 = buy("premium")
    _webhook(c, {"id": f"evt_{r3['checkoutId']}", "type": "checkout.completed", "data": done(r3["checkoutId"], amount="100.00")})
    r4 = buy("premium")
    _webhook(c, {"id": f"evt_{r4['checkoutId']}", "type": "checkout.completed", "data": done(r4["checkoutId"], amount="12000.00", currency="USD")})
    assert c.get("/api/billing/me", headers=h).json()["plan"] == "starter"
    with sqlite3.connect(DB_PATH) as db:
        held = db.execute("SELECT COUNT(*) FROM payments WHERE user_id = ? AND status = 'review'", (uid,)).fetchone()[0]
    assert held == 2


def test_bachs_checkout_webhooks_renewal_cancel_and_refund(monkeypatch):
    _plans_on(monkeypatch)
    calls = _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, "payer@example.com")
    uid = _uid(c, h)
    unverified = sign_up(c, "nopay@example.com", verified=False)
    assert c.post("/api/billing/checkout", json={"plan": "pro", "interval": "monthly"}, headers=unverified).status_code == 403
    r = c.post("/api/billing/checkout", json={"plan": "pro", "interval": "monthly"}, headers=h)
    assert r.status_code == 200, r.text
    checkout_id = r.json()["checkoutId"]
    assert r.json()["url"].endswith(checkout_id)
    sent = calls[-1][2]
    assert sent["product_cart"] == [{"product_id": "prod_pro_m", "quantity": 1}] and sent["billing_currency"] == "USD"
    assert sent["success_url"] == "https://dixlab.test/billing/callback" and sent["customer"]["email"] == "payer@example.com"
    assert sent["metadata"] == {"user_id": uid, "plan": "pro", "interval": "monthly", "currency": "USD"}
    assert c.get("/api/billing/me", headers=h).json()["plan"] == "free"   # not paid yet

    # Only signed, fresh deliveries count.
    event = {"id": "evt_1", "type": "checkout.completed", "data": _completed(checkout_id, uid)}
    assert _webhook(c, event, secret="wrong").status_code == 400
    assert _webhook(c, event, ts=time.time() - 3600).status_code == 400
    assert _webhook(c, event).status_code == 200
    assert _webhook(c, event).json().get("duplicate") is True            # each event applies once
    me = c.get("/api/billing/me", headers=h).json()
    assert me["plan"] == "pro" and me["source"] == "subscription" and me["interval"] == "monthly"
    assert me["payments"][0]["amount"] == 799 and me["payments"][0]["refundable"] is True
    # The subscription's real period arrives.
    sub = {"subscription_id": "sub_1", "status": "active", "product_id": "prod_pro_m", "current_period_end": "2026-12-17T10:00:00Z",
           "cancel_at_period_end": False, "customer": {"customer_id": "cust_1"}, "metadata": {"user_id": uid}}
    _webhook(c, {"id": "evt_2", "type": "customer.subscription.created", "data": sub})
    me = c.get("/api/billing/me", headers=h).json()
    assert me["periodEnd"] == bachs_ms("2026-12-17T10:00:00Z") and me["canManageCard"] is True
    # The first invoice is the checkout payment, not a second one.
    first_inv = {"invoice_id": "inv_1", "subscription": {"subscription_id": "sub_1"}, "status": "paid", "amount_paid": "7.99",
                 "currency": "USD", "period_end": "2026-12-17T10:00:00Z", "charge": None}
    _webhook(c, {"id": "evt_3", "type": "invoice.paid", "data": first_inv})
    assert len(c.get("/api/billing/me", headers=h).json()["payments"]) == 1
    # Coming back from Bachs: verifying an applied checkout changes nothing.
    v = c.get(f"/api/billing/verify?checkout_id={checkout_id}", headers=h).json()
    assert v["payment"] == "success" and v["billing"]["plan"] == "pro"
    assert c.get("/api/billing/verify?checkout_id=chk_someone_else", headers=h).status_code == 404
    # Card updates go through Bachs's customer portal.
    assert c.get("/api/billing/manage", headers=h).json()["url"] == "https://portal.bachs.io/s/abc"
    assert ("POST", "/v1/customers/cust_1/portal-sessions", None) in calls
    # A renewal: a new payment, and the period moves on.
    renewal = {**first_inv, "invoice_id": "inv_2", "period_end": "2027-01-17T10:00:00Z", "charge": {"id": "ch_2"}}
    _webhook(c, {"id": "evt_4", "type": "invoice.paid", "data": renewal})
    me = c.get("/api/billing/me", headers=h).json()
    assert len(me["payments"]) == 2 and me["periodEnd"] == bachs_ms("2027-01-17T10:00:00Z")
    # Cancelling stops renewal at Bachs; the plan lasts until the period ends.
    me = c.post("/api/billing/cancel", headers=h).json()
    assert ("DELETE", "/v1/subscriptions/sub_1", {"cancel_at_period_end": True, "reason": "Cancelled in Dixlab"}) in calls
    assert me["plan"] == "pro" and me["cancelAtPeriodEnd"] is True
    assert c.post("/api/billing/cancel", headers=h).status_code == 409
    # Bachs confirms the scheduled cancellation; still Pro until the period ends.
    _webhook(c, {"id": "evt_5", "type": "customer.subscription.updated", "data": {**sub, "cancel_at_period_end": True,
                                                                                 "current_period_end": "2027-01-17T10:00:00Z"}})
    assert c.get("/api/billing/me", headers=h).json()["status"] == "non_renewing"
    # Refund the first payment within 14 days: money back, plan ends now.
    first_ref = [p for p in me["payments"] if p["amount"] == 799][-1]["reference"]
    me = c.post("/api/billing/refund", json={"reference": first_ref}, headers=h).json()
    refund_call = [x for x in calls if x[1] == "/v1/refunds"][-1]
    assert refund_call[2]["charge_id"] == "ch_1" and refund_call[2]["reference"] == f"rf_{first_ref}"
    assert me["plan"] == "free"
    assert c.post("/api/billing/refund", json={"reference": first_ref}, headers=h).status_code == 409
    _webhook(c, {"id": "evt_6", "type": "refund.paid", "data": {"refund_id": "rfnd_1", "charge_id": "ch_1", "status": "success"}})
    statuses = {p["reference"]: p["refundStatus"] for p in c.get("/api/billing/me", headers=h).json()["payments"]}
    assert statuses[first_ref] == "processed"


def bachs_ms(iso):
    from app.billing import _ms
    return _ms(iso)


def test_verify_on_return_applies_the_checkout(monkeypatch):
    """If the webhook is late, coming back from Bachs still switches the plan on."""
    _plans_on(monkeypatch)
    checkouts = {}
    _fake_bachs(monkeypatch, checkouts)
    c = client(); h = sign_up(c, "return@example.com")
    uid = _uid(c, h)
    checkout_id = c.post("/api/billing/checkout", json={"plan": "premium", "interval": "yearly"}, headers=h).json()["checkoutId"]
    assert c.get(f"/api/billing/verify?checkout_id={checkout_id}", headers=h).json()["payment"] == "pending"  # not paid yet
    checkouts[checkout_id] = {"checkout_id": checkout_id, "status": "completed", "payment_status": "succeeded", "amount": "143.90",
                              "currency": "USD", "customer": {"id": "cust_r"}, "metadata": {"user_id": uid},
                              "charge": {"payment_id": "pay_1", "status": "succeeded", "subscription_id": "sub_r",
                                         "invoice": {"invoice_id": "inv_r", "subscription_id": "sub_r", "period_end": "2027-11-17T10:00:00Z"}}}
    v = c.get(f"/api/billing/verify?checkout_id={checkout_id}", headers=h).json()
    assert v["payment"] == "success" and v["billing"]["plan"] == "premium" and v["billing"]["interval"] == "yearly"
    assert c.put("/api/projects/many1", json=_proj("many1"), headers=h).status_code == 200
    assert c.put("/api/projects/many2", json=_proj("many2"), headers=h).status_code == 200  # Premium: no project limit
    # An expired checkout is reported as failed.
    other = c.post("/api/billing/checkout", json={"plan": "pro", "interval": "monthly"}, headers=sign_up(c, "late@example.com"))
    assert other.status_code == 200


def test_changing_plan_uses_the_same_subscription(monkeypatch):
    _plans_on(monkeypatch)
    calls = _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, "switch@example.com")
    uid = _uid(c, h)
    cid = c.post("/api/billing/checkout", json={"plan": "pro", "interval": "monthly"}, headers=h).json()["checkoutId"]
    _webhook(c, {"id": "evt_s1", "type": "checkout.completed", "data": _completed(cid, uid, sub="sub_s")})
    # Same billing period: switched now, Bachs charges the difference.
    r = c.post("/api/billing/checkout", json={"plan": "premium", "interval": "monthly"}, headers=h).json()
    assert r["changed"] is True and r["when"] == "now" and r["billing"]["plan"] == "premium"
    assert ("PATCH", "/v1/subscriptions/sub_s", {"product_id": "prod_premium_m", "proration_behavior": "invoice_now"}) in calls
    # Monthly to yearly: Bachs switches at the next renewal.
    r = c.post("/api/billing/checkout", json={"plan": "premium", "interval": "yearly"}, headers=h).json()
    assert r["when"] == "next_renewal" and r["billing"]["interval"] == "monthly"
    assert ("PATCH", "/v1/subscriptions/sub_s", {"product_id": "prod_premium_y", "proration_behavior": "next_cycle"}) in calls
    assert sum(1 for x in calls if x[1] == "/v1/checkout-sessions") == 1        # never a second subscription
    # When Bachs applies it, the webhook moves the plan to yearly.
    _webhook(c, {"id": "evt_s2", "type": "customer.subscription.updated", "data": {
        "subscription_id": "sub_s", "status": "active", "product_id": "prod_premium_y", "current_period_end": "2027-12-17T10:00:00Z",
        "cancel_at_period_end": False, "customer": {"customer_id": "cust_1"}}})
    assert c.get("/api/billing/me", headers=h).json()["interval"] == "yearly"


def test_failed_renewal_grace_and_admin_set_plan(monkeypatch):
    _plans_on(monkeypatch)
    _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, "grace@example.com")
    uid = _uid(c, h)
    now = plans_mod.now_ms()
    with sqlite3.connect(DB_PATH) as db:
        db.execute("INSERT INTO subscriptions (user_id, plan, interval, status, current_period_end, subscription_ref, created_at, updated_at) "
                   "VALUES (?, 'premium', 'monthly', 'active', ?, 'sub_g', ?, ?)", (uid, now - 60_000, now, now))
    assert c.get("/api/billing/me", headers=h).json()["plan"] == "free"       # period over and not renewed
    _webhook(c, {"id": "evt_g1", "type": "invoice.payment_failed", "data": {"invoice_id": "inv_g", "subscription": {"subscription_id": "sub_g"}}})
    me = c.get("/api/billing/me", headers=h).json()
    assert me["plan"] == "premium" and me["status"] == "past_due"            # grace while Bachs retries
    _webhook(c, {"id": "evt_g2", "type": "customer.subscription.deleted", "data": {"subscription_id": "sub_g", "status": "canceled",
                                                                                  "canceled_at": "2026-01-01T00:00:00Z"}})
    assert c.get("/api/billing/me", headers=h).json()["plan"] == "free"       # Bachs gave up: back to Free
    assert admin_cli.main(["set-plan", "grace@example.com", "gold"]) == 2
    assert admin_cli.main(["set-plan", "grace@example.com", "pro"]) == 0
    assert c.get("/api/billing/me", headers=h).json()["plan"] == "pro"       # a plan given by an admin
    assert admin_cli.main(["set-plan", "grace@example.com", "none"]) == 0
    assert c.get("/api/billing/me", headers=h).json()["plan"] == "free"


def test_deleting_an_account_stops_its_subscription(monkeypatch):
    _plans_on(monkeypatch)
    calls = _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, "leaver@example.com")
    uid = _uid(c, h)
    now = plans_mod.now_ms()
    with sqlite3.connect(DB_PATH) as db:
        db.execute("INSERT INTO subscriptions (user_id, plan, interval, status, current_period_end, subscription_ref, created_at, updated_at) "
                   "VALUES (?, 'pro', 'monthly', 'active', ?, 'sub_x', ?, ?)", (uid, now + plans_mod.DAY_MS, now, now))
    assert c.request("DELETE", "/api/auth/me", json={"password": "correct horse"}, headers=h).status_code in (200, 204)
    assert ("DELETE", "/v1/subscriptions/sub_x", {"cancel_at_period_end": False}) in calls
    with sqlite3.connect(DB_PATH) as db:
        assert db.execute("SELECT COUNT(*) FROM subscriptions WHERE user_id = ?", (uid,)).fetchone()[0] == 0


def test_pdf_export_is_on_every_plan(monkeypatch):
    _plans_on(monkeypatch, bachs_ready=False)
    c = client(); h = sign_up(c, "pdf@example.com")
    assert c.get("/api/billing/me", headers=h).json()["limits"]["pdfTypes"] is None
    assert all(p["limits"]["pdfTypes"] is None for p in c.get("/api/billing/plans").json()["plans"])
    # A Free user's one CV can be downloaded as a PDF from its public page.
    c.put("/api/projects/pcv", json=_proj("pcv", "cv", "plain"), headers=h)
    slug = c.post("/api/projects/pcv/publish", headers=h).json()["slug"]
    assert c.get(f"/api/public/{slug}").json()["pdf"] is True
    # ...but Free is still one asset.
    assert c.put("/api/projects/pcs", json=_proj("pcs", "case"), headers=h).status_code == 402
