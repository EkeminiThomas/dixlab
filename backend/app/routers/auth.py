"""Accounts: sign up, log in, who am I, update profile, log out."""
import secrets
import sqlite3

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

from .. import events, passwords
from ..config import LOGIN_ATTEMPTS_PER_IP, LOGIN_FAILS_PER_EMAIL, SIGNUPS_PER_IP
from ..ratelimit import Limiter, client_ip
from ..db import get_db
from ..security import (SUSPENDED, must_verify, _bearer, bearer_token, clear_session_cookie, create_session, current_user,
                        delete_session, hash_password, is_admin, now_ms, set_session_cookie, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Brute-force and bot protection (see config.py for the numbers).
login_fails = Limiter("login_fail_email", LOGIN_FAILS_PER_EMAIL, 15 * 60)   # wrong passwords per account
login_ips = Limiter("login_ip", LOGIN_ATTEMPTS_PER_IP, 15 * 60)      # login attempts per visitor
signup_ips = Limiter("signup_ip", SIGNUPS_PER_IP, 60 * 60)            # new accounts per visitor
TOO_MANY = "Too many attempts. Please wait 15 minutes and try again."
# Checked when the email has no account, so a wrong email takes as long as a
# wrong password and response times don't reveal who has an account.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


class SignUpIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LogInIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    code: str | None = Field(None, max_length=32)  # authenticator or recovery code, for two-step login


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


def _session_reply(request: Request, response: Response, token: str, user: dict) -> dict:
    """Log the browser in with an HttpOnly cookie. The raw token is only
    returned to API clients that ask for it (the website never does)."""
    set_session_cookie(response, request, token)
    body = {"user": user}
    if request.headers.get("x-dixlab-want-token") == "1":
        body["token"] = token
    return body


def _user(row) -> dict:
    if isinstance(row, dict):
        admin, verified, two = row["is_admin"], row.get("email_verified", True), row.get("two_factor", False)
        must = row.get("must_verify", False)
    else:
        admin, verified, two = is_admin(row), row["email_verified_at"] is not None, row["totp_enabled_at"] is not None
        must = must_verify(row)
    return {"id": row["id"], "name": row["name"], "email": row["email"], "isAdmin": bool(admin),
            "emailVerified": bool(verified), "mustVerify": bool(must), "twoFactor": bool(two)}


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUpIn, request: Request, response: Response, background: BackgroundTasks, db: sqlite3.Connection = Depends(get_db)):
    if not signup_ips.hit(client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many new accounts from this connection. Please try again later.")
    if db.execute("SELECT 1 FROM users WHERE email = ?", (body.email,)).fetchone():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists. Try logging in.")
    passwords.require_ok(body.password, body.email, body.name)
    user_id = f"u-{secrets.token_hex(8)}"
    db.execute(
        "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, body.name.strip(), body.email.lower(), hash_password(body.password), now_ms()),
    )
    token = create_session(db, user_id)
    events.log(db, "user.signup", user_id)
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    from .account import send_verification, sends_per_user  # sign-up emails a link to confirm the address
    if sends_per_user.hit(f"verify|{user_id}"):
        send_verification(db, row, background)  # sent after the reply, so sign-up stays fast
    return _session_reply(request, response, token, _user(row))


@router.post("/login")
def log_in(body: LogInIn, request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    email = body.email.lower()
    if not login_ips.hit(client_ip(request)) or login_fails.blocked(email):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY)
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    ok = verify_password(body.password, row["password_hash"] if row else _DUMMY_HASH)
    if not row or not ok:
        login_fails.hit(email)
        events.log(db, "user.login_failed", row["id"] if row else None)
        db.commit()  # keep the record even though this request fails
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don’t match.")
    login_fails.reset(email)
    if row["suspended_at"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, SUSPENDED)
    if row["totp_enabled_at"]:
        from .twofactor import TOO_MANY_CODES, verify_second_factor, wrong_code
        if not body.code:
            # The password was right; the page now asks for the app's code.
            return JSONResponse({"detail": "Enter the 6-digit code from your authenticator app.",
                                 "code": "two_factor_required"}, status_code=401)
        if wrong_code.blocked(row["id"]):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY_CODES)
        if not verify_second_factor(db, row["id"], body.code):
            wrong_code.hit(row["id"])
            login_fails.hit(email)
            events.log(db, "user.2fa_failed", row["id"])
            db.commit()
            return JSONResponse({"detail": "That code isn’t right. Check your authenticator app and try again.",
                                 "code": "two_factor_invalid"}, status_code=401)
        wrong_code.reset(row["id"])
    token = create_session(db, row["id"])
    events.log(db, "user.login", row["id"])
    return _session_reply(request, response, token, _user(row))


@router.post("/adopt")
def adopt(request: Request, response: Response, user=Depends(current_user)):
    """Move a browser that still holds an old-style token (in localStorage)
    onto the HttpOnly cookie. The page deletes its copy afterwards."""
    token = _bearer(request.headers.get("authorization"))
    if token:
        set_session_cookie(response, request, token)
    return {"user": _user(user)}


@router.get("/me")
def me(user=Depends(current_user)):
    return {"user": _user(user)}


@router.patch("/me")
def update_me(body: ProfileIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("UPDATE users SET name = ? WHERE id = ?", (body.name.strip(), user["id"]))
    return {"user": {**_user(user), "name": body.name.strip()}}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def log_out(request: Request, token: str | None = Depends(bearer_token), db: sqlite3.Connection = Depends(get_db)):
    if token:
        delete_session(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response, request)
    return response
