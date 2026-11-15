"""Account self-service: verify your email, reset a forgotten password, change
your password, and delete your account.

Emailed links carry a random one-time token; only its SHA-256 hash is stored,
it expires, and it can be used once. "Forgot password" answers the same way
whether or not an account exists, so it can't be used to find out who has one."""
import hashlib
import secrets
import sqlite3

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

from .. import accounts, events, mailer, passwords
from ..config import PUBLIC_URL, RESET_LINK_MINUTES, VERIFY_LINK_HOURS
from ..db import get_db
from ..ratelimit import Limiter, client_ip
from ..security import (clear_session_cookie, current_user, hash_password, now_ms, request_token,
                        verify_password, _token_hash)

router = APIRouter(prefix="/api/auth", tags=["account"])

sends_per_user = Limiter("email_send_user", 3, 15 * 60)      # verification / reset emails per account
forgot_per_ip = Limiter("forgot_ip", 10, 15 * 60)      # "forgot password" requests per visitor
token_tries_ip = Limiter("email_token_ip", 30, 15 * 60)     # attempts to use a link per visitor
wrong_password = Limiter("wrong_password_user", 5, 15 * 60)      # wrong current password on change / delete, per account
NO_MAIL = "Email isn’t set up on this server yet, so we can’t send that right now."


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_token(db, user_id: str, purpose: str, minutes: int) -> str:
    """One live link per purpose: older unused ones stop working."""
    token = secrets.token_urlsafe(32)
    now = now_ms()
    db.execute("DELETE FROM email_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL", (user_id, purpose))
    db.execute("INSERT INTO email_tokens (token_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
               (_hash(token), user_id, purpose, now, now + minutes * 60_000))
    return token


def _use_token(db, token: str, purpose: str):
    """The account a valid, unused, unexpired link belongs to (marked used), or None."""
    row = db.execute("SELECT t.token_hash, t.user_id, t.expires_at, t.used_at FROM email_tokens t "
                     "WHERE t.token_hash = ? AND t.purpose = ?", (_hash(token or ""), purpose)).fetchone()
    if not row or row["used_at"] or row["expires_at"] < now_ms():
        return None
    db.execute("UPDATE email_tokens SET used_at = ? WHERE token_hash = ?", (now_ms(), row["token_hash"]))
    return db.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()


def _send_later(background: BackgroundTasks | None, to: str, subject: str, body: str) -> None:
    """Emails go out after the response, so every answer takes the same time
    (a slow send would otherwise reveal that an account exists)."""
    if background is None:
        mailer.send(to, subject, body)
    else:
        background.add_task(mailer.send, to, subject, body)


def send_verification(db, user, background: BackgroundTasks | None = None) -> bool:
    """Email a link that confirms this address. Returns whether it's going out."""
    if not mailer.can_send():
        return False
    token = _new_token(db, user["id"], "verify", VERIFY_LINK_HOURS * 60)
    # The token goes after "#": browsers never send that part to any server,
    # so it can't end up in access logs or in a Referer header.
    body = (f"Hi {mailer.safe_name(user['name'])},\n\nPlease confirm this is your email address for Dixlab:\n\n"
            f"{PUBLIC_URL}/verify-email#token={token}\n\n"
            f"The link works for {VERIFY_LINK_HOURS} hours. If you didn’t create a Dixlab account, ignore this email.\n\n— Dixlab")
    _send_later(background, user["email"], "Confirm your email for Dixlab", body)
    return True


# ---------- verify your email ----------

@router.post("/verify/send")
def resend_verification(background: BackgroundTasks, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    if row["email_verified_at"]:
        return {"sent": False, "verified": True}
    if not sends_per_user.hit(f"verify|{user['id']}"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "We’ve sent a few emails already. Check your inbox (and spam), or try again in 15 minutes.")
    if not send_verification(db, row, background):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NO_MAIL)
    return {"sent": True}


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


@router.post("/verify")
def verify_email(body: TokenIn, request: Request, db: sqlite3.Connection = Depends(get_db)):
    if not token_tries_ip.hit(client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please try again later.")
    row = _use_token(db, body.token, "verify")
    if not row:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This link has expired or was already used. Log in and send a new one.")
    if not row["email_verified_at"]:
        db.execute("UPDATE users SET email_verified_at = ? WHERE id = ?", (now_ms(), row["id"]))
        events.log(db, "user.verified", row["id"])
    return {"verified": True}


# ---------- forgot / reset password ----------

class ForgotIn(BaseModel):
    email: EmailStr


@router.post("/password/forgot")
def forgot_password(body: ForgotIn, request: Request, background: BackgroundTasks, db: sqlite3.Connection = Depends(get_db)):
    """Always the same answer, whether or not the email has an account."""
    if not forgot_per_ip.hit(client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please try again in 15 minutes.")
    if not mailer.can_send():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NO_MAIL)
    row = db.execute("SELECT * FROM users WHERE email = ?", (body.email.lower(),)).fetchone()
    if row and not row["suspended_at"] and sends_per_user.hit(f"reset|{row['id']}"):
        token = _new_token(db, row["id"], "reset", RESET_LINK_MINUTES)
        text = (f"Hi {mailer.safe_name(row['name'])},\n\nSomeone asked to reset the password for your Dixlab account. If it was you, choose a new one here:\n\n"
                f"{PUBLIC_URL}/reset-password#token={token}\n\n"
                f"The link works for {RESET_LINK_MINUTES} minutes and only once. If you didn’t ask, ignore this email: your password stays the same.\n\n— Dixlab")
        _send_later(background, row["email"], "Reset your Dixlab password", text)
        events.log(db, "user.reset_requested", row["id"])
    return {"ok": True, "message": "If there’s an account with that email, we’ve sent a link to reset the password."}


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=200)


@router.post("/password/reset")
def reset_password(body: ResetIn, request: Request, db: sqlite3.Connection = Depends(get_db)):
    if not token_tries_ip.hit(client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please try again later.")
    row = _use_token(db, body.token, "reset")
    if not row or row["suspended_at"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link has expired or was already used. Ask for a new one.")
    passwords.require_ok(body.password, row["email"], row["name"])  # refused: nothing is saved and the link still works
    # Proving you can read the inbox also confirms the address. Every existing
    # login ends, in case someone else was using the account.
    db.execute("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?",
               (hash_password(body.password), now_ms(), row["id"]))
    db.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
    db.execute("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'reset'", (row["id"],))
    events.log(db, "user.password_reset", row["id"])
    from .auth import login_fails  # a successful reset lifts any brute-force lock
    login_fails.reset(row["email"].lower())
    return {"ok": True}


# ---------- change password (signed in) ----------

def _check_password(db, user_id: str, password: str, wrong: str) -> None:
    """Confirm the signed-in person knows the password, with a lock after 5
    wrong tries, so a stolen login can't be used to guess it."""
    if wrong_password.blocked(user_id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many wrong passwords. Please wait 15 minutes and try again.")
    row = db.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    if not verify_password(password, row["password_hash"]):
        wrong_password.hit(user_id)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, wrong)
    wrong_password.reset(user_id)

class ChangeIn(BaseModel):
    current: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)


@router.post("/password/change")
def change_password(body: ChangeIn, request: Request, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    _check_password(db, user["id"], body.current, "Your current password isn’t right.")
    passwords.require_ok(body.password, user["email"], user["name"])
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(body.password), user["id"]))
    db.execute("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'reset'", (user["id"],))  # unused reset links stop working
    # Stay logged in here; every other device is signed out.
    this = request_token(request)
    db.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], _token_hash(this or "")))
    events.log(db, "user.password_changed", user["id"])
    return {"ok": True}


# ---------- delete my account ----------

class DeleteIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


@router.delete("/me")
def delete_me(body: DeleteIn, request: Request, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    _check_password(db, user["id"], body.password, "That password isn’t right.")
    row = db.execute("SELECT email FROM users WHERE id = ?", (user["id"],)).fetchone()
    if user["is_admin"] and db.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1").fetchone()[0] <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You’re the only admin. Make someone else an admin before deleting your account.")
    counts, files = accounts.delete_account(db, user["id"])
    events.log(db, "user.deleted_self", user["id"], email_domain=row["email"].split("@")[-1], **counts)
    db.commit()
    accounts.delete_files(files)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response, request)
    return response


def unverified_response() -> JSONResponse:
    return JSONResponse({"detail": "Please confirm your email address before publishing. Check your inbox for our link, or send a new one.",
                         "code": "email_unverified"}, status_code=403)
