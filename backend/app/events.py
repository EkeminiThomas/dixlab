"""The activity log behind the admin dashboard: sign-ups, publishing, AI use,
errors and admin actions. Events hold ids and small facts (a template name,
a file size, a status code), never passwords, tokens or message contents."""
import json
import logging
import sqlite3

from .config import EVENT_RETENTION_DAYS
from .db import connect
from .security import now_ms

log_ = logging.getLogger("dixlab.events")


def log(db: sqlite3.Connection, type_: str, user_id: str | None = None, actor_id: str | None = None, **data) -> None:
    """Record an event inside the current request's transaction."""
    db.execute(
        "INSERT INTO events (type, user_id, actor_id, data, created_at) VALUES (?, ?, ?, ?, ?)",
        (type_, user_id, actor_id, json.dumps(data, ensure_ascii=False, default=str), now_ms()),
    )


def log_now(type_: str, user_id: str | None = None, **data) -> None:
    """Record an event on its own connection (for code without a request db).
    Never raises: losing one log line must not break the request."""
    try:
        with connect() as db:
            log(db, type_, user_id, **data)
    except sqlite3.Error as e:
        log_.warning("Couldn't record event %s (%s)", type_, type(e).__name__)


def prune() -> int:
    """Drop events older than the retention window. Returns how many went."""
    cutoff = now_ms() - EVENT_RETENTION_DAYS * 86_400_000
    with connect() as db:
        return db.execute("DELETE FROM events WHERE created_at < ?", (cutoff,)).rowcount
