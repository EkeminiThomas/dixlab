"""End-to-end tests for the Dixlab API. Run from backend/:  python -m pytest"""
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp())
os.environ["DIXLAB_DB"] = str(_tmp / "test.db")
os.environ["DIXLAB_UPLOADS"] = str(_tmp / "uploads")
os.environ.pop("ANTHROPIC_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def client():
    c = TestClient(app)
    c.__enter__()  # run startup (creates the schema)
    return c


def sign_up(c, email="alex@example.com"):
    r = c.post("/api/auth/signup", json={"name": "Alex Morgan", "email": email, "password": "correct horse"})
    assert r.status_code == 201, r.text
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
    assert c.get("/api/projects/p-pub/publish", headers=h).json()["views"] == 3
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
