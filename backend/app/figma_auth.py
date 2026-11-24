"""Connect Figma: a person signs in to Figma once (OAuth 2), and Dixlab reads their own
files with their own Figma access from then on. Nothing to copy or paste.

  1. /api/figma/connect makes a one-time `state` tied to the signed-in person and returns
     Figma's sign-in address.
  2. Figma sends them back to /api/figma/callback?code=…&state=… ; the state must be
     theirs and fresh (so no other site can link its Figma account to them), and the code
     is swapped for an access token and a refresh token.
  3. Tokens are stored encrypted (Fernet, keyed from FIGMA_CLIENT_SECRET) and renewed
     automatically before they expire. Disconnecting deletes them.

Figma's public apps must be reviewed by Figma before anyone can connect, and they can't
list a team's files (that permission is for private apps only), so files are added by
pasting their links; teams can still be listed with a personal access token."""
import base64
import hashlib
import logging
import secrets
import time
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken

from . import config, webread

log = logging.getLogger("dixlab.figma_auth")

AUTHORIZE = "https://www.figma.com/oauth"
TOKEN = "https://api.figma.com/v1/oauth/token"
STATE_MINUTES = 10
RENEW_EARLY_MS = 5 * 60 * 1000


def available() -> bool:
    return bool(config.FIGMA_CLIENT_ID and config.FIGMA_CLIENT_SECRET)


def redirect_uri() -> str:
    return f"{config.PUBLIC_URL}/api/figma/callback"


def _box() -> Fernet:
    key = hashlib.sha256(b"dixlab figma tokens\0" + config.FIGMA_CLIENT_SECRET.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _seal(token: str) -> str:
    return _box().encrypt(token.encode()).decode()


def _open(sealed: str) -> str | None:
    try:
        return _box().decrypt(sealed.encode()).decode()
    except (InvalidToken, ValueError):
        return None  # the client secret changed: they connect again


def _now() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------- the sign-in round trip

def start(db, user_id: str, return_to: str) -> str:
    """Figma's sign-in address for this person."""
    if not return_to.startswith("/") or return_to.startswith("//") or "\\" in return_to:
        return_to = "/dashboard"  # only back into Dixlab, never another site
    state = secrets.token_urlsafe(24)
    db.execute("DELETE FROM figma_oauth_states WHERE created_at < ?", (_now() - STATE_MINUTES * 60_000,))
    db.execute("INSERT INTO figma_oauth_states (state, user_id, return_to, created_at) VALUES (?, ?, ?, ?)",
               (state, user_id, return_to[:300], _now()))
    return AUTHORIZE + "?" + urlencode({"client_id": config.FIGMA_CLIENT_ID, "redirect_uri": redirect_uri(),
                                        "scope": config.FIGMA_OAUTH_SCOPES, "state": state, "response_type": "code"})


class ConnectError(Exception):
    pass


def _token_call(form: dict) -> dict:
    """POST to Figma's token endpoint with the app's credentials (HTTP Basic)."""
    auth = (config.FIGMA_CLIENT_ID, config.FIGMA_CLIENT_SECRET)
    try:
        with webread.client(httpx.Timeout(20.0, connect=6.0)) as client:
            r = client.post(TOKEN, data=form, auth=auth, headers={"Accept": "application/json"})
            if r.status_code == 401:  # some app setups expect the credentials in the form instead
                r = client.post(TOKEN, data={**form, "client_id": auth[0], "client_secret": auth[1]}, headers={"Accept": "application/json"})
    except httpx.HTTPError:
        raise ConnectError("We couldn’t reach Figma. Try again shortly.") from None
    if r.status_code != 200:
        log.warning("figma token endpoint answered %s", r.status_code)
        raise ConnectError("Figma didn’t accept the sign-in. Try connecting again.")
    try:
        data = r.json()
    except ValueError:
        raise ConnectError("Figma didn’t answer as expected.") from None
    if not data.get("access_token"):
        raise ConnectError("Figma didn’t send an access token.")
    return data


def finish(db, user_id: str, state: str, code: str) -> str:
    """Swap the code for tokens and save them. Returns where to send the person next."""
    row = db.execute("SELECT user_id, return_to, created_at FROM figma_oauth_states WHERE state = ?", (state,)).fetchone()
    db.execute("DELETE FROM figma_oauth_states WHERE state = ?", (state,))  # one use only
    if not row or row["user_id"] != user_id or row["created_at"] < _now() - STATE_MINUTES * 60_000:
        raise ConnectError("That Figma sign-in had expired or wasn’t yours. Try connecting again.")
    data = _token_call({"redirect_uri": redirect_uri(), "code": code, "grant_type": "authorization_code"})
    access = data["access_token"]
    me = {}
    try:
        from . import figma
        me = figma._get("/me", f"Bearer {access}")
    except Exception:  # noqa: BLE001 - who they are is a nicety
        pass
    db.execute(
        "INSERT INTO figma_connections (user_id, access_token, refresh_token, expires_at, figma_user, handle, photo, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token, "
        "refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, figma_user = excluded.figma_user, "
        "handle = excluded.handle, photo = excluded.photo",
        (user_id, _seal(access), _seal(str(data.get("refresh_token") or "")), _now() + int(data.get("expires_in") or 3600) * 1000,
         str(data.get("user_id") or me.get("id") or "")[:40], str(me.get("handle") or "")[:80], str(me.get("img_url") or "")[:500], _now()))
    return row["return_to"]


# ---------------------------------------------------------------- using the connection

def status(db, user_id: str) -> dict:
    row = db.execute("SELECT handle, photo, created_at FROM figma_connections WHERE user_id = ?", (user_id,)).fetchone()
    return {"available": available(), "connected": bool(row), "handle": row["handle"] if row else "",
            "connectedAt": row["created_at"] if row else None}


def disconnect(db, user_id: str) -> None:
    db.execute("DELETE FROM figma_connections WHERE user_id = ?", (user_id,))


def pick(db, user_id: str, pasted: str = "") -> str:
    """The access to use for this person: a token they pasted for this request, else their
    Connect Figma sign-in, else '' (figma.token_for then falls back to the server's token)."""
    return (pasted or "").strip() or token(db, user_id)


def token(db, user_id: str) -> str:
    """'Bearer <token>' for figma.py, renewed when it's about to expire; '' if not connected."""
    if not available():
        return ""
    row = db.execute("SELECT * FROM figma_connections WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return ""
    access = _open(row["access_token"])
    if access and row["expires_at"] > _now() + RENEW_EARLY_MS:
        return f"Bearer {access}"
    refresh = _open(row["refresh_token"])
    if not refresh:
        disconnect(db, user_id)
        return ""
    try:
        data = _token_call({"refresh_token": refresh, "grant_type": "refresh_token"})
    except ConnectError:
        return f"Bearer {access}" if access else ""  # try what we have; Figma will say if it's dead
    db.execute("UPDATE figma_connections SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?",
               (_seal(data["access_token"]), _seal(str(data.get("refresh_token") or refresh)),
                _now() + int(data.get("expires_in") or 3600) * 1000, user_id))
    return f"Bearer {data['access_token']}"
