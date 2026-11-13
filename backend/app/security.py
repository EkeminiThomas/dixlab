"""Password hashing (scrypt, standard library) and session tokens."""
import hashlib
import hmac
import secrets
import sqlite3
import time

from fastapi import Depends, Header, HTTPException, status

from .config import SESSION_DAYS
from .db import get_db

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
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (_token_hash(token), user_id, now, now + SESSION_DAYS * 86400),
    )
    return token


def delete_session(db: sqlite3.Connection, token: str) -> None:
    db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def current_user(
    authorization: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> sqlite3.Row:
    """Dependency: the signed-in user, or 401."""
    token = _bearer(authorization)
    if token:
        row = db.execute(
            """SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > ?""",
            (_token_hash(token), int(time.time())),
        ).fetchone()
        if row:
            return row
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in again.", headers={"WWW-Authenticate": "Bearer"})


def bearer_token(authorization: str | None = Header(default=None)) -> str | None:
    return _bearer(authorization)
