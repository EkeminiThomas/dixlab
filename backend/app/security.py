"""Password hashing (scrypt, standard library) and sessions.

The browser keeps its session in an HttpOnly cookie, which page scripts can't
read, so an injected script can't steal a login. API clients (and the tests)
can still send `Authorization: Bearer <token>`. Changes made with the cookie
must carry the X-Dixlab-Request header (see main.py), which other websites
can't add, so they can't act in a user's name (CSRF)."""
import hashlib
import hmac
import secrets
import sqlite3
import time

from fastapi import Depends, HTTPException, Request, Response, status

from .config import PRODUCTION, SESSION_DAYS, SESSION_IDLE_DAYS
from .db import get_db
from .ratelimit import is_https

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=_N, r=_R, p=_P, dklen=32)
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def now_ms() -> int:
    return int(time.time() * 1000)


def create_session(db: sqlite3.Connection, user_id: str) -> str:
    """Create a session and return the raw token (only its hash is stored)."""
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)",
        (_token_hash(token), user_id, now, now + SESSION_DAYS * 86400, now),
    )
    return token


def delete_session(db: sqlite3.Connection, token: str) -> None:
    db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


SESSION_COOKIE = "dixlab_session"
CSRF_HEADER = "x-dixlab-request"


def _is_https(request: Request) -> bool:
    """In production the cookie is always Secure, whatever the request looks like."""
    return PRODUCTION or is_https(request)


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_DAYS * 86400, path="/",
                        httponly=True, samesite="lax", secure=_is_https(request))


def clear_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=_is_https(request))


def request_token(request: Request) -> str | None:
    """The session token: a bearer header if sent, otherwise the cookie."""
    return _bearer(request.headers.get("authorization")) or request.cookies.get(SESSION_COOKIE) or None


IDLE_REFRESH_SECONDS = 5 * 60  # how often a session's "last used" time is updated


def _session_user(db: sqlite3.Connection, token: str | None):
    """The account behind a live session. A session ends SESSION_DAYS after
    login, or sooner if it goes unused for SESSION_IDLE_DAYS."""
    if not token:
        return None
    now = int(time.time())
    th = _token_hash(token)
    row = db.execute(
        """SELECT u.id, u.name, u.email, u.is_admin, u.suspended_at, u.last_seen_at, u.email_verified_at,
                  u.totp_enabled_at, u.created_at, s.last_used_at
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ? AND COALESCE(s.last_used_at, s.created_at) > ?""",
        (th, now, now - SESSION_IDLE_DAYS * 86400),
    ).fetchone()
    if row and (row["last_used_at"] or 0) < now - IDLE_REFRESH_SECONDS:
        db.execute("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?", (now, th))
    return row


def optional_user_id(request: Request, db: sqlite3.Connection) -> str | None:
    """Who's signed in, if anyone (for public pages). Never raises."""
    row = _session_user(db, request_token(request))
    return row["id"] if row and not row["suspended_at"] else None


SEEN_EVERY_MS = 5 * 60 * 1000  # how often "last active" is refreshed
SUSPENDED = "This account is suspended. Contact support if you think this is a mistake."


def current_user(request: Request, db: sqlite3.Connection = Depends(get_db)) -> dict:
    """Dependency: the signed-in user, or 401 (403 when suspended)."""
    row = _session_user(db, request_token(request))
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in again.", headers={"WWW-Authenticate": "Bearer"})
    if row["suspended_at"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, SUSPENDED)
    if must_verify(row) and not _verify_exempt(request.url.path):
        raise HTTPException(status.HTTP_403_FORBIDDEN, {"code": "email_unverified", "message": UNVERIFIED})
    now = now_ms()
    if not row["last_seen_at"] or now - row["last_seen_at"] > SEEN_EVERY_MS:
        db.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now, row["id"]))
        # Commit now: otherwise the write lock is held for the whole request, and a slow
        # one (an AI call) blocks every other write, including its own usage count.
        db.commit()
    return {"id": row["id"], "name": row["name"], "email": row["email"], "is_admin": bool(row["is_admin"]),  # admin rules: app/admin/access.py
           
            "email_verified": row["email_verified_at"] is not None, "must_verify": must_verify(row), "created_at": row["created_at"],
            "two_factor": row["totp_enabled_at"] is not None}


# ---------- email confirmation required ----------

UNVERIFIED = "Confirm your email to continue. We sent a 6-digit code to your inbox."
# What an unconfirmed account may still do: see who it is, confirm, fix a mistyped
# address, rename or delete itself, and log out.
_VERIFY_EXEMPT = ("/api/auth/me", "/api/auth/logout", "/api/auth/verify", "/api/auth/email")


def _verify_exempt(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in _VERIFY_EXEMPT)


def must_verify(row) -> bool:
    """True while this account must still confirm its email. Only enforced when
    the server can send email; otherwise nobody could ever confirm."""
    from . import config, mailer  # read at call time (settings can change in tests)
    verified = row["email_verified_at"] if "email_verified_at" in row.keys() else True
    return bool(config.REQUIRE_VERIFIED_EMAIL and not verified and mailer.can_send())




def bearer_token(request: Request) -> str | None:
    """The current session token (bearer header or cookie), for logging out."""
    return request_token(request)
