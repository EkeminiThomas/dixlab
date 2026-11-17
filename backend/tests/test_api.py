"""End-to-end tests for the Dixlab API. Run from backend/:  python -m pytest"""
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp())
# Never read the real backend settings file: no real keys, no real email, no production mode.
os.environ["DIXLAB_SKIP_DOTENV"] = "1"
os.environ.pop("DIXLAB_ENV", None)
# Most tests sign up and carry on; the email-confirmation tests turn this on.
os.environ["DIXLAB_REQUIRE_VERIFIED_EMAIL"] = "false"
os.environ["DIXLAB_DB"] = str(_tmp / "test.db")
os.environ["DIXLAB_FRONTEND_DIST"] = str(_tmp / "no-frontend")  # API only: don't serve the built site here
os.environ["DIXLAB_UPLOADS"] = str(_tmp / "uploads")
# Set to empty (not removed) so the backend's real settings file can't fill them in:
# tests must never call Anthropic or Bachs with real keys.
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""
os.environ["DIXLAB_AI_PROVIDER"] = ""
os.environ["DIXLAB_ADMIN_EMAILS"] = "boss@example.com"  # legacy setting: must grant nothing
# The suite signs up many accounts from one test client; brute-force limits get their own test.
os.environ["DIXLAB_SIGNUPS_PER_IP"] = "10000"
os.environ["DIXLAB_LOGIN_ATTEMPTS_PER_IP"] = "10000"
# Plans are off for the general tests (they create many projects); the plan tests turn them on.
os.environ["DIXLAB_PLAN_LIMITS"] = "false"
for _k in [k for k in os.environ if k.startswith(("PAYSTACK_", "BACHS_"))]:
    os.environ.pop(_k)
for _k in ("BACHS_API_KEY", "BACHS_WEBHOOK_SECRET"):
    os.environ[_k] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def client():
    """An API-style client: asks for bearer tokens and never keeps the session
    cookie, so each test controls exactly which account a request uses.
    (test_cookie_sessions_and_csrf covers the browser's cookie flow.)"""
    c = TestClient(app, headers={"X-Dixlab-Want-Token": "1"})
    c.event_hooks["response"] = [lambda r: c.cookies.clear()]
    c.__enter__()  # run startup (creates the schema)
    return c


def sign_up(c, email="alex@example.com", verified=True):
    r = c.post("/api/auth/signup", json={"name": "Alex Morgan", "email": email, "password": "correct horse"})
    assert r.status_code == 201, r.text
    if verified:  # most tests aren't about email verification
        import sqlite3 as _sq
        from app.config import DB_PATH
        with _sq.connect(DB_PATH) as db:
            db.execute("UPDATE users SET email_verified_at = 1 WHERE email = ?", (email.lower(),))
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_health():
    assert client().get("/api/health").json() == {"ok": True}


def test_signup_login_me_logout():
    c = client()
    h = sign_up(c, "auth@example.com")
    assert c.get("/api/auth/me", headers=h).json()["user"]["email"] == "auth@example.com"
    assert c.post("/api/auth/signup", json={"name": "X", "email": "AUTH@example.com", "password": "12345678"}).status_code == 409
    assert c.post("/api/auth/login", json={"email": "auth@example.com", "password": "wrong pass"}).status_code == 401
    login = c.post("/api/auth/login", json={"email": "auth@example.com", "password": "correct horse"})
    assert login.status_code == 200
    h2 = {"Authorization": f"Bearer {login.json()['token']}"}
    assert c.patch("/api/auth/me", json={"name": "Alex M"}, headers=h2).json()["user"]["name"] == "Alex M"
    assert c.post("/api/auth/logout", headers=h2).status_code == 204
    assert c.get("/api/auth/me", headers=h2).status_code == 401
    assert c.post("/api/auth/signup", json={"name": "Y", "email": "y@example.com", "password": "short"}).status_code == 422


def test_projects_crud_and_isolation():
    c = client()
    h = sign_up(c, "owner@example.com")
    other = sign_up(c, "other@example.com")
    project = {"id": "p-abc", "type": "case", "template": "snapshot", "title": "Cutting latency", "updatedAt": 1000,
               "process": [{"title": "Measure", "desc": "Tracing"}]}
    assert c.put("/api/projects/p-abc", json=project, headers=h).status_code == 200
    listed = c.get("/api/projects", headers=h).json()["projects"]
    assert listed[0]["title"] == "Cutting latency" and listed[0]["process"][0]["title"] == "Measure"
    assert c.get("/api/projects", headers=other).json()["projects"] == []          # other users can't see it
    assert c.get("/api/projects/p-abc", headers=other).status_code == 404
    assert c.put("/api/projects/p-xyz", json=project, headers=h).status_code == 400  # id mismatch
    assert c.put("/api/projects/p-bad", json={**project, "id": "p-bad", "type": "memo"}, headers=h).status_code == 422
    assert c.get("/api/projects", headers={}).status_code == 401
    assert c.delete("/api/projects/p-abc", headers=h).status_code == 204
    assert c.get("/api/projects/p-abc", headers=h).status_code == 404


def test_uploads_are_checked_and_cleaned_up():
    c = client()
    h = sign_up(c, "uploads@example.com")
    bad = c.post("/api/uploads", files={"file": ("x.png", b"not an image", "image/png")}, headers=h)
    assert bad.status_code == 415
    ok = c.post("/api/uploads", files={"file": ("x.png", PNG, "image/png")}, headers=h)
    assert ok.status_code == 201
    url = ok.json()["url"]
    assert c.get(url).status_code == 200
    project = {"id": "p-img", "type": "case", "template": "showcase", "cover": {"src": url}}
    c.put("/api/projects/p-img", json=project, headers=h)
    c.delete("/api/projects/p-img", headers=h)
    assert c.get(url).status_code == 404  # deleting the project removed its image


def test_customize_needs_login_and_reports_unconfigured_ai():
    c = client()
    assert c.post("/api/customize", json={"prompt": "make it green"}).status_code == 401
    h = sign_up(c, "ai@example.com")
    r = c.post("/api/customize", json={"prompt": "make it green", "kind": "cv"}, headers=h)
    assert r.status_code == 503 and r.json()["unavailable"] is True
    assert c.post("/api/customize", json={"prompt": "  ", "kind": "site"}, headers=h).status_code == 400
    assert c.post("/api/customize", json={"prompt": "x", "kind": "memo"}, headers=h).status_code == 422


def test_customize_3d_settings_only_apply_to_3d_templates():
    from app.routers.customize import CaseChanges, SiteChanges, _normalise
    from app.catalog import CASE_TEMPLATES, SITE_TEMPLATES

    def out(model, **over):
        base = dict(template="keep", font="keep", accent="keep", motion="keep", speed="keep",
                    depth="keep", tilt="keep", float="keep", role="", tagline="", summary="ok")
        return model(**{**base, **over})

    assert "blocks" in SITE_TEMPLATES and "depth" in CASE_TEMPLATES
    # On a 3D template: depth, tilt and float come through.
    got = _normalise("site", out(SiteChanges, depth="deep", tilt="off", float="off"), SITE_TEMPLATES, "blocks")
    assert got == {"brand": {"depth": "deep", "tilt": "off", "float": "off"}}
    # Switching to a 3D template in the same request: they apply too.
    got = _normalise("case", out(CaseChanges, template="depth", depth="subtle"), CASE_TEMPLATES, "chronicle")
    assert got == {"template": "depth", "brand": {"depth": "subtle"}}
    # On a flat template they're dropped, so nothing invisible is stored.
    got = _normalise("site", out(SiteChanges, depth="flat", accent="#166534"), SITE_TEMPLATES, "folio")
    assert got == {"brand": {"accent": "#166534"}}


def test_publish_snapshot_public_view_and_privacy():
    c = client()
    h = sign_up(c, "pub@example.com")
    project = {"id": "p-pub", "type": "case", "template": "snapshot", "title": "Halving booking time",
               "updatedAt": 10, "sample": False, "status": "Draft", "interview": {"transcript": [{"q": "secret"}]}}
    assert c.post("/api/projects/p-pub/publish", headers=h).status_code == 404  # must be saved first
    c.put("/api/projects/p-pub", json=project, headers=h)
    assert c.get("/api/projects/p-pub/publish", headers=h).json() == {"published": False}
    pub = c.post("/api/projects/p-pub/publish", headers=h).json()
    slug = pub["slug"]
    assert slug.startswith("halving-booking-time-")
    page = c.get(f"/api/public/{slug}").json()["project"]                 # no login needed
    assert page["title"] == "Halving booking time"
    assert "interview" not in page and "status" not in page and "sample" not in page and "updatedAt" not in page
    assert "user_id" not in str(page) and "pub@example.com" not in str(page)
    # Drafts don't leak: edits only go live after republishing, at the same link.
    c.put("/api/projects/p-pub", json={**project, "title": "New title", "updatedAt": 20}, headers=h)
    assert c.get(f"/api/public/{slug}").json()["project"]["title"] == "Halving booking time"
    assert c.post("/api/projects/p-pub/publish", headers=h).json()["slug"] == slug
    assert c.get(f"/api/public/{slug}").json()["project"]["title"] == "New title"
    assert c.get("/api/projects/p-pub/publish", headers=h).json()["views"] == 1  # one visitor, three loads: one view
    other = sign_up(c, "nosy@example.com")
    assert c.post("/api/projects/p-pub/publish", headers=other).status_code == 404  # can't publish others' work
    assert c.delete("/api/projects/p-pub/publish", headers=h).status_code == 204
    assert c.get(f"/api/public/{slug}").status_code == 404


def test_interview_endpoints_without_ai():
    c = client()
    assert c.post("/api/interview/next", json={"transcript": []}).status_code == 401
    h = sign_up(c, "interview@example.com")
    assert c.get("/api/interview/topics").json()["topics"][4]["key"] == "cut"
    r = c.post("/api/interview/next", json={"transcript": []}, headers=h)
    assert r.status_code == 503 and r.json()["unavailable"] is True
    short = {"transcript": [{"topic": "context", "q": "What was it?", "a": "An app"}]}
    assert c.post("/api/interview/draft", json=short, headers=h).status_code == 400


MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64


def test_video_uploads():
    c = client()
    h = sign_up(c, "video@example.com")
    r = c.post("/api/uploads", files={"file": ("reel.mp4", MP4, "video/mp4")}, headers=h)
    assert r.status_code == 201 and r.json()["type"] == "video" and r.json()["url"].endswith(".mp4")
    assert c.get(r.json()["url"]).status_code == 200
    r = c.post("/api/uploads", files={"file": ("clip.webm", WEBM, "video/webm")}, headers=h)
    assert r.status_code == 201 and r.json()["url"].endswith(".webm")
    fake = c.post("/api/uploads", files={"file": ("x.mp4", b"hello world, not a video", "video/mp4")}, headers=h)
    assert fake.status_code == 415


def test_portfolio_interview_without_ai():
    c = client()
    h = sign_up(c, "pf@example.com")
    assert [t["key"] for t in c.get("/api/interview/topics?kind=portfolio").json()["topics"]][:3] == ["intro", "role", "project"]
    r = c.post("/api/interview/next", json={"transcript": [], "kind": "portfolio"}, headers=h)
    assert r.status_code == 503 and r.json()["unavailable"] is True


def _office(folder: str) -> bytes:
    import io
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr(f"{folder}document.xml", "<x/>")
    return buf.getvalue()


def test_document_uploads():
    c = client()
    h = sign_up(c, "files@example.com")
    pdf = c.post("/api/uploads", files={"file": ("../../Research report.pdf", b"%PDF-1.7\n" + b"0" * 64, "application/pdf")}, headers=h)
    assert pdf.status_code == 201
    body = pdf.json()
    assert body["type"] == "file" and body["url"].endswith(".pdf") and body["filename"] == "Research report.pdf"
    got = c.get(body["url"])
    assert got.status_code == 200 and got.headers["x-content-type-options"] == "nosniff"
    deck = c.post("/api/uploads", files={"file": ("Pitch.pptx", _office("ppt/"), "application/octet-stream")}, headers=h)
    assert deck.status_code == 201 and deck.json()["url"].endswith(".pptx")
    assert c.get(deck.json()["url"]).headers["content-disposition"] == "attachment"
    assert c.post("/api/uploads", files={"file": ("Notes.docx", _office("word/"), "x")}, headers=h).json()["url"].endswith(".docx")
    plain_zip = c.post("/api/uploads", files={"file": ("stuff.zip", b"PK\x03\x04" + b"0" * 64, "application/zip")}, headers=h)
    assert plain_zip.status_code == 415
    html = c.post("/api/uploads", files={"file": ("x.pdf", b"<html><script>alert(1)</script>", "application/pdf")}, headers=h)
    assert html.status_code == 415


def test_upload_size_limits():
    c = client()
    h = sign_up(c, "sizes@example.com")
    mb = 1024 * 1024
    video_15mb = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * (15 * mb)
    assert c.post("/api/uploads", files={"file": ("clip.mp4", video_15mb, "video/mp4")}, headers=h).status_code == 201
    gif_12mb = b"GIF89a" + b"\x00" * (12 * mb)
    assert c.post("/api/uploads", files={"file": ("loop.gif", gif_12mb, "image/gif")}, headers=h).status_code == 201
    too_big = b"GIF89a" + b"\x00" * (16 * mb)
    r = c.post("/api/uploads", files={"file": ("huge.gif", too_big, "image/gif")}, headers=h)
    assert r.status_code == 413 and "15 MB" in r.json()["detail"]


def test_get_in_touch_messages(monkeypatch):
    from app import mailer
    from app.routers import messages as msgs
    sent = []
    monkeypatch.setattr(mailer, "configured", lambda: True)
    monkeypatch.setattr(mailer, "send", lambda to, subject, body, reply_to=None: sent.append((to, subject, body, reply_to)) or True)

    c = client(); h = sign_up(c, "inbox-owner@example.com"); other = sign_up(c, "inbox-nosy@example.com")
    folio = {"id": "p-folio", "type": "portfolio", "template": "casebook", "title": "My work", "name": "Alex Morgan",
             "email": "hello@alex.dev", "updatedAt": 1}
    case = {"id": "p-case", "type": "case", "template": "snapshot", "title": "A case", "updatedAt": 1}
    for p in (folio, case):
        c.put(f"/api/projects/{p['id']}", json=p, headers=h)
    slug = c.post("/api/projects/p-folio/publish", headers=h).json()["slug"]
    case_slug = c.post("/api/projects/p-case/publish", headers=h).json()["slug"]

    note = {"name": "Sam\r\nBcc: x@evil.test", "email": "sam@client.co", "message": "Loved the launch film. Free next week?"}
    assert c.post("/api/public/nope-123/contact", json=note).status_code == 404
    assert c.post(f"/api/public/{case_slug}/contact", json=note).status_code == 404  # portfolios only
    assert c.post(f"/api/public/{slug}/contact", json={**note, "email": "not-an-email"}).status_code == 422
    assert c.post(f"/api/public/{slug}/contact", json={**note, "message": ""}).status_code == 422
    r = c.post(f"/api/public/{slug}/contact", json=note)
    assert r.status_code == 201 and r.json() == {"ok": True}
    assert "hello@alex.dev" not in r.text  # the owner's address is never revealed

    # Emailed to the portfolio's contact address, replying to the visitor; the name can't add headers.
    contact_mail = [m for m in sent if m[3]]  # sign-up verification emails go through the same mailer
    assert len(contact_mail) == 1
    to, subject, body, reply_to = contact_mail[0]
    assert to == "hello@alex.dev" and reply_to == ("Sam Bcc: x@evil.test", "sam@client.co")
    assert "\n" not in subject and "Loved the launch film" in body

    # Bots that fill the hidden field get a 201 but nothing is kept.
    assert c.post(f"/api/public/{slug}/contact", json={**note, "website": "spam.biz"}).status_code == 201

    inbox = c.get("/api/messages", headers=h).json()
    assert inbox["unread"] == 1 and inbox["emailEnabled"] is True
    m = inbox["messages"][0]
    assert m["email"] == "sam@client.co" and m["emailed"] is True and m["slug"] == slug
    assert c.get("/api/messages", headers=other).json()["messages"] == []
    assert c.patch(f"/api/messages/{m['id']}", json={"read": True}, headers=other).status_code == 404
    assert c.patch(f"/api/messages/{m['id']}", json={"read": True}, headers=h).status_code == 200
    assert c.get("/api/messages", headers=h).json()["unread"] == 0
    assert c.get("/api/messages").status_code == 401

    # Rate limit per visitor and page.
    msgs._recent.clear()
    codes = [c.post(f"/api/public/{slug}/contact", json=note).status_code for _ in range(msgs.CONTACT_PER_10_MIN + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {201}
    msgs._recent.clear()

    assert c.delete(f"/api/messages/{m['id']}", headers=h).status_code == 204
    assert all(x["id"] != m["id"] for x in c.get("/api/messages", headers=h).json()["messages"])


def test_admin_dashboard():
    import sqlite3 as _sq
    from app.config import DB_PATH, UPLOAD_DIR
    c = client()
    boss = sign_up(c, "boss@example.com")
    user = sign_up(c, "maker@example.com")
    # Signing up with the (legacy) admin email grants nothing; only the terminal command does.
    assert c.get("/api/auth/me", headers=boss).json()["user"]["isAdmin"] is False
    assert c.get("/api/admin/overview", headers=boss).status_code == 403
    from app import admin_cli
    assert admin_cli.main(["grant", "nobody-here@example.com"]) == 1
    assert admin_cli.main(["grant", "boss@example.com"]) == 0
    assert c.get("/api/auth/me", headers=boss).json()["user"]["isAdmin"] is True
    assert c.get("/api/auth/me", headers=user).json()["user"]["isAdmin"] is False
    assert c.get("/api/admin/overview").status_code == 401
    assert c.get("/api/admin/overview", headers=user).status_code == 403

    # Some activity to report on.
    folio = {"id": "p-adm", "type": "portfolio", "template": "folio", "title": "=cmd|evil", "updatedAt": 1}
    c.put("/api/projects/p-adm", json=folio, headers=user)
    slug = c.post("/api/projects/p-adm/publish", headers=user).json()["slug"]
    c.get(f"/api/public/{slug}"); c.get(f"/api/public/{slug}")
    c.post(f"/api/public/{slug}/contact", json={"name": "Sam", "email": "sam@x.co", "message": "Private note"})
    up = c.post("/api/uploads", files={"file": ("a.png", PNG, "image/png")}, headers=user).json()

    ov = c.get("/api/admin/overview?days=7", headers=boss).json()
    assert ov["kpis"]["users"]["value"] >= 2 and ov["kpis"]["pages"]["value"] >= 1
    assert len(ov["series"]["signups"]) == 7 and ov["series"]["views"][-1]["value"] >= 1  # one visitor, counted once
    assert ov["funnel"][0]["step"] == "Signed up" and any(e["type"] == "page.published" for e in ov["recent"])

    found = c.get("/api/admin/users?q=maker", headers=boss).json()
    assert found["total"] == 1
    uid = found["users"][0]["id"]
    assert found["users"][0]["pages"] == 1 and found["users"][0]["views"] >= 1
    detail = c.get(f"/api/admin/users/{uid}", headers=boss).json()
    assert detail["projects"][0]["slug"] == slug and detail["messages"] == 1 and detail["uploads"]["count"] == 1

    # Messages: metadata only, never what the visitor wrote.
    msgs = c.get("/api/admin/messages", headers=boss).json()
    assert msgs["total"] >= 1 and "body" not in msgs["messages"][0] and "Private note" not in str(msgs)

    # CSV export neutralises spreadsheet formulas.
    csv_text = c.get("/api/admin/users.csv", headers=boss).text
    assert csv_text.startswith("id,name,email") and "maker@example.com" in csv_text

    # Suspending signs them out, blocks login and hides their pages.
    boss_id = c.get("/api/auth/me", headers=boss).json()["user"]["id"]
    assert c.post(f"/api/admin/users/{boss_id}/suspend", json={}, headers=boss).status_code == 400  # not yourself
    assert c.post(f"/api/admin/users/{uid}/suspend", json={"reason": "spam"}, headers=boss).status_code == 200
    assert c.get("/api/projects", headers=user).status_code == 401
    assert c.post("/api/auth/login", json={"email": "maker@example.com", "password": "correct horse"}).status_code == 403
    assert c.get(f"/api/public/{slug}").status_code == 404
    assert c.get("/api/admin/users?state=suspended", headers=boss).json()["total"] == 1
    c.post(f"/api/admin/users/{uid}/unsuspend", headers=boss)
    user = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": "maker@example.com", "password": "correct horse"}).json()["token"]}
    assert c.get(f"/api/public/{slug}").status_code == 200

    # Admin rights: grant and revoke (never your own).
    assert c.patch(f"/api/admin/users/{uid}/admin", json={"isAdmin": True}, headers=boss).status_code == 200
    assert c.get("/api/admin/system", headers=user).status_code == 200
    assert c.patch(f"/api/admin/users/{uid}/admin", json={"isAdmin": False}, headers=user).status_code == 400
    c.patch(f"/api/admin/users/{uid}/admin", json={"isAdmin": False}, headers=boss)
    assert c.get("/api/admin/system", headers=user).status_code == 403

    # Takedown unpublishes but keeps the project.
    assert c.post(f"/api/admin/pages/{slug}/takedown", json={"reason": "test"}, headers=boss).status_code == 200
    assert c.get(f"/api/public/{slug}").status_code == 404 and c.get("/api/projects/p-adm", headers=user).status_code == 200

    # Orphaned uploads (older than a day, used nowhere) can be cleaned up.
    with _sq.connect(DB_PATH) as db:
        db.execute("UPDATE uploads SET created_at = created_at - 2 * 86400000 WHERE name = ?", (up["name"],))
    st = c.get("/api/admin/storage", headers=boss).json()
    assert st["orphans"]["count"] >= 1
    assert c.post("/api/admin/storage/cleanup", headers=boss).json()["files"] >= 1
    assert not (UPLOAD_DIR / up["name"]).exists()

    # Activity log: filter by type prefix; admin actions are audited.
    audit = c.get("/api/admin/activity?type=admin.", headers=boss).json()
    kinds = {e["type"] for e in audit["events"]}
    assert {"admin.suspend", "admin.unsuspend", "admin.takedown", "admin.grant", "admin.revoke", "admin.cleanup_uploads"} <= kinds
    assert all(e["actorName"] == "Alex Morgan" for e in audit["events"] if e["actorId"])
    assert any(e["data"].get("via") == "terminal" for e in audit["events"])  # the first grant came from the terminal

    sysinfo = c.get("/api/admin/system", headers=boss).json()
    assert sysinfo["status"] == "ok" and sysinfo["tables"]["users"] >= 2 and sysinfo["services"]["ai"]["configured"] is False

    # Deleting needs the email typed exactly, and removes everything.
    assert c.request("DELETE", f"/api/admin/users/{uid}", json={"email": "wrong@example.com"}, headers=boss).status_code == 400
    assert c.request("DELETE", f"/api/admin/users/{uid}", json={"email": "maker@example.com"}, headers=boss).status_code == 204
    assert c.get(f"/api/admin/users/{uid}", headers=boss).status_code == 404
    assert c.get("/api/projects", headers=user).status_code == 401


def test_unsafe_links_and_media_are_removed():
    from app.safety import clean
    dirty = {
        "link": "JaVa	ScRiPt:alert(1)", "website": " javascript:alert(1)", "url": "vbscript:x", "href": "data:text/html,<script>",
        "projects": [{"link": "https://ok.example/a", "media": [{"src": "https://tracker.example/p.png"}, {"src": "/uploads/" + "a" * 32 + ".png"}]}],
        "files": [{"src": "javascript:alert(1)//x.pdf", "name": "Report"}],
        "photo": "data:image/png;base64,iVBORw0KGgo=", "cover": {"src": "//evil.example/x.jpg"},
        "linkedin": "linkedin.com/in/alex", "email": "alex@example.com", "notes": "javascript: is my favourite language",
        "other": "javascript:alert(document.cookie)", "contact": "mailto:alex@example.com",
    }
    c = clean(dirty)
    assert c["link"] == c["website"] == c["url"] == c["href"] == "" and c["files"][0]["src"] == ""
    assert c["projects"][0]["link"] == "https://ok.example/a"
    assert c["projects"][0]["media"][0]["src"] == "" and c["projects"][0]["media"][1]["src"].startswith("/uploads/")
    assert c["photo"].startswith("data:image/png") and c["cover"]["src"] == ""
    assert c["linkedin"] == "linkedin.com/in/alex" and c["email"] == "alex@example.com" and c["contact"].startswith("mailto:")
    assert c["notes"] == "" and c["other"] == ""  # anything that *is* a script link goes, wherever it sits

    # End to end: saved, published and served clean.
    client_ = client(); h = sign_up(client_, "links@example.com")
    case = {"id": "p-links", "type": "case", "template": "snapshot", "title": "Case", "updatedAt": 1,
            "files": [{"type": "file", "src": "javascript:alert(1)//r.pdf", "name": "Report"}], "link": "javascript:alert(2)"}
    saved = client_.put("/api/projects/p-links", json=case, headers=h).json()["project"]
    assert saved["files"][0]["src"] == "" and saved["link"] == ""
    slug = client_.post("/api/projects/p-links/publish", headers=h).json()["slug"]
    # A page published before these rules existed is cleaned when it's served.
    import sqlite3 as _sq, json as _json
    from app.config import DB_PATH
    with _sq.connect(DB_PATH) as db:
        db.execute("UPDATE publications SET data = ? WHERE slug = ?", (_json.dumps({**case, "photo": "https://tracker.example/me.png"}), slug))
    page = client_.get(f"/api/public/{slug}").json()["project"]
    assert page["files"][0]["src"] == "" and page["link"] == "" and page["photo"] == ""


def test_login_and_signup_are_rate_limited():
    from app.routers import auth
    c = client(); sign_up(c, "target@example.com")
    auth.login_fails.clear(); auth.login_ips.clear(); auth.signup_ips.clear()
    old = (auth.login_fails.limit, auth.login_ips.limit, auth.signup_ips.limit)
    auth.login_fails.limit, auth.login_ips.limit, auth.signup_ips.limit = 5, 1000, 3
    try:
        bad = {"email": "target@example.com", "password": "wrong-guess"}
        codes = [c.post("/api/auth/login", json=bad).status_code for _ in range(7)]
        assert codes[:5] == [401] * 5 and codes[5:] == [429, 429]
        # Locked even with the right password until the window passes.
        assert c.post("/api/auth/login", json={"email": "target@example.com", "password": "correct horse"}).status_code == 429
        auth.login_fails.clear()
        assert c.post("/api/auth/login", json={"email": "TARGET@example.com", "password": "correct horse"}).status_code == 200
        # Unknown emails are throttled the same way (no hint about who has an account).
        assert [c.post("/api/auth/login", json={"email": "ghost@example.com", "password": "x" * 8}).status_code for _ in range(6)][-1] == 429
        # Per-visitor cap on new accounts.
        codes = [c.post("/api/auth/signup", json={"name": "Bot", "email": f"bot{i}@example.com", "password": "plum orchard 7"}).status_code for i in range(4)]
        assert codes == [201, 201, 201, 429]
    finally:
        auth.login_fails.limit, auth.login_ips.limit, auth.signup_ips.limit = old
        auth.login_fails.clear(); auth.login_ips.clear(); auth.signup_ips.clear()


def test_security_headers():
    c = client()
    h = c.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in h["content-security-policy"] and h["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "strict-transport-security" not in h  # only over HTTPS
    # X-Forwarded-Proto is only believed behind a configured proxy (anyone can send it).
    assert "strict-transport-security" not in c.get("/api/health", headers={"X-Forwarded-Proto": "https"}).headers
    from app import config
    old, config.TRUST_PROXY_HOPS = config.TRUST_PROXY_HOPS, 1
    try:
        assert "strict-transport-security" in c.get("/api/health", headers={"X-Forwarded-Proto": "https"}).headers
    finally:
        config.TRUST_PROXY_HOPS = old


def test_cookie_sessions_and_csrf():
    """The browser flow: an HttpOnly cookie, no token in the page, and changes
    need the X-Dixlab-Request header (so other sites can't act for you)."""
    c = TestClient(app); c.__enter__()
    r = c.post("/api/auth/signup", json={"name": "Cookie", "email": "cookie@example.com", "password": "plum orchard 7"})
    assert r.status_code == 201 and "token" not in r.json()
    set_cookie = r.headers["set-cookie"].lower()
    assert "dixlab_session=" in set_cookie and "httponly" in set_cookie and "samesite=lax" in set_cookie
    assert c.get("/api/auth/me").json()["user"]["email"] == "cookie@example.com"
    p = {"id": "p-ck", "type": "case", "template": "snapshot", "title": "Cookie case", "updatedAt": 1}
    assert c.put("/api/projects/p-ck", json=p).status_code == 403  # no header: blocked like a cross-site request
    assert c.put("/api/projects/p-ck", json=p, headers={"X-Dixlab-Request": "1"}).status_code == 200
    # Moving an old-style token (localStorage) onto the cookie.
    legacy = TestClient(app, headers={"X-Dixlab-Want-Token": "1"}); legacy.__enter__()
    tok = legacy.post("/api/auth/login", json={"email": "cookie@example.com", "password": "plum orchard 7"}).json()["token"]
    fresh = TestClient(app); fresh.__enter__()
    adopted = fresh.post("/api/auth/adopt", headers={"Authorization": f"Bearer {tok}"})
    assert adopted.status_code == 200 and "dixlab_session=" in adopted.headers["set-cookie"]
    assert fresh.get("/api/auth/me").status_code == 200
    # Logging out ends the session and clears the cookie.
    assert c.post("/api/auth/logout", headers={"X-Dixlab-Request": "1"}).status_code == 204
    assert c.get("/api/auth/me").status_code == 401


def test_storage_quota_project_limit_views_and_suspended_files(monkeypatch):
    import sqlite3 as _sq
    from app.config import DB_PATH
    from app.routers import projects as projects_mod, uploads as uploads_mod, publish as publish_mod
    c = client(); h = sign_up(c, "quota@example.com")
    from app import config as cfg
    monkeypatch.setattr(cfg, "MAX_STORAGE_BYTES_PER_USER", 3 * 1024 * 1024)  # the cap when plan limits are off
    blob = lambda mb: PNG[:8] + bytes(mb * 1024 * 1024)
    post = lambda data: c.post("/api/uploads", files={"file": ("a.png", data, "image/png")}, headers=h)
    first = post(blob(2)); assert first.status_code == 201
    r = post(blob(2)); assert r.status_code == 413 and "storage is full" in r.json()["detail"]
    # Unused uploads (in no project) are freed automatically once they're over an hour old.
    with _sq.connect(DB_PATH) as db:
        db.execute("UPDATE uploads SET created_at = created_at - 7200000 WHERE name = ?", (first.json()["name"],))
    assert post(blob(2)).status_code == 201

    monkeypatch.setattr(projects_mod, "MAX_PROJECTS_PER_USER", 2)
    for i in range(2):
        assert c.put(f"/api/projects/p-q{i}", json={"id": f"p-q{i}", "type": "cv", "template": "classic", "updatedAt": 1}, headers=h).status_code == 200
    r = c.put("/api/projects/p-q9", json={"id": "p-q9", "type": "cv", "template": "classic", "updatedAt": 1}, headers=h)
    assert r.status_code == 409 and "limit of 2 projects" in r.json()["detail"]
    assert c.put("/api/projects/p-q0", json={"id": "p-q0", "type": "cv", "template": "classic", "title": "edit", "updatedAt": 2}, headers=h).status_code == 200

    # Views: once per visitor per 30 minutes, and the owner's own visits don't count.
    publish_mod._seen.clear()
    slug = c.post("/api/projects/p-q0/publish", headers=h).json()["slug"]
    for _ in range(5):
        c.get(f"/api/public/{slug}")
    c.get(f"/api/public/{slug}", headers=h)
    assert c.get("/api/projects/p-q0/publish", headers=h).json()["views"] == 1

    # Files are served by the app; a suspended account's files aren't.
    name = post(blob(0)).json()["name"]
    ok = c.get(f"/uploads/{name}")
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/png" and ok.headers["x-content-type-options"] == "nosniff"
    assert c.get(f"/uploads/{name}", headers={"Range": "bytes=0-3"}).status_code == 206
    assert c.get("/uploads/../app/config.py").status_code == 404 and c.get("/uploads/not-a-real-file.png").status_code == 404
    with _sq.connect(DB_PATH) as db:
        db.execute("UPDATE users SET suspended_at = 1 WHERE email = 'quota@example.com'")
    assert c.get(f"/uploads/{name}").status_code == 404


def test_trusted_proxy_ip(monkeypatch):
    import app.config as cfg
    from app.ratelimit import client_ip
    class Req:
        def __init__(self, xff): self.headers = {"x-forwarded-for": xff}; self.client = type("C", (), {"host": "10.0.0.1"})()
    monkeypatch.setattr(cfg, "TRUST_PROXY_HOPS", 0)
    assert client_ip(Req("6.6.6.6, 1.2.3.4")) == "10.0.0.1"  # header ignored unless configured: it can be faked
    monkeypatch.setattr(cfg, "TRUST_PROXY_HOPS", 1)
    assert client_ip(Req("6.6.6.6, 1.2.3.4")) == "1.2.3.4"   # the entry our one proxy added, not the visitor's claim


def _outbox(monkeypatch):
    """Capture account emails instead of sending them."""
    from app import mailer
    sent = []
    monkeypatch.setattr(mailer, "can_send", lambda: True)
    monkeypatch.setattr(mailer, "send", lambda to, subject, body, reply_to=None: sent.append({"to": to, "subject": subject, "body": body}) or True)
    return sent


def _link_token(mail, path):
    import re as _re
    return _re.search(path + r"#token=([A-Za-z0-9_\-]+)", mail["body"]).group(1)


def test_email_verification(monkeypatch):
    from app.routers import account
    account.sends_per_user.clear(); account.token_tries_ip.clear()
    sent = _outbox(monkeypatch)
    c = client(); h = sign_up(c, "verify@example.com", verified=False)
    assert sent and sent[-1]["to"] == "verify@example.com" and "/verify-email#token=" in sent[-1]["body"]
    assert c.get("/api/auth/me", headers=h).json()["user"]["emailVerified"] is False
    # Can't publish a new page until verified.
    c.put("/api/projects/p-v", json={"id": "p-v", "type": "case", "template": "snapshot", "title": "V", "updatedAt": 1}, headers=h)
    r = c.post("/api/projects/p-v/publish", headers=h)
    assert r.status_code == 403 and r.json()["code"] == "email_unverified"
    # Resend gives a new link; the old one stops working.
    old = _link_token(sent[-1], "/verify-email")
    assert c.post("/api/auth/verify/send", headers=h).json()["sent"] is True
    new = _link_token(sent[-1], "/verify-email")
    assert c.post("/api/auth/verify", json={"token": old}).status_code == 400
    assert c.post("/api/auth/verify", json={"token": "x" * 40}).status_code == 400
    assert c.post("/api/auth/verify", json={"token": new}).json() == {"verified": True}
    assert c.post("/api/auth/verify", json={"token": new}).status_code == 400  # one use only
    assert c.get("/api/auth/me", headers=h).json()["user"]["emailVerified"] is True
    assert c.post("/api/projects/p-v/publish", headers=h).status_code == 200
    # Resending is rate limited.
    account.sends_per_user.clear()
    h2 = sign_up(c, "spammy@example.com", verified=False)
    codes = [c.post("/api/auth/verify/send", headers=h2).status_code for _ in range(4)]
    assert 429 in codes
    account.sends_per_user.clear()


def test_password_reset_and_change(monkeypatch):
    from app.routers import account
    account.sends_per_user.clear(); account.forgot_per_ip.clear(); account.token_tries_ip.clear()
    sent = _outbox(monkeypatch)
    c = client(); h = sign_up(c, "reset@example.com")
    # Same answer whether or not the account exists.
    a = c.post("/api/auth/password/forgot", json={"email": "reset@example.com"})
    b = c.post("/api/auth/password/forgot", json={"email": "nobody-at-all@example.com"})
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    resets = [m for m in sent if "reset-password" in m["body"]]
    assert len(resets) == 1 and resets[0]["to"] == "reset@example.com"
    token = _link_token(resets[0], "/reset-password")
    assert c.post("/api/auth/password/reset", json={"token": token, "password": "short"}).status_code == 422
    assert c.post("/api/auth/password/reset", json={"token": token, "password": "brand new pass"}).json() == {"ok": True}
    assert c.post("/api/auth/password/reset", json={"token": token, "password": "another pass 1"}).status_code == 400  # used
    assert c.get("/api/auth/me", headers=h).status_code == 401  # every old login ended
    assert c.post("/api/auth/login", json={"email": "reset@example.com", "password": "correct horse"}).status_code == 401
    login = c.post("/api/auth/login", json={"email": "reset@example.com", "password": "brand new pass"})
    assert login.status_code == 200
    h = {"Authorization": f"Bearer {login.json()['token']}"}
    # Expired links don't work.
    import sqlite3 as _sq
    from app.config import DB_PATH
    c.post("/api/auth/password/forgot", json={"email": "reset@example.com"})
    tok2 = _link_token([m for m in sent if "reset-password" in m["body"]][-1], "/reset-password")
    with _sq.connect(DB_PATH) as db:
        db.execute("UPDATE email_tokens SET expires_at = 1 WHERE purpose = 'reset'")
    assert c.post("/api/auth/password/reset", json={"token": tok2, "password": "brand new pass 2"}).status_code == 400
    # Change password: needs the current one; other devices are signed out, this one isn't.
    other_tok = c.post("/api/auth/login", json={"email": "reset@example.com", "password": "brand new pass"}).json()["token"]
    other = {"Authorization": f"Bearer {other_tok}"}
    assert c.post("/api/auth/password/change", json={"current": "wrong", "password": "newer password"}, headers=h).status_code == 400
    assert c.post("/api/auth/password/change", json={"current": "brand new pass", "password": "newer password"}, headers=h).status_code == 200
    assert c.get("/api/auth/me", headers=h).status_code == 200 and c.get("/api/auth/me", headers=other).status_code == 401
    # No email server: say so instead of pretending.
    from app import mailer
    monkeypatch.setattr(mailer, "can_send", lambda: False)
    account.forgot_per_ip.clear()
    assert c.post("/api/auth/password/forgot", json={"email": "reset@example.com"}).status_code == 503


def test_delete_my_account():
    import sqlite3 as _sq
    from app.config import DB_PATH, UPLOAD_DIR
    c = client(); h = sign_up(c, "leaving@example.com")
    c.put("/api/projects/p-bye", json={"id": "p-bye", "type": "case", "template": "snapshot", "title": "Bye", "updatedAt": 1}, headers=h)
    slug = c.post("/api/projects/p-bye/publish", headers=h).json()["slug"]
    up = c.post("/api/uploads", files={"file": ("a.png", PNG, "image/png")}, headers=h).json()
    assert c.request("DELETE", "/api/auth/me", json={"password": "wrong"}, headers=h).status_code == 400
    assert c.request("DELETE", "/api/auth/me", json={"password": "correct horse"}, headers=h).status_code == 204
    assert c.get("/api/auth/me", headers=h).status_code == 401
    assert c.get(f"/api/public/{slug}").status_code == 404 and not (UPLOAD_DIR / up["name"]).exists()
    with _sq.connect(DB_PATH) as db:
        assert db.execute("SELECT COUNT(*) FROM users WHERE email = 'leaving@example.com'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM events WHERE type = 'user.deleted_self'").fetchone()[0] >= 1
    assert c.post("/api/auth/login", json={"email": "leaving@example.com", "password": "correct horse"}).status_code == 401


def test_account_email_and_password_hardening(monkeypatch):
    from app import mailer
    from app.routers import account
    account.sends_per_user.clear(); account.forgot_per_ip.clear(); account.wrong_password.clear()
    sent = _outbox(monkeypatch)
    # Names chosen at sign-up can't put links into emails sent to someone else's address.
    c = client()
    c.post("/api/auth/signup", json={"name": "http://evil.example/login Click", "email": "victim@example.com", "password": "plum orchard 7"})
    mail = [m for m in sent if m["to"] == "victim@example.com"][-1]
    assert mail["body"].startswith("Hi there,") and "evil" not in mail["body"]
    # Tokens travel after "#" (never sent to servers or logs).
    assert "/verify-email#token=" in mail["body"] and "?token=" not in mail["body"]
    # Wrong current password: locked after 5 tries, for change and delete alike.
    h = sign_up(c, "guess@example.com")
    codes = [c.post("/api/auth/password/change", json={"current": f"nope{i}xx", "password": "whatever123"}, headers=h).status_code for i in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429
    assert c.request("DELETE", "/api/auth/me", json={"password": "correct horse"}, headers=h).status_code == 429
    account.wrong_password.clear()
    # Changing the password cancels unused reset links.
    account.forgot_per_ip.clear(); account.sends_per_user.clear()
    c.post("/api/auth/password/forgot", json={"email": "guess@example.com"})
    tok = _link_token([m for m in sent if "reset-password" in m["body"]][-1], "/reset-password")
    assert c.post("/api/auth/password/change", json={"current": "correct horse", "password": "changed pass 1"}, headers=h).status_code == 200
    assert c.post("/api/auth/password/reset", json={"token": tok, "password": "attacker pass 1"}).status_code == 400
    # The example SMTP host from .env.example doesn't count as a mail server.
    monkeypatch.setattr(mailer, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(mailer, "SMTP_FROM", "Dixlab <no-reply@example.com>")
    assert mailer.placeholder_host() and not mailer.configured()
    for name, want in [("Ada Lovelace", "Ada"), ("www.evil.com", "there"), ("Jean-Luc Picard", "Jean-Luc"), ("", "there")]:
        assert mailer.safe_name(name) == want


# ---------- hardening: shared limits, passwords, two-step login, idle sessions, uploads, production ----------

def test_rate_limits_are_shared_and_persist():
    """Limits live in their own SQLite file: a fresh Limiter object (another
    worker, or the server after a restart) sees the same hits."""
    from app.ratelimit import Limiter, path
    a = Limiter("test_shared", 2, 60)
    a.clear()
    assert a.hit("k") and a.hit("k") and not a.hit("k")
    b = Limiter("test_shared", 2, 60)  # e.g. another process
    assert b.blocked("k") and not b.hit("k")
    assert not b.blocked("other")
    b.reset("k")
    assert a.hit("k")
    assert path().exists() and path().name.endswith("-ratelimits.db")


def test_password_rules():
    from app import passwords
    for bad in ("password1", "12345678", "aaaaaaaa", "abababab", "23456789", "qwertyuiop", "Passw0rd"):
        assert passwords.problem(bad), bad
    assert passwords.problem("jordan.lee99", "jordan.lee@example.com")       # just the email
    assert passwords.problem("Sam Rivera1", "x@example.com", "Sam Rivera")   # just the name
    assert passwords.problem("plum orchard 7", "jordan@example.com", "Jordan") is None
    c = client()
    r = c.post("/api/auth/signup", json={"name": "Weak", "email": "weak@example.com", "password": "password1"})
    assert r.status_code == 422 and "common" in r.json()["detail"]
    h = sign_up(c, "rules@example.com")
    r = c.post("/api/auth/password/change", json={"current": "correct horse", "password": "iloveyou1"}, headers=h)
    assert r.status_code == 422


def test_pwned_check_uses_k_anonymity(monkeypatch):
    import hashlib
    from app import passwords
    seen = {}
    full = hashlib.sha1(b"plum orchard 7").hexdigest().upper()

    class Res:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return f"{full[5:]}:42\r\nABCDEF0123456789ABCDEF0123456789ABC:0".encode()

    def fake_open(req, timeout):
        seen["url"] = req.full_url
        return Res()

    def down(*a, **k):
        raise OSError("down")
    monkeypatch.setattr(passwords.urllib.request, "urlopen", fake_open)
    monkeypatch.setattr(passwords, "PWNED_PASSWORD_CHECK", True)
    assert "breach" in passwords.problem("plum orchard 7")
    assert seen["url"].endswith("/range/" + full[:5])  # only the 5-character prefix leaves the server
    monkeypatch.setattr(passwords.urllib.request, "urlopen", down)
    assert passwords.problem("plum orchard 7") is None  # an outage never blocks sign-up


def _other_code(secret):
    from app import totp
    return "000000" if totp.current_code(secret) != "000000" else "000001"


def test_totp_codes():
    import base64
    from app import totp
    s = totp.new_secret()
    step = totp.verify(s, totp.current_code(s))
    assert step is not None
    assert totp.verify(s, totp.current_code(s), last_step=step) is None   # each code once
    assert totp.verify(s, "12345") is None and totp.verify(s, "") is None
    # RFC 6238 test vector (SHA-1, T = 59s): 94287082 -> last 6 digits.
    rfc = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
    assert totp.current_code(rfc, at=59) == "287082"
    assert totp.otpauth_url(s, "a@b.co").startswith("otpauth://totp/Dixlab%3Aa%40b.co?secret=")


def test_two_step_login_flow():
    import sqlite3 as _sq
    from app import totp
    from app.config import DB_PATH
    from app.routers import twofactor
    twofactor.wrong_code.clear()
    c = client()
    h = sign_up(c, "twostep@example.com")
    creds = {"email": "twostep@example.com", "password": "correct horse"}
    other = {"Authorization": f"Bearer {c.post('/api/auth/login', json=creds).json()['token']}"}
    assert c.post("/api/auth/2fa/setup", json={"password": "wrong pw"}, headers=h).status_code == 400
    setup = c.post("/api/auth/2fa/setup", json={"password": "correct horse"}, headers=h).json()
    secret = setup["secret"]
    assert setup["otpauthUrl"].startswith("otpauth://totp/")
    assert c.post("/api/auth/2fa/enable", json={"code": _other_code(secret)}, headers=h).status_code == 400
    on = c.post("/api/auth/2fa/enable", json={"code": totp.current_code(secret)}, headers=h)
    assert on.status_code == 200, on.text
    codes = on.json()["recoveryCodes"]
    assert len(codes) == 10
    assert c.get("/api/auth/me", headers=h).json()["user"]["twoFactor"] is True
    assert c.get("/api/auth/me", headers=other).status_code == 401  # other devices signed out
    with _sq.connect(DB_PATH) as db:
        stored = [r[0] for r in db.execute("SELECT code_hash FROM recovery_codes")]
    assert codes[0] not in stored  # only hashes are kept

    r = c.post("/api/auth/login", json=creds)
    assert r.status_code == 401 and r.json()["code"] == "two_factor_required" and "token" not in r.json()
    r = c.post("/api/auth/login", json={**creds, "code": _other_code(secret)})
    assert r.status_code == 401 and r.json()["code"] == "two_factor_invalid"
    # The code used to turn it on can't be replayed to log in.
    assert c.post("/api/auth/login", json={**creds, "code": totp.current_code(secret)}).status_code == 401
    # A recovery code works once.
    assert c.post("/api/auth/login", json={**creds, "code": codes[0].upper()}).status_code == 200
    assert c.post("/api/auth/login", json={**creds, "code": codes[0]}).status_code == 401
    assert c.get("/api/auth/2fa", headers=h).json() == {"enabled": True, "recoveryCodesLeft": 9}
    # A right code doesn't make up for a wrong password.
    assert c.post("/api/auth/login", json={**creds, "password": "nope nope", "code": codes[1]}).status_code == 401
    # Turning it off needs the password and a code.
    assert c.post("/api/auth/2fa/disable", json={"password": "correct horse", "code": _other_code(secret)}, headers=h).status_code == 400
    assert c.post("/api/auth/2fa/disable", json={"password": "correct horse", "code": codes[1]}, headers=h).json() == {"enabled": False}
    assert c.post("/api/auth/login", json=creds).status_code == 200
    twofactor.wrong_code.clear()


def test_wrong_two_step_codes_are_limited():
    from app import totp
    from app.routers import auth, twofactor
    twofactor.wrong_code.clear(); auth.login_fails.clear()
    c = client()
    h = sign_up(c, "codeguess@example.com")
    secret = c.post("/api/auth/2fa/setup", json={"password": "correct horse"}, headers=h).json()["secret"]
    c.post("/api/auth/2fa/enable", json={"code": totp.current_code(secret)}, headers=h)
    creds = {"email": "codeguess@example.com", "password": "correct horse"}
    results = [c.post("/api/auth/login", json={**creds, "code": _other_code(secret)}).status_code for _ in range(6)]
    assert results[:5] == [401] * 5 and results[5] == 429
    twofactor.wrong_code.clear(); auth.login_fails.clear()


def test_admins_need_two_step_when_required(monkeypatch):
    from app import admin_cli, security, totp
    from app.routers import twofactor
    twofactor.wrong_code.clear()
    c = client()
    h = sign_up(c, "secure-admin@example.com")
    assert admin_cli.main(["grant", "secure-admin@example.com"]) == 0
    monkeypatch.setattr(security, "ADMIN_REQUIRE_2FA", True)
    r = c.get("/api/admin/overview", headers=h)
    assert r.status_code == 403 and "two-step" in r.json()["detail"]
    secret = c.post("/api/auth/2fa/setup", json={"password": "correct horse"}, headers=h).json()["secret"]
    c.post("/api/auth/2fa/enable", json={"code": totp.current_code(secret)}, headers=h)
    assert c.get("/api/admin/overview", headers=h).status_code == 200
    # Lost phone and codes: reset from the server's terminal.
    assert admin_cli.main(["reset-2fa", "secure-admin@example.com"]) == 0
    assert c.get("/api/auth/me", headers=h).status_code == 401  # logged out everywhere
    login = c.post("/api/auth/login", json={"email": "secure-admin@example.com", "password": "correct horse"})
    assert login.status_code == 200 and login.json()["user"]["twoFactor"] is False
    admin_cli.main(["revoke", "secure-admin@example.com"])


def test_idle_sessions_end():
    import sqlite3 as _sq
    import time as _time
    from app.config import DB_PATH, SESSION_IDLE_DAYS
    c = client()
    h = sign_up(c, "idle@example.com")
    assert c.get("/api/auth/me", headers=h).status_code == 200
    q = "UPDATE sessions SET last_used_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)"
    with _sq.connect(DB_PATH) as db:
        db.execute(q, (int(_time.time()) - SESSION_IDLE_DAYS * 86400 - 60, "idle@example.com"))
    assert c.get("/api/auth/me", headers=h).status_code == 401
    # Activity keeps a session alive: last_used_at moves forward.
    h = sign_up(c, "busy@example.com")
    with _sq.connect(DB_PATH) as db:
        db.execute(q, (int(_time.time()) - 3600, "busy@example.com"))
    assert c.get("/api/auth/me", headers=h).status_code == 200
    with _sq.connect(DB_PATH) as db:
        used = db.execute("SELECT last_used_at FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)",
                          ("busy@example.com",)).fetchone()[0]
    assert used > _time.time() - 60


def test_documents_with_active_content_are_refused():
    import io
    import zipfile as _zip
    import zlib as _zlib
    c = client()
    h = sign_up(c, "docs-safety@example.com")

    def up(name, data):
        return c.post("/api/uploads", files={"file": (name, data, "application/octet-stream")}, headers=h)
    clean = b"%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n%%EOF"
    assert up("ok.pdf", clean).status_code == 201
    hidden = (b"%PDF-1.7\n2 0 obj << /Type /ObjStm /Filter /FlateDecode >>\nstream\n"
              + _zlib.compress(b"<< /Names << /EmbeddedFiles 3 0 R >> >>") + b"\nendstream\nendobj")
    for evil in (b"%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj",
                 b"%PDF-1.7\n1 0 obj << /S /Launch /F (cmd.exe) >> endobj",
                 b"%PDF-1.7\n1 0 obj << /S /J#61vaScript >> endobj",  # hex-escaped name
                 hidden):                                               # inside a compressed stream
        r = up("evil.pdf", evil)
        assert r.status_code == 422, evil
        assert "active content" in r.json()["detail"]

    def office(extra: dict) -> bytes:
        buf = io.BytesIO()
        with _zip.ZipFile(buf, "w") as z:
            z.writestr("[Content_Types].xml", "<Types/>")
            z.writestr("word/document.xml", "<w:document/>")
            for k, v in extra.items():
                z.writestr(k, v)
        return buf.getvalue()

    def rels(kind, target):
        return ('<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                f'relationships/{kind}" Target="{target}" TargetMode="External"/></Relationships>')
    assert up("fine.docx", office({"word/_rels/document.xml.rels": rels("hyperlink", "https://alex.dev")})).status_code == 201
    assert "macros" in up("macro.docx", office({"word/vbaProject.bin": b"\x00" * 32})).json()["detail"]
    remote = office({"word/_rels/settings.xml.rels": rels("attachedTemplate", "http://evil.example/t.dotm")})
    assert "internet" in up("remote.docx", remote).json()["detail"]


def test_clamav_scanning(monkeypatch):
    from app import scan
    c = client()
    h = sign_up(c, "virus@example.com")
    monkeypatch.setattr(scan, "CLAMAV", "127.0.0.1:1")  # nothing listens: refuse rather than store unscanned
    assert c.post("/api/uploads", files={"file": ("a.png", PNG, "image/png")}, headers=h).status_code == 503
    calls = []

    class FakeSock:
        def __init__(self, reply): self.reply = reply
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def sendall(self, b): calls.append(b)

        def recv(self, n):
            r, self.reply = self.reply, b""
            return r
    monkeypatch.setattr(scan.socket, "create_connection", lambda *a, **k: FakeSock(b"stream: Eicar-Test-Signature FOUND\0"))
    r = c.post("/api/uploads", files={"file": ("a.png", PNG, "image/png")}, headers=h)
    assert r.status_code == 422 and "virus" in r.json()["detail"]
    assert calls[0] == b"zINSTREAM\0"
    monkeypatch.setattr(scan.socket, "create_connection", lambda *a, **k: FakeSock(b"stream: OK\0"))
    assert c.post("/api/uploads", files={"file": ("a.png", PNG, "image/png")}, headers=h).status_code == 201


def test_production_checks(monkeypatch):
    import pytest
    from app import config, prodcheck
    monkeypatch.setattr(config, "PRODUCTION", True)
    monkeypatch.setattr(config, "MAIL_TO_LOG", True)
    monkeypatch.setattr(config, "PUBLIC_URL", "http://dixlab.example")
    monkeypatch.setattr(config, "CORS_ORIGINS", ["http://localhost:5173"])
    errors, _ = prodcheck.findings()
    assert len(errors) == 3
    with pytest.raises(RuntimeError):
        prodcheck.run_on_startup()
    monkeypatch.setattr(config, "MAIL_TO_LOG", False)
    monkeypatch.setattr(config, "PUBLIC_URL", "https://dixlab.example")
    monkeypatch.setattr(config, "CORS_ORIGINS", ["https://dixlab.example"])
    monkeypatch.setattr(config, "API_DOCS", True)
    errors, warnings = prodcheck.findings()
    assert errors == [] and any("/docs" in w for w in warnings)
    prodcheck.run_on_startup()  # warnings only: it starts


def test_background_images_must_be_dixlabs_own():
    from app import safety
    own = "/uploads/" + "a" * 32 + ".jpg"
    for bad in ("https://tracker.example/x.png", "javascript:alert(1)", "//evil.example/x.png"):
        assert safety.clean({"brand": {"bgImage": bad}})["brand"]["bgImage"] == ""
    assert safety.clean({"brand": {"bgImage": own}})["brand"]["bgImage"] == own
