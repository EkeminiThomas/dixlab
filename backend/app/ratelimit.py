"""Sliding-window rate limits, kept in the SQLite database so every worker
process shares them and they survive a restart (someone can't reset their
allowance by waiting for a redeploy). That covers one server with any number
of workers. Across several servers, add limits at the proxy/CDN as well."""
import random
import sqlite3
import threading
import time

_ready = False
_ready_lock = threading.Lock()

TABLE = """CREATE TABLE IF NOT EXISTS rate_hits (
    bucket TEXT NOT NULL,     -- which limit, e.g. login_ip
    key    TEXT NOT NULL,     -- who, e.g. an IP address or account id
    at     REAL NOT NULL      -- unix time of the hit
);
CREATE INDEX IF NOT EXISTS idx_rate_hits ON rate_hits(bucket, key, at);
CREATE INDEX IF NOT EXISTS idx_rate_hits_at ON rate_hits(at);"""


def path():
    """A database file of its own next to the main one (dixlab.db ->
    dixlab-ratelimits.db): a request holding a write lock on the main database
    must never wait on a rate-limit update, or vice versa."""
    from .config import DB_PATH
    return DB_PATH.with_name(f"{DB_PATH.stem}-ratelimits{DB_PATH.suffix or '.db'}")


def _connect() -> sqlite3.Connection:
    global _ready
    # isolation_level=None: we open transactions ourselves (BEGIN IMMEDIATE), so
    # two workers can't both see "one hit left" and both take it.
    conn = sqlite3.connect(path(), timeout=10, isolation_level=None, check_same_thread=False)
    if not _ready:
        with _ready_lock:
            if not _ready:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.executescript(TABLE)
                _ready = True
    return conn


def prune(max_window: int = 24 * 3600) -> None:
    """Forget hits older than any window in use."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM rate_hits WHERE at < ?", (time.time() - max_window,))
    finally:
        conn.close()


class Limiter:
    def __init__(self, name: str, limit: int, window_seconds: int):
        self.name = name
        self.limit = limit
        self.window = window_seconds

    def _count(self, conn, key: str, now: float) -> int:
        conn.execute("DELETE FROM rate_hits WHERE bucket = ? AND key = ? AND at <= ?", (self.name, key, now - self.window))
        return conn.execute("SELECT COUNT(*) FROM rate_hits WHERE bucket = ? AND key = ?", (self.name, key)).fetchone()[0]

    def blocked(self, key: str) -> bool:
        """Has `key` used up its allowance? (Doesn't count as a new hit.)"""
        conn = _connect()
        try:
            return conn.execute("SELECT COUNT(*) FROM rate_hits WHERE bucket = ? AND key = ? AND at > ?",
                                (self.name, key, time.time() - self.window)).fetchone()[0] >= self.limit
        finally:
            conn.close()

    def hit(self, key: str) -> bool:
        """Count one hit. Returns False when `key` is over the limit."""
        conn = _connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            now = time.time()
            ok = self._count(conn, key, now) < self.limit
            if ok:
                conn.execute("INSERT INTO rate_hits (bucket, key, at) VALUES (?, ?, ?)", (self.name, key, now))
            conn.execute("COMMIT")
        except BaseException:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()
        if random.random() < 0.002:  # now and then, sweep keys nobody comes back to
            prune()
        return ok

    def reset(self, key: str) -> None:
        conn = _connect()
        try:
            conn.execute("DELETE FROM rate_hits WHERE bucket = ? AND key = ?", (self.name, key))
        finally:
            conn.close()

    def clear(self) -> None:
        conn = _connect()
        try:
            conn.execute("DELETE FROM rate_hits WHERE bucket = ?", (self.name,))
        finally:
            conn.close()


def client_ip(request) -> str:
    """The visitor's IP. Behind DIXLAB_TRUST_PROXY_HOPS proxies, it's taken from
    X-Forwarded-For (counting from the right, where our own proxies add it)."""
    from .config import TRUST_PROXY_HOPS
    if TRUST_PROXY_HOPS > 0:
        hops = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if hops:
            return hops[-TRUST_PROXY_HOPS] if len(hops) >= TRUST_PROXY_HOPS else hops[0]
    return request.client.host if request and request.client else "?"


def is_https(request) -> bool:
    """Was this request made over HTTPS? X-Forwarded-Proto is only believed when
    we're told proxies sit in front (otherwise anyone could send it)."""
    from .config import TRUST_PROXY_HOPS
    if request.url.scheme == "https":
        return True
    return TRUST_PROXY_HOPS > 0 and request.headers.get("x-forwarded-proto", "").split(",")[-1].strip() == "https"
