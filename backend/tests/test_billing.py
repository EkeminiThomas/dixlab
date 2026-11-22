"""Credits, unlocks and billing (Bachs). Run from backend/:  python -m pytest"""
import hashlib
import hmac
import json
import sqlite3
import time
import uuid

from test_api import client, sign_up  # sets up the test database and environment first

from app.admin import cli as admin_cli
from app import bachs, config as cfg, plans as plans_mod
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


def _pack_done(cid, uid, amount, currency="USD", ref=None, pack="m"):
    """checkout.completed for a credit pack, as Bachs sends it."""
    return {"checkout_id": cid, "status": "completed", "payment_status": "paid", "amount": amount, "currency": currency,
            "reference": ref, "customer": {"customer_id": "cust_c"}, "charge": {"id": f"ch_{cid}", "status": "succeeded"},
            "subscription": None, "metadata": {"user_id": uid, "plan": "credits", "interval": pack}}


def test_catalog_welcome_credits_and_free_limits(monkeypatch):
    _plans_on(monkeypatch, bachs_ready=False)
    c = client()
    cat = c.get("/api/billing/plans").json()
    assert [p["id"] for p in cat["packs"]] == ["s", "m", "l", "xl"]
    assert cat["packs"][1] == {"id": "m", "credits": 500, "prices": {"NGN": 750000, "USD": 900}}
    assert {u["id"]: u["credits"] for u in cat["unlocks"]}["templates"] == 300 and cat["welcome"] == 30
    assert cat["aiCosts"]["assist_tailor_cv"] == 20 and "interview_next" not in cat["aiCosts"]
    assert cat["configured"] == {"NGN": False, "USD": False} and "folio" in cat["freeTemplates"]
    h = sign_up(c, "free@example.com")
    me = c.get("/api/billing/me", headers=h).json()
    assert me["credits"] == 30 and me["limits"]["projects"] == 1 and me["legacy"] is None    # free starting credits
    assert not any(me["features"].values()) and me["history"][0]["reason"] == "welcome"
    assert c.get("/api/billing/me", headers=h).json()["credits"] == 30                       # given once only
    # One project to start; room for more is an unlock you keep.
    assert c.put("/api/projects/f1", json=_proj("f1", "cv", "plain"), headers=h).status_code == 200
    r = c.put("/api/projects/f2", json=_proj("f2", "case"), headers=h)
    assert r.status_code == 402 and r.json()["detail"]["code"] == "unlock_needed" and r.json()["detail"]["feature"] == "project"
    assert c.put("/api/projects/f1", json={**_proj("f1", "cv", "plain"), "title": "edited"}, headers=h).status_code == 200
    # Drafts can use any template; publishing with a premium one needs the unlock.
    c.put("/api/projects/f1", json=_proj("f1", "cv", "classic"), headers=h)
    r = c.post("/api/projects/f1/publish", headers=h)
    assert r.status_code == 402 and r.json()["detail"]["feature"] == "templates" and r.json()["detail"]["balance"] == 30
    c.put("/api/projects/f1", json=_proj("f1", "cv", "plain"), headers=h)
    assert c.post("/api/projects/f1/publish", headers=h).status_code == 200
    # AI checks credits first (AI isn't configured in tests, so a change that fits stops at 503).
    assert c.post("/api/customize", json={"prompt": "make it green"}, headers=h).status_code == 503
    admin_cli.main(["credits", "free@example.com", "-20"])
    transcript = [{"topic": "context", "q": "Q", "a": "A long enough answer"}] * 3
    r = c.post("/api/interview/draft", json={"transcript": transcript, "kind": "case"}, headers=h)
    assert r.status_code == 402 and r.json()["unavailable"] is True and r.json()["code"] == "ai_credits"   # 15 > 10 left
    # Payments aren't set up on this server.
    r = c.post("/api/billing/checkout", json={"pack": "s", "currency": "NGN"}, headers=h)
    assert r.status_code == 503 and r.json()["unavailable"] is True
    assert c.post("/api/billing/checkout", json={"pack": "huge"}, headers=h).status_code == 404


def test_unlocks_are_bought_once_and_kept(monkeypatch):
    _plans_on(monkeypatch, bachs_ready=False)
    c = client(); h = sign_up(c, "unlock@example.com")
    admin_cli.main(["credits", "unlock@example.com", "570"])                 # 600 in all
    me = c.post("/api/billing/unlock", json={"feature": "templates"}, headers=h).json()
    assert me["credits"] == 300 and me["features"]["templates"] is True and me["unlocks"] == {"templates": 1}
    assert c.post("/api/billing/unlock", json={"feature": "templates"}, headers=h).status_code == 409   # already yours
    assert c.post("/api/billing/unlock", json={"feature": "gold"}, headers=h).status_code == 404
    # Stackable: room for more projects and storage.
    for _ in range(2):
        me = c.post("/api/billing/unlock", json={"feature": "project"}, headers=h).json()
    assert me["limits"]["projects"] == 3 and me["credits"] == 100
    me = c.post("/api/billing/unlock", json={"feature": "storage"}, headers=h).json()
    assert me["limits"]["storageMb"] == 200 + 1024 and me["credits"] == 0
    r = c.post("/api/billing/unlock", json={"feature": "project"}, headers=h)
    assert r.status_code == 402 and r.json()["detail"]["code"] == "credits_low"
    for i in range(3):
        assert c.put(f"/api/projects/u{i}", json=_proj(f"u{i}", "portfolio", "bento"), headers=h).status_code == 200
    assert c.put("/api/projects/u3", json=_proj("u3"), headers=h).status_code == 402
    assert c.post("/api/projects/u0/publish", headers=h).status_code == 200     # Bento: premium, unlocked
    # Spending is in the history, newest first.
    reasons = [x["reason"] for x in c.get("/api/billing/me", headers=h).json()["history"]]
    assert reasons[:4] == ["unlock:storage", "unlock:project", "unlock:project", "unlock:templates"]


def test_buying_a_credit_pack_in_naira(monkeypatch):
    _plans_on(monkeypatch)
    calls = _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, "naija@example.com")
    uid = _uid(c, h)
    unverified = sign_up(c, "nopay@example.com", verified=False)
    assert c.post("/api/billing/checkout", json={"pack": "m", "currency": "NGN"}, headers=unverified).status_code == 403
    r = c.post("/api/billing/checkout", json={"pack": "m", "currency": "NGN"}, headers=h).json()
    sent = calls[-1][2]
    assert "product_cart" not in sent and sent["pricing"] == {"currency": "NGN", "amount": "7500.00"}
    assert sent["success_url"] == f"https://dixlab.test/billing/callback/{sent['reference']}"
    assert sent["metadata"]["plan"] == "credits" and sent["metadata"]["interval"] == "m" and sent["metadata"]["credits"] == 500
    assert c.get("/api/billing/me", headers=h).json()["credits"] == 30         # not paid yet
    event = {"id": f"evt_{r['checkoutId']}", "type": "checkout.completed", "data": _pack_done(r["checkoutId"], uid, "7500.00", "NGN")}
    assert _webhook(c, event, secret="wrong").status_code == 400
    assert _webhook(c, event).status_code == 200
    assert _webhook(c, event).json().get("duplicate") is True                  # each event applies once
    me = c.get("/api/billing/me", headers=h).json()
    assert me["credits"] == 530 and me["payments"][0]["credits"] == 500 and me["payments"][0]["refundable"] is True
    # The same checkout again (a second, different event) doesn't add credits twice.
    _webhook(c, {**event, "id": "evt_again"})
    assert c.get("/api/billing/me", headers=h).json()["credits"] == 530
    # Wrong amount or currency: held for review, no credits.
    r2 = c.post("/api/billing/checkout", json={"pack": "l", "currency": "NGN"}, headers=h).json()
    _webhook(c, {"id": "evt_low", "type": "checkout.completed", "data": _pack_done(r2["checkoutId"], uid, "100.00", "NGN", pack="l")})
    r3 = c.post("/api/billing/checkout", json={"pack": "l", "currency": "NGN"}, headers=h).json()
    _webhook(c, {"id": "evt_usd", "type": "checkout.completed", "data": _pack_done(r3["checkoutId"], uid, "20000.00", "USD", pack="l")})
    assert c.get("/api/billing/me", headers=h).json()["credits"] == 530
    with sqlite3.connect(DB_PATH) as db:
        assert db.execute("SELECT COUNT(*) FROM payments WHERE user_id = ? AND status = 'review'", (uid,)).fetchone()[0] == 2


def test_verify_on_return_and_refunds(monkeypatch):
    """If the webhook is late, coming back from Bachs still adds the credits. Unused packs can be refunded."""
    _plans_on(monkeypatch)
    checkouts = {}
    calls = _fake_bachs(monkeypatch, checkouts)
    c = client(); h = sign_up(c, "return@example.com")
    uid = _uid(c, h)
    cid = c.post("/api/billing/checkout", json={"pack": "s", "currency": "USD"}, headers=h).json()["checkoutId"]
    assert calls[-1][2]["pricing"] == {"currency": "USD", "amount": "3.00"}
    assert c.get(f"/api/billing/verify?checkout_id={cid}", headers=h).json()["payment"] == "pending"
    checkouts[cid] = _pack_done(cid, uid, "3.00", pack="s")
    v = c.get(f"/api/billing/verify?checkout_id={cid}", headers=h).json()
    assert v["payment"] == "success" and v["billing"]["credits"] == 180
    assert c.get(f"/api/billing/verify?checkout_id={cid}", headers=h).json()["billing"]["credits"] == 180   # once
    assert c.get("/api/billing/verify?checkout_id=chk_someone_else", headers=h).status_code == 404
    ref = v["billing"]["payments"][0]["reference"]
    # Refund within 14 days while the credits are unused: money back, credits taken back.
    me = c.post("/api/billing/refund", json={"reference": ref}, headers=h).json()
    assert [x for x in calls if x[1] == "/v1/refunds"][-1][2]["charge_id"] == f"ch_{cid}"
    assert me["credits"] == 30 and c.post("/api/billing/refund", json={"reference": ref}, headers=h).status_code == 409
    _webhook(c, {"id": "evt_rf", "type": "refund.paid", "data": {"refund_id": "rfnd_1", "charge_id": f"ch_{cid}", "status": "success"}})
    assert c.get("/api/billing/me", headers=h).json()["payments"][0]["refundStatus"] == "processed"
    # Once some credits are spent, the pack can't be refunded.
    cid2 = c.post("/api/billing/checkout", json={"pack": "s", "currency": "USD"}, headers=h).json()["checkoutId"]
    checkouts[cid2] = _pack_done(cid2, uid, "3.00", pack="s")
    ref2 = c.get(f"/api/billing/verify?checkout_id={cid2}", headers=h).json()["billing"]["payments"][0]["reference"]
    c.post("/api/billing/unlock", json={"feature": "branding"}, headers=h)          # 180 - 200? not enough
    admin_cli.main(["credits", "return@example.com", "-100"])
    me = c.get("/api/billing/me", headers=h).json()
    assert me["credits"] == 80 and me["payments"][0]["refundable"] is False
    assert c.post("/api/billing/refund", json={"reference": ref2}, headers=h).status_code == 409


def test_failed_renewal_grace_and_admin_set_plan(monkeypatch):
    _plans_on(monkeypatch)
    _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, "grace@example.com")
    uid = _uid(c, h)
    now = plans_mod.now_ms()
    with sqlite3.connect(DB_PATH) as db:
        db.execute("INSERT INTO subscriptions (user_id, plan, interval, status, current_period_end, subscription_ref, created_at, updated_at) "
                   "VALUES (?, 'premium', 'monthly', 'active', ?, 'sub_g', ?, ?)", (uid, now - 60_000, now, now))
    assert c.get("/api/billing/me", headers=h).json()["legacy"] is None      # period over and not renewed
    _webhook(c, {"id": "evt_g1", "type": "invoice.payment_failed", "data": {"invoice_id": "inv_g", "subscription": {"subscription_id": "sub_g"}}})
    me = c.get("/api/billing/me", headers=h).json()["legacy"]
    assert me["plan"] == "premium" and me["status"] == "past_due"            # grace while Bachs retries
    _webhook(c, {"id": "evt_g2", "type": "customer.subscription.deleted", "data": {"subscription_id": "sub_g", "status": "canceled",
                                                                                  "canceled_at": "2026-01-01T00:00:00Z"}})
    assert c.get("/api/billing/me", headers=h).json()["legacy"] is None      # Bachs gave up: credits only
    assert admin_cli.main(["set-plan", "grace@example.com", "gold"]) == 2
    assert admin_cli.main(["set-plan", "grace@example.com", "pro"]) == 0
    assert c.get("/api/billing/me", headers=h).json()["legacy"]["plan"] == "pro"   # a plan given by an admin
    assert admin_cli.main(["set-plan", "grace@example.com", "none"]) == 0
    assert c.get("/api/billing/me", headers=h).json()["legacy"] is None


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


def test_pdf_export_is_for_everyone(monkeypatch):
    _plans_on(monkeypatch, bachs_ready=False)
    c = client(); h = sign_up(c, "pdf@example.com")
    c.put("/api/projects/pcv", json=_proj("pcv", "cv", "plain"), headers=h)
    slug = c.post("/api/projects/pcv/publish", headers=h).json()["slug"]
    assert c.get(f"/api/public/{slug}").json()["pdf"] is True


def test_a_sandbox_key_in_production_needs_test_mode_on_purpose(monkeypatch):
    from app import prodcheck
    monkeypatch.setattr(cfg, "BACHS_API_KEY", "sk_sandbox_abc")
    monkeypatch.setattr(cfg, "BACHS_TEST_MODE", False)
    errors, _ = prodcheck.findings()
    assert any("sandbox key" in e for e in errors)
    monkeypatch.setattr(cfg, "BACHS_TEST_MODE", True)
    errors, warnings = prodcheck.findings()
    assert not any("sandbox" in e for e in errors) and any("TEST MODE" in w for w in warnings)


def test_a_slow_bachs_gives_a_clear_message_not_a_dropped_connection(monkeypatch):
    import httpx
    import pytest
    def slow(*a, **k):
        raise httpx.ReadTimeout("slow")
    monkeypatch.setattr(bachs.httpx, "request", slow)
    with pytest.raises(bachs.BachsError, match="taking too long"):
        bachs._call("POST", "/v1/checkout-sessions", {})


def test_coming_back_with_an_id_we_didnt_save_still_finds_the_payment(monkeypatch):
    """Bachs named its id differently at creation ("id", not "checkout_id"), so the payment
    wasn't saved under it: coming back still finds it through Bachs's copy, for this account only."""
    _plans_on(monkeypatch)
    checkouts = {}

    def fake(method, path, body=None, idempotency_key=None):
        if method == "POST" and path == "/v1/checkout-sessions":
            fake.ref = body["reference"]
            return {"id": "cs_named_differently", "url": "https://sandbox-checkout.bachs.io/c/x"}
        if method == "GET" and path.startswith("/v1/checkout-sessions/"):
            return checkouts.get(path.rsplit("/", 1)[1], {"status": "open"})
        return {}
    monkeypatch.setattr(bachs, "_call", fake)
    c = client(); h = sign_up(c, "renamed-id@example.com")
    uid = _uid(c, h)
    r = c.post("/api/billing/checkout", json={"pack": "s", "currency": "USD"}, headers=h).json()
    assert r["checkoutId"] == "cs_named_differently" and r["url"].startswith("https://")
    # Simulate an older record that lost its checkout id.
    with sqlite3.connect(DB_PATH) as db:
        db.execute("UPDATE payments SET checkout_ref = NULL WHERE reference = ?", (fake.ref,))
    checkouts["cs_named_differently"] = {"id": "cs_named_differently", "reference": fake.ref, "status": "completed",
                                         "payment_status": "succeeded", "amount": "3.00", "currency": "USD",
                                         "metadata": {"user_id": uid, "plan": "credits", "interval": "s"},
                                         "charge": {"payment_id": "pay_x", "status": "succeeded"}}
    # Someone else can't claim it.
    other = sign_up(c, "not-mine@example.com")
    assert c.get("/api/billing/verify?checkout_id=cs_named_differently", headers=other).status_code == 404
    v = c.get("/api/billing/verify?checkout_id=cs_named_differently", headers=h).json()
    assert v["payment"] == "success" and v["billing"]["credits"] == 180


def test_coming_back_through_our_own_return_link(monkeypatch):
    """The return link carries Dixlab's reference, so the payment is found even if Bachs
    adds no checkout id; Bachs replies wrapped in {"data": ...} are understood too."""
    _plans_on(monkeypatch)
    state = {}

    def fake(method, path, body=None, idempotency_key=None):
        if method == "POST" and path == "/v1/checkout-sessions":
            state["ref"] = body["reference"]
            state["success_url"] = body["success_url"]
            return bachs_wrap({"checkout_id": "chk_wrapped", "checkout_url": "https://sandbox-checkout.bachs.io/c/w"})
        if method == "GET" and path == "/v1/checkout-sessions/chk_wrapped":
            return bachs_wrap(state.get("paid", {"checkout_id": "chk_wrapped", "status": "open"}))
        return {}

    def bachs_wrap(obj):  # what bachs._call returns after unwrapping {"data": obj}
        return obj
    monkeypatch.setattr(bachs, "_call", fake)
    c = client(); h = sign_up(c, "own-link@example.com")
    uid = _uid(c, h)
    r = c.post("/api/billing/checkout", json={"pack": "m", "currency": "USD"}, headers=h).json()
    ref = state["ref"]
    assert state["success_url"].endswith(f"/billing/callback/{ref}") and r["checkoutId"] == "chk_wrapped"
    # Back with no checkout id at all: known payment, not yet paid.
    assert c.get(f"/api/billing/verify?ref={ref}", headers=h).json()["payment"] == "pending"
    state["paid"] = {"checkout_id": "chk_wrapped", "reference": ref, "status": "completed", "payment_status": "succeeded",
                     "amount": "9.00", "currency": "USD", "metadata": {"user_id": uid},
                     "charge": {"payment_id": "pay_w", "status": "succeeded"}}
    v = c.get(f"/api/billing/verify?ref={ref}&checkout_id=chk_wrapped", headers=h).json()
    assert v["payment"] == "success" and v["billing"]["credits"] == 530
    # Another account can't use someone's reference.
    assert c.get(f"/api/billing/verify?ref={ref}", headers=sign_up(c, "nosy-ref@example.com")).status_code == 404


def test_bachs_replies_wrapped_in_data_are_unwrapped(monkeypatch):
    import httpx
    monkeypatch.setattr(bachs.httpx, "request", lambda *a, **k: httpx.Response(200, json={"data": {"checkout_id": "chk_1", "status": "open"}}))
    assert bachs._call("GET", "/v1/checkout-sessions/chk_1") == {"checkout_id": "chk_1", "status": "open"}
