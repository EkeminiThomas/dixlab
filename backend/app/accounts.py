"""Deleting an account and everything in it (used by the user themselves and
by admins)."""
import re
import sqlite3

from .config import UPLOAD_DIR

TABLES = ("projects", "publications", "messages", "uploads")


def delete_account(db: sqlite3.Connection, user_id: str) -> tuple[dict, list[str]]:
    """Remove the account's rows. Returns (counts, upload file names); delete
    the files with delete_files() after the transaction commits."""
    files = [r[0] for r in db.execute("SELECT name FROM uploads WHERE user_id = ?", (user_id,))]
    counts = {t: db.execute(f"SELECT COUNT(*) FROM {t} WHERE user_id = ?", (user_id,)).fetchone()[0] for t in TABLES}
    from . import billing
    billing.cancel_remote(db, user_id)  # stop Bachs charging a deleted account (payment records stay, for tax)
    for t in ("sessions", "email_tokens", "recovery_codes", "subscriptions", "ai_usage", *TABLES):
        db.execute(f"DELETE FROM {t} WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return counts, files


def delete_files(names) -> None:
    for name in names:
        if re.fullmatch(r"[a-f0-9]{32}\.[a-z0-9]{2,5}", name):
            (UPLOAD_DIR / name).unlink(missing_ok=True)
