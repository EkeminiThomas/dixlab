"""Rules for new passwords (sign up, reset, change), following NIST SP 800-63B:
at least 8 characters, no maximum complexity rules, but no passwords that are
known to be common or leaked, or that are just the person's own email/name."""
import hashlib
import logging
import re
import urllib.request

from fastapi import HTTPException, status

from .config import PWNED_PASSWORD_CHECK

log = logging.getLogger("dixlab")

# The most common passwords of 8+ characters in public breach lists (shorter
# ones are already refused by the length rule). Compared case-insensitively.
COMMON = set("""
12345678 123456789 1234567890 12345678910 123123123 1234512345 11111111 111111111 1111111111 00000000 0000000000
88888888 87654321 98765432 99999999 11223344 12341234 123321123 147258369 159753456 741852963 789456123 123654789
password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword pa55word passwort motdepasse
qwertyui qwertyuiop qwerty123 qwerty1234 1q2w3e4r 1q2w3e4r5t 1qaz2wsx 1qazxsw2 zaq12wsx asdfghjk asdfghjkl
zxcvbnm1 zxcvbnmm qazwsxedc abcd1234 abc12345 abcdefgh abcdefg1 a1b2c3d4 aa123456 iloveyou iloveyou1 sunshine
princess football football1 baseball basketball superman batman123 starwars trustno1 whatever welcome1 welcome123
letmein1 letmein123 changeme changeme123 sunshine1 computer internet michelle jennifer chocolate butterfly
monkey123 dragon123 master123 shadow123 freedom1 mustang1 liverpool arsenal1 chelsea1 manchester google123
samsung1 iphone123 1234qwer qwer1234 asdf1234 admin123 administrator adminadmin root1234 test1234 testtest
default1 secret123 security 11111111a 123456789a a12345678 12345678a 123456aa q1w2e3r4 q1w2e3r4t5 qwe123qwe
""".split())

_SEQUENCES = ("0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm")


def _too_simple(pw: str) -> bool:
    low = pw.lower()
    if low in COMMON or len(set(low)) <= 2:     # "aaaaaaaa", "abababab"
        return True
    for seq in _SEQUENCES:                       # "23456789", "zyxwvuts"
        if low in seq or low in seq[::-1]:
            return True
    return False


def _pwned(pw: str) -> bool:
    """Is this password in the Have I Been Pwned breach corpus? Uses the range
    API: only the first 5 hex characters of the SHA-1 leave the server."""
    digest = hashlib.sha1(pw.encode()).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    req = urllib.request.Request(f"https://api.pwnedpasswords.com/range/{prefix}",
                                 headers={"Add-Padding": "true", "User-Agent": "password-strength-check"})
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            body = res.read().decode("ascii", "ignore")
    except Exception as e:  # noqa: BLE001 - never block sign-up on a third-party outage
        log.warning("Leaked-password check unavailable (%s); accepting the password.", type(e).__name__)
        return False
    for line in body.splitlines():
        h, _, count = line.partition(":")
        if h.strip() == suffix and count.strip() not in ("", "0"):
            return True
    return False


def problem(password: str, email: str = "", name: str = "") -> str | None:
    """Why this password can't be used, or None if it's fine."""
    if len(password) < 8:
        return "Use at least 8 characters."
    if _too_simple(password):
        return "That password is too common or easy to guess. Try a few unrelated words together."
    low = re.sub(r"\s+", "", password.lower())
    local = (email or "").split("@")[0].lower()
    if (local and len(local) >= 4 and local in low and len(low) - len(local) < 4) or low == (email or "").lower():
        return "Don’t use your email address as your password."
    compact_name = re.sub(r"\s+", "", (name or "").lower())
    if compact_name and len(compact_name) >= 4 and compact_name in low and len(low) - len(compact_name) < 4:
        return "Don’t use your name as your password."
    if PWNED_PASSWORD_CHECK and _pwned(password):
        return "That password has appeared in a data breach, so attackers try it first. Please choose another."
    return None


def require_ok(password: str, email: str = "", name: str = "") -> None:
    """Raise a 422 with a readable message if the password isn't acceptable."""
    msg = problem(password, email, name)
    if msg:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, msg)
