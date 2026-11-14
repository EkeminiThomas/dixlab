"""SQLite storage. One connection per request; the schema is created on startup."""
import sqlite3
from collections.abc import Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    type       TEXT NOT NULL,
    data       TEXT NOT NULL,           -- the full project as JSON
    updated_at INTEGER NOT NULL,        -- ms since epoch, set by the client
    PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS uploads (
    name         TEXT PRIMARY KEY,      -- file name on disk, e.g. 3f2a….jpg
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    size         INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS publications (
    slug       TEXT PRIMARY KEY,        -- the public link: /p/<slug>
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    data       TEXT NOT NULL,           -- published snapshot (public fields only)
    views      INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the portfolio owner
    project_id TEXT NOT NULL,
    slug       TEXT NOT NULL,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    body       TEXT NOT NULL,
    emailed    INTEGER NOT NULL DEFAULT 0,
    read_at    INTEGER,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
"""


def connect() -> sqlite3.Connection:
    # One connection per request, but FastAPI may open it in a worker thread and
    # use it in the event loop (async routes), so allow cross-thread use.
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: a connection that commits on success."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
