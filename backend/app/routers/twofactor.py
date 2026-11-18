"""Two-step login (an authenticator app code after the password).

    POST /api/auth/2fa/setup            {password}        -> {secret, otpauthUrl}   (not on yet)
    POST /api/auth/2fa/enable           {code}            -> {recoveryCodes}        (turns it on)
    POST /api/auth/2fa/disable          {password, code}
    POST /api/auth/2fa/recovery-codes   {password, code}  -> {recoveryCodes}        (replaces the old ones)
    GET  /api/auth/2fa                                    -> {enabled, recoveryCodesLeft}

Logging in then needs `code` as well (see auth.log_in). Recovery codes are
shown once, stored only as hashes, and each works once. Someone who loses
both can be reset from the server: python -m app.admin reset-2fa <email>."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from .. import events, totp
from ..db import get_db
from ..ratelimit import Limiter
from ..security import _token_hash, current_user, now_ms, request_token

router = APIRouter(prefix="/api/auth/2fa", tags=["account"])

wrong_code = Limiter("two_factor_user", 5, 15 * 60)  # wrong codes per account
TOO_MANY_CODES = "Too many wrong codes. Please wait 15 minutes and try again."
WRONG_CODE = "That code isn’t right. Check your authenticator app and try again."
# While turning it on: the usual causes are an old Dixlab entry in the app, or the phone's clock.
WRONG_SETUP_CODE = ("That code isn’t right. Use the newest Dixlab entry in your authenticator app (delete older ones), "
                    "type the code before it changes, and check your phone sets its time automatically.")


def verify_second_factor(db: sqlite3.Connection, user_id: str, code: str) -> bool:
    """Check an authenticator code or an unused recovery code for an account
    that has two-step login on. Each code is accepted only once."""
    row = db.execute("SELECT totp_secret, totp_last_step FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row or not row["totp_secret"]:
        return False
    if totp.looks_like_recovery(code):
        used = db.execute("UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
                          (now_ms(), user_id, totp.hash_recovery(code))).rowcount
        if used:
            events.log(db, "user.2fa_recovery_used", user_id)
        return bool(used)
    step = totp.verify(row["totp_secret"], code, row["totp_last_step"])
    if step is None:
        return False
    # Conditional update: two requests racing with the same code can't both win.
    return db.execute("UPDATE users SET totp_last_step = ? WHERE id = ? AND COALESCE(totp_last_step, -1) < ?",
                      (step, user_id, step)).rowcount == 1


def check_code_or_raise(db: sqlite3.Connection, user_id: str, code: str) -> None:
    if wrong_code.blocked(user_id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY_CODES)
    if not verify_second_factor(db, user_id, code):
        wrong_code.hit(user_id)
        events.log(db, "user.2fa_failed", user_id)
        db.commit()  # keep the record even though this request fails
        raise HTTPException(status.HTTP_400_BAD_REQUEST, WRONG_CODE)
    wrong_code.reset(user_id)


def _new_recovery_codes(db: sqlite3.Connection, user_id: str) -> list[str]:
    codes = totp.new_recovery_codes()
    db.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user_id,))
    db.executemany("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)",
                   [(user_id, totp.hash_recovery(c)) for c in codes])
    return codes


class PasswordIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class CodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class PasswordCodeIn(PasswordIn, CodeIn):
    pass


@router.get("")
def two_factor_status(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    left = db.execute("SELECT COUNT(*) FROM recovery_codes WHERE user_id = ? AND used_at IS NULL", (user["id"],)).fetchone()[0]
    return {"enabled": user["two_factor"], "recoveryCodesLeft": left if user["two_factor"] else 0}


@router.post("/setup")
def setup(body: PasswordIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    from .account import _check_password
    if user["two_factor"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Two-step login is already on.")
    _check_password(db, user["id"], body.password, "That password isn’t right.")
    # Starting again before finishing keeps the same secret, so a QR code scanned on
    # an earlier try still works (a new one each time left people with stale entries).
    secret = db.execute("SELECT totp_pending FROM users WHERE id = ?", (user["id"],)).fetchone()["totp_pending"]
    if not secret:
        secret = totp.new_secret()
        db.execute("UPDATE users SET totp_pending = ? WHERE id = ?", (secret, user["id"]))
    return {"secret": secret, "otpauthUrl": totp.otpauth_url(secret, user["email"])}


@router.post("/enable")
def enable(body: CodeIn, request: Request, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["two_factor"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Two-step login is already on.")
    pending = db.execute("SELECT totp_pending FROM users WHERE id = ?", (user["id"],)).fetchone()["totp_pending"]
    if not pending:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start setting up two-step login first.")
    if wrong_code.blocked(user["id"]):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY_CODES)
    step = totp.verify(pending, body.code)
    if step is None:
        wrong_code.hit(user["id"])
        raise HTTPException(status.HTTP_400_BAD_REQUEST, WRONG_SETUP_CODE)
    wrong_code.reset(user["id"])
    db.execute("UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_enabled_at = ?, totp_last_step = ? WHERE id = ?",
               (pending, now_ms(), step, user["id"]))
    codes = _new_recovery_codes(db, user["id"])
    # Every other device has to log in again, this time with a code.
    db.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], _token_hash(request_token(request) or "")))
    events.log(db, "user.2fa_enabled", user["id"])
    return {"recoveryCodes": codes}


@router.post("/disable")
def disable(body: PasswordCodeIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    from .account import _check_password
    if not user["two_factor"]:
        return {"enabled": False}
    _check_password(db, user["id"], body.password, "That password isn’t right.")
    check_code_or_raise(db, user["id"], body.code)
    db.execute("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?",
               (user["id"],))
    db.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user["id"],))
    events.log(db, "user.2fa_disabled", user["id"])
    return {"enabled": False}


@router.post("/recovery-codes")
def regenerate(body: PasswordCodeIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    from .account import _check_password
    if not user["two_factor"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Turn on two-step login first.")
    _check_password(db, user["id"], body.password, "That password isn’t right.")
    check_code_or_raise(db, user["id"], body.code)
    codes = _new_recovery_codes(db, user["id"])
    events.log(db, "user.2fa_codes_regenerated", user["id"])
    return {"recoveryCodes": codes}
