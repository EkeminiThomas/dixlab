"""Buying a domain in Dixlab: search, pay (Bachs), register on pxxl, point it at the page, and refunds when pxxl says no."""
import uuid

from test_api import client, sign_up  # sets up the test database and environment first
from test_billing import _fake_bachs, _plans_on, _uid, _webhook

from app import config as cfg, pxxl

CONTACT = {"firstName": "Ada", "lastName": "Obi", "email": "ada@example.com", "phone": "+2348012345678", "address1": "1 Marina",
           "city": "Lagos", "state": "Lagos", "postalCode": "100001", "country": "NG"}


class FakePxxl:
    """pxxl's reseller API, in memory."""

    def __init__(self):
        self.calls, self.taken, self.state, self.fail_register = [], {"taken.com"}, {}, None

    def __call__(self, method, path, body=None, params=None, idempotency_key=None):
        self.calls.append((method, path, body, idempotency_key))
        if path == "/availability":
            d = params["domain"]
            return {"domain": d, "available": d not in self.taken, "customerPriceNgn": 25000, "customerPriceUsd": 18.5, "chargeMinor": 1500}
        if method == "POST" and path == "/domains":
            if self.fail_register:
                raise pxxl.PxxlError("nope", 409, self.fail_register)
            self.state[body["domain"]] = "registering"
            return {"message": "Registering", "balanceMinor": 5000}
        if method == "GET" and path.startswith("/domains/"):
            return {"status": self.state.get(path.split("/")[2], "")}
        if path.endswith("/dns-records"):
            return {"id": "rec_1"}
        return {}


def _setup(monkeypatch, email):
    _plans_on(monkeypatch)
    monkeypatch.setattr(cfg, "PXXL_RESELLER_KEY", "pxxl_rsl_test")
    monkeypatch.setattr(cfg, "DOMAIN_SALES", "live")
    monkeypatch.setattr(cfg, "VERCEL_TOKEN", "")
    fake = FakePxxl()
    monkeypatch.setattr(pxxl, "_call", fake)
    bachs_calls = _fake_bachs(monkeypatch)
    c = client(); h = sign_up(c, email)
    pid = f"p-{uuid.uuid4().hex[:6]}"
    c.put(f"/api/projects/{pid}", json={"id": pid, "type": "case", "template": "snapshot", "title": "Mine"}, headers=h)
    slug = c.post(f"/api/projects/{pid}/publish", headers=h).json()["slug"]
    return c, h, pid, slug, fake, bachs_calls


def _paid(c, h, uid, checkout_id, amount, currency):
    data = {"checkout_id": checkout_id, "status": "completed", "payment_status": "paid", "amount": amount, "currency": currency,
            "charge": {"id": f"ch_{checkout_id}", "status": "succeeded"}, "metadata": {"user_id": uid}}
    return _webhook(c, {"id": f"evt_{checkout_id}", "type": "checkout.completed", "data": data})


def test_search_buy_register_and_go_live(monkeypatch):
    c, h, pid, slug, fake, bachs_calls = _setup(monkeypatch, "buyer@example.com")
    uid = _uid(c, h)
    res = c.get("/api/domains/search?q=Ada Obi", headers=h).json()["results"]
    assert [r["domain"] for r in res][:2] == ["adaobi.com", "adaobi.com.ng"]
    assert res[0]["available"] and res[0]["prices"] == {"NGN": 2500000, "USD": 1850}
    assert c.get("/api/domains/search?q=taken.com", headers=h).json()["results"][0]["available"] is False
    # Buying: a fresh price, then Bachs's checkout for exactly that.
    r = c.post(f"/api/projects/{pid}/domain/buy", json={"domain": "taken.com", "currency": "NGN", "contact": CONTACT}, headers=h)
    assert r.status_code == 409
    r = c.post(f"/api/projects/{pid}/domain/buy", json={"domain": "adaobi.com", "currency": "NGN", "contact": CONTACT}, headers=h)
    assert r.status_code == 200, r.text
    sent = bachs_calls[-1][2]
    assert sent["pricing"] == {"currency": "NGN", "amount": "25000.00"} and sent["metadata"]["plan"] == "domain"
    assert not [x for x in fake.calls if x[1] == "/domains" and x[0] == "POST"]          # nothing bought before payment
    # Paid: registered on pxxl, with the customer as registrant and a price ceiling.
    assert _paid(c, h, uid, r.json()["checkoutId"], "25000.00", "NGN").status_code == 200
    reg = [x for x in fake.calls if x[0] == "POST" and x[1] == "/domains"]
    assert len(reg) == 1 and reg[0][3] == r.json()["reference"]                            # idempotency key = our reference
    assert reg[0][2]["maxChargeMinor"] == 1500 and reg[0][2]["contact"]["lastName"] == "Obi" and reg[0][2]["address"]["country"] == "NG"
    orders = c.get("/api/domain-orders", headers=h).json()["orders"]
    assert orders[0]["status"] == "registering"
    # pxxl finishes: DNS is pointed at the website and the page is live there.
    fake.state["adaobi.com"] = "active"
    assert c.get("/api/domain-orders", headers=h).json()["orders"][0]["status"] == "active"
    dns = [x[2] for x in fake.calls if x[1].endswith("/dns-records")]
    assert {"type": "A", "name": "@", "value": "76.76.21.21", "ttl": 300} in dns and any(d["type"] == "CNAME" for d in dns)
    assert c.get("/api/domains/resolve?host=adaobi.com").json() == {"slug": slug}
    assert c.get(f"/api/projects/{pid}/domain", headers=h).json()["verified"] is True
    # Domain payments aren't refundable from the account page (registrations are final).
    assert all(not p["refundable"] for p in c.get("/api/billing/me", headers=h).json()["payments"])


def test_a_refused_registration_is_refunded(monkeypatch):
    c, h, pid, slug, fake, bachs_calls = _setup(monkeypatch, "refused@example.com")
    uid = _uid(c, h)
    r = c.post(f"/api/projects/{pid}/domain/buy", json={"domain": "gone.dev", "currency": "USD", "contact": CONTACT}, headers=h).json()
    fake.fail_register = "NOT_AVAILABLE"
    _paid(c, h, uid, r["checkoutId"], "18.50", "USD")
    order = c.get("/api/domain-orders", headers=h).json()["orders"][0]
    assert order["status"] == "failed" and "refunded" in order["error"]
    assert [x for x in bachs_calls if x[1] == "/v1/refunds"][-1][2]["charge_id"] == f"ch_{r['checkoutId']}"
    assert c.get("/api/domains/resolve?host=gone.dev").json() == {"slug": None}


def test_underpaying_buys_nothing(monkeypatch):
    c, h, pid, slug, fake, _ = _setup(monkeypatch, "cheap@example.com")
    uid = _uid(c, h)
    r = c.post(f"/api/projects/{pid}/domain/buy", json={"domain": "cheap.io", "currency": "USD", "contact": CONTACT}, headers=h).json()
    _paid(c, h, uid, r["checkoutId"], "1.00", "USD")
    assert not [x for x in fake.calls if x[0] == "POST" and x[1] == "/domains"]


def test_off_until_launch_and_demo_mode(monkeypatch):
    _plans_on(monkeypatch, bachs_ready=False)
    monkeypatch.setattr(cfg, "PXXL_RESELLER_KEY", "pxxl_rsl_test")
    monkeypatch.setattr(cfg, "DOMAIN_SALES", "off")                       # the default: hidden, even with a key
    c = client(); h = sign_up(c, "nopxxl@example.com")
    assert c.get("/api/domains/search?q=ada", headers=h).status_code == 503
    c.put("/api/projects/p-demo", json={"id": "p-demo", "type": "case", "template": "snapshot", "title": "Demo"}, headers=h)
    slug = c.post("/api/projects/p-demo/publish", headers=h).json()["slug"]
    assert c.get("/api/projects/p-demo/domain", headers=h).json()["sales"] == "off"
    # Demo: the whole flow, nothing real bought, payment simulated (no Bachs here), no network.
    monkeypatch.setattr(cfg, "DOMAIN_SALES", "demo")

    def no_network(*a, **k):
        raise AssertionError("no real pxxl calls in demo")
    monkeypatch.setattr(pxxl.httpx, "request", no_network)
    assert c.get("/api/projects/p-demo/domain", headers=h).json()["sales"] == "demo"
    res = c.get("/api/domains/search?q=demoname", headers=h).json()["results"]
    assert res[0]["available"] and res[0]["prices"]["USD"] == 1850
    assert c.get("/api/domains/search?q=taken-name.com", headers=h).json()["results"][0]["available"] is False
    r = c.post("/api/projects/p-demo/domain/buy", json={"domain": "demoname.com", "currency": "USD", "contact": CONTACT}, headers=h).json()
    assert r["demo"] is True and r["order"]["status"] == "active" and r["order"]["demo"] is True
    assert c.get("/api/domains/resolve?host=demoname.com").json() == {"slug": slug}
    r = c.post("/api/projects/p-demo/domain/buy", json={"domain": "fail-demo.com", "currency": "USD", "contact": CONTACT}, headers=h).json()
    assert r["order"]["status"] == "failed"
