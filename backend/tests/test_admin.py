"""The admin dashboard API, the admin terminal command, and two-step login for admins."""
from test_api import PNG, client, sign_up  # noqa: F401  (sets up the test database and environment first)


def test_admin_dashboard():
    import sqlite3 as _sq
    from app.config import DB_PATH, UPLOAD_DIR
    c = client()
    boss = sign_up(c, "boss@example.com")
    user = sign_up(c, "maker@example.com")
    # Signing up with the (legacy) admin email grants nothing; only the terminal command does.
    assert c.get("/api/auth/me", headers=boss).json()["user"]["isAdmin"] is False
    assert c.get("/api/admin/overview", headers=boss).status_code == 403
    from app.admin import cli as admin_cli
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


def test_admins_need_two_step_when_required(monkeypatch):
    from app import totp
    from app.admin import access, cli as admin_cli
    from app.routers import twofactor
    twofactor.wrong_code.clear()
    c = client()
    h = sign_up(c, "secure-admin@example.com")
    assert admin_cli.main(["grant", "secure-admin@example.com"]) == 0
    monkeypatch.setattr(access.config, "ADMIN_REQUIRE_2FA", True)
    r = c.get("/api/admin/overview", headers=h)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "admin_needs_2fa" and "two-step" in r.json()["detail"]["message"]
    secret = c.post("/api/auth/2fa/setup", json={"password": "correct horse"}, headers=h).json()["secret"]
    c.post("/api/auth/2fa/enable", json={"code": totp.current_code(secret)}, headers=h)
    assert c.get("/api/admin/overview", headers=h).status_code == 200
    # Lost phone and codes: reset from the server's terminal.
    assert admin_cli.main(["reset-2fa", "secure-admin@example.com"]) == 0
    assert c.get("/api/auth/me", headers=h).status_code == 401  # logged out everywhere
    login = c.post("/api/auth/login", json={"email": "secure-admin@example.com", "password": "correct horse"})
    assert login.status_code == 200 and login.json()["user"]["twoFactor"] is False
    admin_cli.main(["revoke", "secure-admin@example.com"])


def test_starting_two_step_setup_again_keeps_the_same_qr_code():
    from app import totp
    from app.routers import twofactor
    twofactor.wrong_code.clear()
    c = client()
    h = sign_up(c, "two-tries@example.com")
    first = c.post("/api/auth/2fa/setup", json={"password": "correct horse"}, headers=h).json()["secret"]
    again = c.post("/api/auth/2fa/setup", json={"password": "correct horse"}, headers=h).json()["secret"]
    assert again == first                                        # the entry scanned on the first try still works
    r = c.post("/api/auth/2fa/enable", json={"code": "000000" if totp.current_code(first) != "000000" else "111111"}, headers=h)
    assert r.status_code == 400 and "newest Dixlab entry" in r.json()["detail"]
    assert c.post("/api/auth/2fa/enable", json={"code": totp.current_code(first)}, headers=h).status_code == 200


def test_the_first_admin_can_come_from_a_setting(monkeypatch):
    import sqlite3 as _sq
    from app.admin import bootstrap
    from app.config import DB_PATH
    from app.db import connect
    c = client()
    with _sq.connect(DB_PATH) as db:       # this test needs a site with no admins
        admins = [r[0] for r in db.execute("SELECT id FROM users WHERE is_admin = 1")]
        db.execute("UPDATE users SET is_admin = 0")
    try:
        monkeypatch.setenv("DIXLAB_FIRST_ADMIN", "First.Admin@example.com")
        h = sign_up(c, "first.admin@example.com", verified=False)
        with connect() as db:
            assert bootstrap.ensure_first_admin(db) is False             # email not confirmed yet
        with _sq.connect(DB_PATH) as db:
            db.execute("UPDATE users SET email_verified_at = 1 WHERE email = 'first.admin@example.com'")
        with connect() as db:
            assert bootstrap.ensure_first_admin(db) is True
        assert c.get("/api/auth/me", headers=h).json()["user"]["isAdmin"] is True
        # Once there's an admin, the setting never grants anyone else.
        sign_up(c, "second@example.com")
        monkeypatch.setenv("DIXLAB_FIRST_ADMIN", "second@example.com")
        with connect() as db:
            assert bootstrap.ensure_first_admin(db) is False
            assert db.execute("SELECT is_admin FROM users WHERE email = 'second@example.com'").fetchone()[0] == 0
    finally:
        with _sq.connect(DB_PATH) as db:
            db.execute("UPDATE users SET is_admin = 0 WHERE email = 'first.admin@example.com'")
            db.executemany("UPDATE users SET is_admin = 1 WHERE id = ?", [(i,) for i in admins])
