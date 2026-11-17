"""Email confirmation is required: a 6-digit code (or the link) before the app opens."""
import re

from test_api import client, sign_up  # sets up the test database and environment first

from app import config, mailer


def _required(monkeypatch):
    monkeypatch.setattr(config, "REQUIRE_VERIFIED_EMAIL", True)
    monkeypatch.setattr(mailer, "can_send", lambda: True)
    sent = []
    monkeypatch.setattr(mailer, "send", lambda to, subject, body: sent.append({"to": to, "subject": subject, "body": body}))
    return sent


def _code(mail):
    return re.search(r"\b(\d{6})\b", mail["subject"]).group(1)


def test_a_new_account_must_confirm_before_using_the_app(monkeypatch):
    sent = _required(monkeypatch)
    c = client()
    h = sign_up(c, "confirm@example.com", verified=False)
    me = c.get("/api/auth/me", headers=h).json()["user"]
    assert me["mustVerify"] is True and me["emailVerified"] is False
    r = c.get("/api/projects", headers=h)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "email_unverified"
    mail = sent[-1]
    code = _code(mail)
    assert mail["to"] == "confirm@example.com" and code in mail["body"] and "/verify-email#token=" in mail["body"]
    wrong = "000000" if code != "000000" else "111111"
    assert c.post("/api/auth/verify/code", json={"code": wrong}, headers=h).status_code == 400
    assert c.post("/api/auth/verify/code", json={"code": f"{code[:3]} {code[3:]}"}, headers=h).json() == {"verified": True}
    assert c.get("/api/projects", headers=h).status_code == 200
    assert c.get("/api/auth/me", headers=h).json()["user"]["mustVerify"] is False


def test_codes_cant_be_guessed_and_a_typo_email_can_be_fixed(monkeypatch):
    sent = _required(monkeypatch)
    c = client()
    h = sign_up(c, "typo@exampel.com", verified=False)
    code = _code(sent[-1])
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(6):
        c.post("/api/auth/verify/code", json={"code": wrong}, headers=h)
    r = c.post("/api/auth/verify/code", json={"code": code}, headers=h)
    assert r.status_code == 429                                     # locked out, and that code no longer works
    # Fix the address: needs the password; a new code goes to the new address.
    assert c.post("/api/auth/email", json={"email": "typo@example.com", "password": "wrong-password"}, headers=h).status_code == 400
    r = c.post("/api/auth/email", json={"email": "typo@example.com", "password": "correct horse"}, headers=h)
    assert r.status_code == 200 and r.json()["email"] == "typo@example.com"
    assert sent[-1]["to"] == "typo@example.com"
    assert c.get("/api/auth/me", headers=h).json()["user"]["email"] == "typo@example.com"


def test_the_link_still_works_and_nothing_is_required_without_email(monkeypatch):
    sent = _required(monkeypatch)
    c = client()
    h = sign_up(c, "link@example.com", verified=False)
    token = re.search(r"#token=([\w-]+)", sent[-1]["body"]).group(1)
    assert c.post("/api/auth/verify", json={"token": token}).json() == {"verified": True}
    assert c.get("/api/projects", headers=h).status_code == 200
    # A server that can't send email doesn't lock anyone out.
    monkeypatch.setattr(mailer, "can_send", lambda: False)
    h2 = sign_up(c, "nomail@example.com", verified=False)
    assert c.get("/api/auth/me", headers=h2).json()["user"]["mustVerify"] is False
    assert c.get("/api/projects", headers=h2).status_code == 200
