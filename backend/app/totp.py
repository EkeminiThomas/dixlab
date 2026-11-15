"""Two-step login with an authenticator app (TOTP, RFC 6238), standard library
only: 6-digit codes that change every 30 seconds, from a secret shared once
through a QR code. Plus one-time recovery codes for a lost phone."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP = 30
DIGITS = 6
DRIFT = 1  # accept the codes either side of now, for clocks a little off
ISSUER = "Dixlab"


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    mac = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    value = struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_code(secret: str, at: float | None = None) -> str:
    """The code an authenticator shows right now (used by the tests)."""
    return _code(secret, int((at if at is not None else time.time()) // STEP))


def verify(secret: str, code: str, last_step: int | None = None) -> int | None:
    """The time step a valid code belongs to, or None. A code from a step at or
    before `last_step` is refused, so each code works only once."""
    code = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(code) != DIGITS or not secret:
        return None
    now = int(time.time() // STEP)
    for step in range(now - DRIFT, now + DRIFT + 1):
        if hmac.compare_digest(_code(secret, step), code):
            return None if last_step is not None and step <= last_step else step
    return None


def otpauth_url(secret: str, account: str) -> str:
    """What the QR code holds; authenticator apps understand this format."""
    label = quote(f"{ISSUER}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&algorithm=SHA1&digits={DIGITS}&period={STEP}"


# ---------- recovery codes ----------

RECOVERY_COUNT = 10
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o, 1/l/i


def new_recovery_codes() -> list[str]:
    def one():
        raw = "".join(secrets.choice(_ALPHABET) for _ in range(10))
        return f"{raw[:5]}-{raw[5:]}"
    return [one() for _ in range(RECOVERY_COUNT)]


def normalise_recovery(code: str) -> str:
    return "".join(ch for ch in (code or "").lower() if ch.isalnum())


def hash_recovery(code: str) -> str:
    return hashlib.sha256(normalise_recovery(code).encode()).hexdigest()


def looks_like_recovery(code: str) -> bool:
    return len(normalise_recovery(code)) == 10 and not normalise_recovery(code).isdigit()
