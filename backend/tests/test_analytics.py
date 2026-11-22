"""Visitor analytics, share previews, and what a published portfolio tells visitors (CV link, branding)."""
from test_api import client, sign_up  # sets up the test database and environment first

from app import config as cfg
from app.admin import cli as admin_cli
from app.routers import analytics


def _publish(c, h, pid, data):
    assert c.put(f"/api/projects/{pid}", json={"id": pid, **data}, headers=h).status_code in (200, 201)
    r = c.post(f"/api/projects/{pid}/publish", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["slug"]


def test_sources_are_short_names_never_full_addresses(monkeypatch):
    monkeypatch.setattr(cfg, "PUBLIC_URL", "https://dixlab.app")
    assert analytics.source_of("") == "direct"
    assert analytics.source_of("https://www.linkedin.com/feed/?trk=secret") == "linkedin"
    assert analytics.source_of("https://lnkd.in/abc") == "linkedin"
    assert analytics.source_of("https://t.co/xyz") == "x"
    assert analytics.source_of("https://www.google.com.ng/") == "google"
    assert analytics.source_of("https://dixlab.app/dashboard") == "dixlab"
    assert analytics.source_of("https://blog.example.org/post?id=1") == "blog.example.org"
    assert analytics.source_of("not a url") == "direct"


def test_events_are_counted_once_and_only_from_visitors(monkeypatch):
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    c = client()
    h = sign_up(c, "ana@example.com")
    slug = _publish(c, h, "p-ana", {"type": "portfolio", "template": "folio", "name": "Ana", "role": "Designer"})
    # Visitor insights are a one-time unlock (300 credits).
    r = c.get("/api/projects/p-ana/analytics", headers=h)
    assert r.status_code == 402 and r.json()["detail"]["code"] == "unlock_needed" and r.json()["detail"]["feature"] == "insights"
    assert c.post("/api/billing/unlock", json={"feature": "insights"}, headers=h).json()["detail"]["code"] == "credits_low"
    admin_cli.main(["credits", "ana@example.com", "300"])
    me = c.post("/api/billing/unlock", json={"feature": "insights"}, headers=h).json()
    assert me["features"]["insights"] is True and me["credits"] == 30   # 30 welcome + 300 - 300
    assert c.post("/api/billing/unlock", json={"feature": "insights"}, headers=h).status_code == 409

    send = lambda kind, key, **kw: c.post(f"/api/public/{slug}/event", json={"kind": kind, "key": key}, **kw)  # noqa: E731
    assert send("ref", "https://www.linkedin.com/in/someone").status_code == 204
    assert send("ref", "https://www.linkedin.com/in/someone").status_code == 204    # same visitor: counted once
    assert send("depth", "50").status_code == 204
    assert send("depth", "33").status_code == 204                                   # not a milestone: ignored
    assert send("action", "cv").status_code == 204
    assert send("action", "hack").status_code == 204                                # unknown: ignored
    assert send("open", "Ledger app").status_code == 204
    assert send("nonsense", "x").status_code == 204
    assert send("ref", "https://github.com/", headers=h).status_code == 204         # the owner: not counted
    assert c.post("/api/public/no-such-page/event", json={"kind": "ref", "key": ""}).status_code == 204
    c.get(f"/api/public/{slug}")                                                     # one view

    a = c.get("/api/projects/p-ana/analytics?days=365", headers=h).json()
    assert a["published"] and a["days"] == 365 and a["maxDays"] == 365               # a year of history
    assert a["sources"] == [{"key": "linkedin", "count": 1}]
    assert a["opens"] == [{"key": "Ledger app", "count": 1}]
    assert a["depth"] == {"25": 0, "50": 1, "75": 0, "100": 0}
    assert a["actions"]["cv"] == 1 and a["actions"]["book"] == 0
    assert a["total"] == 1 and len(a["series"]) == 365 and a["series"][-1]["views"] == 1
    # Someone else can't read them.
    other = sign_up(c, "ana-other@example.com")
    assert admin_cli.main(["set-plan", "ana-other@example.com", "premium"]) == 0
    assert c.get("/api/projects/p-ana/analytics", headers=other).json() == {"published": False, "days": 30, "maxDays": 365}


def test_portfolio_links_the_owners_cv_and_branding_follows_the_plan(monkeypatch):
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    c = client()
    h = sign_up(c, "hire@example.com")
    assert admin_cli.main(["set-plan", "hire@example.com", "starter"]) == 0  # Free allows a single item
    cv_slug = _publish(c, h, "p-cv", {"type": "cv", "template": "classic", "name": "Hira"})
    slug = _publish(c, h, "p-port", {"type": "portfolio", "template": "folio", "name": "Hira", "cvProjectId": "p-cv",
                                     "availability": {"status": "open", "bookingUrl": "javascript:alert(1)"}})
    page = c.get(f"/api/public/{slug}").json()
    assert page["cvSlug"] == cv_slug and page["branding"] is True
    assert page["project"]["availability"]["bookingUrl"] == ""                       # unsafe links are removed
    # Pointing at someone else's CV gives nothing.
    other = sign_up(c, "hire-other@example.com")
    _publish(c, other, "p-cv2", {"type": "cv", "template": "plain", "name": "Other"})
    slug2 = _publish(c, h, "p-port2", {"type": "portfolio", "template": "folio", "name": "Hira", "cvProjectId": "p-cv2"})
    assert c.get(f"/api/public/{slug2}").json()["cvSlug"] is None
    assert admin_cli.main(["set-plan", "hire@example.com", "pro"]) == 0
    assert c.get(f"/api/public/{slug}").json()["branding"] is False                  # Pro removes "Made with Dixlab"


def test_share_preview_is_escaped(monkeypatch):
    monkeypatch.setattr(cfg, "PUBLIC_URL", "https://dixlab.app")
    c = client()
    h = sign_up(c, "share@example.com")
    slug = _publish(c, h, "p-share", {"type": "case", "template": "snapshot", "title": 'Fast "booking" <script>alert(1)</script>',
                                      "problem": "Patients gave up.", "cover": {"src": "/uploads/" + "b" * 32 + ".png"}})
    r = c.get(f"/api/public/{slug}/share")
    assert r.status_code == 200 and "<script>" not in r.text
    assert "&lt;script&gt;" in r.text and "&quot;booking&quot;" in r.text
    assert f'content="https://dixlab.app/uploads/{"b" * 32}.png"' in r.text
    assert f"https://dixlab.app/p/{slug}" in r.text and "Patients gave up." in r.text
    assert c.get("/api/public/missing-page/share").status_code == 404
    # No cover: the default image.
    assert analytics.preview_for({"type": "cv", "name": "A"})["image"] == "https://dixlab.app/og-default.png"
