"""Testimonials with approval, feedback links on drafts, and password-protected pages."""
from test_api import client, sign_up  # sets up the test database and environment first

from app import config as cfg
from app.admin import cli as admin_cli

PORTFOLIO = {"type": "portfolio", "template": "folio", "name": "Tobi Ade", "role": "Designer", "notes": "Private draft note"}
WORDS = "Tobi led our redesign and shipped it two weeks early. Clear, kind and very good at the craft."


def _save(c, h, pid, data):
    assert c.put(f"/api/projects/{pid}", json={"id": pid, **data}, headers=h).status_code in (200, 201)


def test_testimonials_need_approval_before_they_show():
    c = client()
    h = sign_up(c, "testi@example.com")
    _save(c, h, "p-t", PORTFOLIO)
    assert c.get("/api/projects/p-t/invites/testimonial", headers=h).json() == {"active": False}
    link = c.post("/api/projects/p-t/invites/testimonial", headers=h).json()
    assert link["url"].endswith("/recommend/" + link["token"])
    assert c.post("/api/projects/p-t/invites/testimonial", headers=h).json()["token"] == link["token"]  # one link per project
    token = link["token"]

    info = c.get(f"/api/invites/{token}").json()
    assert info == {"kind": "testimonial", "owner": "Tobi Ade", "type": "portfolio", "title": "Tobi Ade"}  # no draft content
    assert c.post(f"/api/invites/{token}/testimonial", json={"name": "Kemi", "body": "Too short"}).status_code == 422
    assert c.post(f"/api/invites/{token}/feedback", json={"body": "wrong kind"}).status_code == 404
    r = c.post(f"/api/invites/{token}/testimonial", json={"name": "Kemi Bello", "role": "Head of Product", "company": "Paystack",
                                                         "relation": "Managed Tobi", "body": WORDS})
    assert r.status_code == 201
    assert c.post(f"/api/invites/{token}/testimonial", json={"name": "Bot", "body": WORDS, "website": "spam"}).json() == {"ok": True}

    slug = c.post("/api/projects/p-t/publish", headers=h).json()["slug"]
    assert c.get(f"/api/public/{slug}").json()["testimonials"] == []        # pending: not shown
    items = c.get("/api/projects/p-t/testimonials", headers=h).json()["testimonials"]
    assert len(items) == 1 and items[0]["status"] == "pending"               # the honeypot one was dropped
    other = sign_up(c, "testi-other@example.com")
    assert c.patch(f"/api/testimonials/{items[0]['id']}", json={"status": "approved"}, headers=other).status_code == 404
    assert c.patch(f"/api/testimonials/{items[0]['id']}", json={"status": "approved"}, headers=h).json()["status"] == "approved"
    shown = c.get(f"/api/public/{slug}").json()["testimonials"]
    assert shown == [{"name": "Kemi Bello", "role": "Head of Product", "company": "Paystack", "relation": "Managed Tobi", "body": WORDS}]
    c.patch(f"/api/testimonials/{items[0]['id']}", json={"status": "hidden"}, headers=h)
    assert c.get(f"/api/public/{slug}").json()["testimonials"] == []

    # Turning the link off stops it at once.
    assert c.delete("/api/projects/p-t/invites/testimonial", headers=h).status_code == 204
    assert c.get(f"/api/invites/{token}").status_code == 404


def test_feedback_links_share_the_draft_and_collect_comments():
    c = client()
    h = sign_up(c, "fb@example.com")
    _save(c, h, "p-f", {**PORTFOLIO, "interview": {"secret": 1}, "photo": "https://tracker.example/pixel.png"})
    token = c.post("/api/projects/p-f/invites/feedback", headers=h).json()["token"]
    info = c.get(f"/api/invites/{token}").json()
    assert info["kind"] == "feedback" and info["project"]["notes"] == "Private draft note"  # the draft, unpublished
    assert "interview" not in info["project"] and info["project"]["photo"] == ""             # cleaned like a public page
    assert c.post(f"/api/invites/{token}/feedback", json={"section": "About", "body": "Lead with the Paystack project."}).status_code == 201
    items = c.get("/api/projects/p-f/feedback", headers=h).json()["feedback"]
    assert items[0]["name"] == "Anonymous" and items[0]["section"] == "About" and not items[0]["resolved"]
    assert c.patch(f"/api/feedback/{items[0]['id']}", json={"resolved": True}, headers=h).json()["resolved"]
    other = sign_up(c, "fb-other@example.com")
    assert c.get("/api/projects/p-f/feedback", headers=other).json()["feedback"] == []
    # Deleting the project removes its link and comments.
    c.delete("/api/projects/p-f", headers=h)
    assert c.get(f"/api/invites/{token}").status_code == 404


def test_password_protected_pages(monkeypatch):
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    monkeypatch.setattr(cfg, "PUBLIC_URL", "https://dixlab.app")
    c = client()
    h = sign_up(c, "lock@example.com")
    _save(c, h, "p-l", {"type": "case", "template": "snapshot", "title": "NDA work: banking app"})
    slug = c.post("/api/projects/p-l/publish", headers=h).json()["slug"]
    r = c.put("/api/projects/p-l/publish/password", json={"password": "open sesame"}, headers=h)
    assert r.status_code == 402                                              # Pro and Premium
    assert admin_cli.main(["set-plan", "lock@example.com", "pro"]) == 0
    assert c.put("/api/projects/p-l/publish/password", json={"password": "abc"}, headers=h).status_code == 422
    assert c.put("/api/projects/p-l/publish/password", json={"password": "open sesame"}, headers=h).json()["protected"]
    assert c.get("/api/projects/p-l/publish", headers=h).json()["protected"]

    r = c.get(f"/api/public/{slug}")
    assert r.status_code == 401 and r.json()["detail"]["code"] == "password_required" and "banking" not in r.text
    assert c.post(f"/api/public/{slug}/unlock", json={"password": "nope"}).json()["detail"]["code"] == "password_wrong"
    assert c.post(f"/api/public/{slug}/unlock", json={"password": "open sesame"}).json()["project"]["title"] == "NDA work: banking app"
    assert c.get(f"/api/public/{slug}", headers=h).status_code == 200      # the owner always sees it
    share = c.get(f"/api/public/{slug}/share").text
    assert "NDA work" not in share and "private page" in share             # link previews say nothing (the slug is the link itself)
    for _ in range(10):
        r = c.post(f"/api/public/{slug}/unlock", json={"password": "guess"})
    assert r.status_code == 429                                              # guessing is limited
    assert c.put("/api/projects/p-l/publish/password", json={"password": None}, headers=h).json()["protected"] is False
    assert c.get(f"/api/public/{slug}").status_code == 200
