"""Connect Figma (OAuth): the sign-in round trip, encrypted tokens, renewal, and the file picker."""
import sqlite3
import struct
from urllib.parse import parse_qs, urlsplit

import pytest

from test_api import client, sign_up  # sets up the test database and environment first

from app import config as cfg, figma, figma_auth, project_images
from app.db import connect


def png(w=800, h=500):
    return b"\x89PNG\r\n\x1a\n" + b"\0\0\0\rIHDR" + struct.pack(">II", w, h) + b"\x08\x06\0\0\0" + b"\0" * 100


@pytest.fixture
def oauth(monkeypatch):
    monkeypatch.setattr(cfg, "FIGMA_CLIENT_ID", "client-id-123")
    monkeypatch.setattr(cfg, "FIGMA_CLIENT_SECRET", "client-secret-456")
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "")
    calls = []

    def token_call(form):
        calls.append(form)
        if form["grant_type"] == "authorization_code":
            return {"access_token": "figu_access_" + "a" * 30, "refresh_token": "figur_refresh_" + "r" * 30, "expires_in": 7776000, "user_id": "42"}
        return {"access_token": "figu_renewed_" + "b" * 30, "expires_in": 7776000}
    monkeypatch.setattr(figma_auth, "_token_call", token_call)
    seen = []

    def get(path, token, params=None):
        seen.append((path, token))
        if path == "/me":
            return {"id": "42", "handle": "Ada Obi", "img_url": "https://s3.example/ada.png"}
        if path.startswith("/files/"):
            return {"name": "Clinic booking", "lastModified": "2026-10-02T10:00:00Z", "thumbnailUrl": "https://s3.example/clinic.png"}
        raise AssertionError(path)
    monkeypatch.setattr(figma, "_get", get)
    return {"calls": calls, "seen": seen}


def browser(c, email):
    """The Dixlab login cookie a browser would send (the test client drops cookies)."""
    r = c.post("/api/auth/login", json={"email": email, "password": "correct horse"})
    assert r.status_code == 200, r.text
    return {"dixlab_session": r.headers["set-cookie"].split(";")[0].split("=", 1)[1]}


def _connect(c, h, return_to="/editor/p-1"):
    url = c.post("/api/figma/connect", json={"returnTo": return_to}, headers=h).json()["url"]
    q = parse_qs(urlsplit(url).query)
    assert url.startswith("https://www.figma.com/oauth?") and q["client_id"] == ["client-id-123"]
    assert q["redirect_uri"] == [f"{cfg.PUBLIC_URL}/api/figma/callback"] and q["response_type"] == ["code"]
    assert "file_content:read" in q["scope"][0]
    return q["state"][0]


def test_connect_is_hidden_until_the_app_is_set_up(monkeypatch):
    monkeypatch.setattr(cfg, "FIGMA_CLIENT_ID", "")
    c = client(); h = sign_up(c, "fc-off@example.com")
    assert c.get("/api/figma/status", headers=h).json() == {"available": False, "connected": False, "handle": "", "connectedAt": None}
    assert c.post("/api/figma/connect", json={}, headers=h).status_code == 503


def test_signing_in_with_figma_saves_encrypted_tokens_and_is_used(oauth):
    c = client(); h = sign_up(c, "fc-ok@example.com")
    state = _connect(c, h)
    # The callback is a browser visit: it needs the Dixlab login cookie, not a bearer header.
    ck = browser(c, "fc-ok@example.com")
    r = c.get(f"/api/figma/callback?code=abc&state={state}", cookies=ck, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == f"{cfg.PUBLIC_URL}/editor/p-1?figma=connected"
    st = c.get("/api/figma/status", headers=h).json()
    assert st["connected"] and st["handle"] == "Ada Obi"
    with connect() as db:
        row = db.execute("SELECT * FROM figma_connections").fetchone()
        uid = db.execute("SELECT id FROM users WHERE email = 'fc-ok@example.com'").fetchone()[0]
        assert "figu_access_" not in row["access_token"] and "figur_refresh_" not in row["refresh_token"]   # encrypted at rest
        assert figma_auth.pick(db, uid) == "Bearer figu_access_" + "a" * 30
        assert figma_auth.pick(db, uid, "figd_" + "p" * 30) == "figd_" + "p" * 30                       # a pasted token wins
    # The state was used up: replaying the callback fails.
    r = c.get(f"/api/figma/callback?code=abc&state={state}", cookies=ck, follow_redirects=False)
    assert "figma=error" in r.headers["location"]
    assert c.delete("/api/figma/connection", headers=h).status_code == 204
    assert c.get("/api/figma/status", headers=h).json()["connected"] is False


def test_someone_elses_sign_in_cant_be_linked_to_you(oauth):
    c1 = client(); h1 = sign_up(c1, "fc-a@example.com")
    state = _connect(c1, h1)
    c2 = client(); sign_up(c2, "fc-b@example.com")
    r = c2.get(f"/api/figma/callback?code=abc&state={state}", cookies=browser(c2, "fc-b@example.com"), follow_redirects=False)
    assert "figma=error" in r.headers["location"] or "figma=cancelled" in r.headers["location"]
    assert not [x for x in oauth["calls"] if x["grant_type"] == "authorization_code"]   # the code was never swapped


def test_only_dixlab_pages_are_returned_to(oauth):
    c = client(); h = sign_up(c, "fc-ret@example.com")
    for bad in ("https://evil.example/", "//evil.example", "/\\evil.example"):
        state = _connect(c, h, bad)
        with connect() as db:
            assert db.execute("SELECT return_to FROM figma_oauth_states WHERE state = ?", (state,)).fetchone()[0] == "/dashboard"


def test_an_expiring_token_is_renewed(oauth):
    c = client(); h = sign_up(c, "fc-renew@example.com")
    state = _connect(c, h)
    c.get(f"/api/figma/callback?code=abc&state={state}", cookies=browser(c, "fc-renew@example.com"), follow_redirects=False)
    with connect() as db:
        uid = db.execute("SELECT id FROM users WHERE email = 'fc-renew@example.com'").fetchone()[0]
        db.execute("UPDATE figma_connections SET expires_at = 1 WHERE user_id = ?", (uid,))
        assert figma_auth.token(db, uid) == "Bearer figu_renewed_" + "b" * 30
        db.commit()
    assert oauth["calls"][-1] == {"refresh_token": "figur_refresh_" + "r" * 30, "grant_type": "refresh_token"}


def test_the_file_picker_lists_pasted_files_with_thumbnails(oauth, monkeypatch):
    monkeypatch.setattr(project_images, "download", lambda url, client, deadline=None, min_width=480: (png(), "png", "image/png"))
    c = client(); h = sign_up(c, "fc-files@example.com")
    r = c.post("/api/figma/files", json={"urls": ["https://www.figma.com/@ada", "www.figma.com/design/AbCdEfGhIj12/Clinic?node-id=0-1"],
                                          "figmaToken": "figd_" + "x" * 30}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["profile"] is None                                      # profile links are skipped for now
    assert len(body["files"]) == 1
    f = body["files"][0]
    assert f["name"] == "Clinic booking" and f["link"] == "https://www.figma.com/design/AbCdEfGhIj12/Clinic" and f["edited"] == "2026-10-02"
    assert f["thumb"].startswith("data:image/png;base64,")
    assert oauth["seen"][0] == ("/files/AbCdEfGhIj12", "figd_" + "x" * 30)


def test_the_file_picker_needs_figma_access(monkeypatch):
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "")
    monkeypatch.setattr(cfg, "FIGMA_CLIENT_ID", "")
    c = client(); h = sign_up(c, "fc-none@example.com")
    r = c.post("/api/figma/files", json={"urls": ["https://www.figma.com/design/AbCdEfGhIj12/x"]}, headers=h)
    assert r.status_code == 422 and "Connect Figma" in r.json()["error"]


def test_bearer_tokens_go_in_the_authorization_header():
    assert figma._auth_header("Bearer abc") == {"Authorization": "Bearer abc"}
    assert figma._auth_header("figd_abc") == {"X-Figma-Token": "figd_abc"}
    assert figma.token_for("Bearer " + "t" * 40) == "Bearer " + "t" * 40
