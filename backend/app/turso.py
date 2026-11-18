"""Turso (hosted SQLite) over its HTTP API, behaving like the standard sqlite3
module, so the rest of Dixlab doesn't change.

Used when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set (see db.connect).
The data then lives on Turso's servers and survives restarts and redeploys of
the app, which a file inside a container doesn't.

How it maps to sqlite3:
- One Connection is one Turso "stream" (a server-side connection), kept open
  across requests with the `baton` the server returns, and closed by close().
- Like sqlite3, a transaction starts by itself before the first INSERT, UPDATE,
  DELETE or REPLACE, and ends with commit() or rollback(). (Turso gives an open
  transaction 5 seconds, so keep slow work, such as API calls, out of them.)
- Rows support row["column"], row[0], row.keys() and unpacking, like sqlite3.Row.
- Errors are raised as sqlite3.IntegrityError / sqlite3.OperationalError, so
  existing `except sqlite3.Error` code keeps working.

Protocol: POST {url}/v2/pipeline with {"baton", "requests": [{"type": "execute",
"stmt": {"sql", "args"}}, ...]}; see https://docs.turso.tech/sdk/http/reference."""
import base64
import logging
import re
import sqlite3
import threading

import httpx

log = logging.getLogger("dixlab")

TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_client: httpx.Client | None = None
_client_lock = threading.Lock()
transport: httpx.BaseTransport | None = None  # tests plug in a fake Turso server here

_WRITE = re.compile(r"^\s*(INSERT|UPDATE|DELETE|REPLACE)\b", re.I)


def http_url(url: str) -> str:
    """libsql://db-org.turso.io (what Turso shows) -> https://db-org.turso.io"""
    url = url.strip().rstrip("/")
    return re.sub(r"^(libsql|turso|wss?)://", "https://", url)


def _http() -> httpx.Client:
    global _client
    with _client_lock:
        if _client is None:
            _client = httpx.Client(timeout=TIMEOUT, transport=transport) if transport else httpx.Client(timeout=TIMEOUT)
        return _client


def reset_client() -> None:
    """Forget the shared HTTP client (tests swap the transport)."""
    global _client
    with _client_lock:
        _client = None


# ---------------------------------------------------------------- values

def _arg(v) -> dict:
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": "1" if v else "0"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"type": "blob", "base64": base64.b64encode(bytes(v)).decode()}
    return {"type": "text", "value": str(v)}


def _value(cell: dict):
    t = cell.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(cell["value"])
    if t == "float":
        return float(cell["value"])
    if t == "blob":
        return base64.b64decode(cell.get("base64") or "")
    return cell.get("value")


class Row(tuple):
    """A result row: by position, by column name (row["email"]), and row.keys()."""
    __slots__ = ()
    _names: tuple = ()
    _index: dict = {}

    def __getitem__(self, key):
        if isinstance(key, str):
            try:
                return tuple.__getitem__(self, self._index[key])
            except KeyError:
                lowered = {k.lower(): i for k, i in self._index.items()}
                if key.lower() in lowered:
                    return tuple.__getitem__(self, lowered[key.lower()])
                raise IndexError(f"No item with that key: {key}") from None
        return tuple.__getitem__(self, key)

    def keys(self) -> list[str]:
        return list(self._names)


def _row_class(names: list[str]):
    # One small class per result shape, holding the column lookup once.
    return type("Row", (Row,), {"__slots__": (), "_names": tuple(names), "_index": {n: i for i, n in enumerate(names)}})


class Cursor:
    def __init__(self, result: dict | None):
        result = result or {}
        names = [c.get("name") or "" for c in result.get("cols") or []]
        cls = _row_class(names)
        self.rows = [cls(_value(c) for c in r) for r in result.get("rows") or []]
        self.description = tuple((n, None, None, None, None, None, None) for n in names) if names else None
        # Like sqlite3: rows changed for INSERT/UPDATE/DELETE, -1 for queries that return rows.
        self.rowcount = -1 if names else int(result.get("affected_row_count") or 0)
        rid = result.get("last_insert_rowid")
        self.lastrowid = int(rid) if rid not in (None, "") else None
        self._i = 0

    def fetchone(self):
        if self._i >= len(self.rows):
            return None
        self._i += 1
        return self.rows[self._i - 1]

    def fetchall(self):
        rest, self._i = self.rows[self._i:], len(self.rows)
        return rest

    def fetchmany(self, size: int = 1):
        out = self.rows[self._i:self._i + size]
        self._i += len(out)
        return out

    def __iter__(self):
        while (row := self.fetchone()) is not None:
            yield row

    def close(self) -> None:
        pass


def _raise(error: dict, sql: str):
    message = (error or {}).get("message") or "Turso error"
    code = (error or {}).get("code") or ""
    text = f"{message}"
    if "constraint" in message.lower() or "CONSTRAINT" in code:
        raise sqlite3.IntegrityError(text)
    raise sqlite3.OperationalError(text)


# ---------------------------------------------------------------- connection

class Connection:
    """sqlite3.Connection-like access to one Turso database."""

    def __init__(self, url: str, token: str):
        self.url = http_url(url) + "/v2/pipeline"
        self.token = token
        self.baton: str | None = None
        self.in_transaction = False
        self.row_factory = None  # accepted for compatibility; rows always behave like sqlite3.Row
        self._lock = threading.RLock()

    # The server side: send a few statements, keep the stream open.
    def _pipeline(self, stmts: list[tuple[str, tuple]], close: bool = False) -> list[dict]:
        fresh = self.baton is None
        requests = []
        if fresh:  # a new stream is a new connection: same settings as sqlite3 connections get
            requests.append({"type": "execute", "stmt": {"sql": "PRAGMA foreign_keys = ON"}})
        requests += [{"type": "execute", "stmt": {"sql": sql, "args": [_arg(a) for a in args]}} for sql, args in stmts]
        if close:
            requests.append({"type": "close"})
        body = {"requests": requests}
        if self.baton:
            body["baton"] = self.baton
        try:
            r = _http().post(self.url, json=body, headers={"Authorization": f"Bearer {self.token}"})
        except httpx.HTTPError as e:
            raise sqlite3.OperationalError(f"Couldn't reach Turso ({type(e).__name__})") from None
        if r.status_code == 401 or r.status_code == 403:
            raise sqlite3.OperationalError("Turso refused the token: check TURSO_AUTH_TOKEN")
        if r.status_code >= 400:
            if self.baton and r.status_code in (400, 404) and not self.in_transaction:
                # The stream expired (idle over ~10 s): start a fresh one once.
                self.baton = None
                return self._pipeline(stmts, close)
            raise sqlite3.OperationalError(f"Turso answered {r.status_code}: {r.text[:200]}")
        data = r.json()
        self.baton = None if close else data.get("baton")
        results = data.get("results") or []
        if fresh:
            pragma = results.pop(0) if results else {}
            if pragma.get("type") == "error":
                log.warning("Turso: PRAGMA foreign_keys isn't available (%s)", (pragma.get("error") or {}).get("message"))
        out = []
        for (sql, _), res in zip(stmts, results):
            if res.get("type") == "error":
                _raise(res.get("error"), sql)  # earlier statements in this request already ran (and are tracked)
            # Track the transaction from what the server confirmed, statement by statement,
            # so a failing write after an automatic BEGIN still leaves us able to roll back.
            word = sql.lstrip().split(None, 1)[0].upper() if sql.strip() else ""
            if word in ("BEGIN", "SAVEPOINT"):
                self.in_transaction = True
            elif word in ("COMMIT", "END", "ROLLBACK") and not sql.upper().lstrip().startswith("ROLLBACK TO"):
                self.in_transaction = False
            out.append(((res.get("response") or {}).get("result")) or {})
        return out

    def execute(self, sql: str, params=()) -> Cursor:
        params = tuple(params or ())
        with self._lock:
            stmts = []
            if _WRITE.match(sql) and not self.in_transaction:
                stmts.append(("BEGIN", ()))           # like sqlite3: a write opens a transaction
            stmts.append((sql, params))
            results = self._pipeline(stmts)
            return Cursor(results[-1])

    def executemany(self, sql: str, seq) -> Cursor:
        rows = [tuple(p) for p in seq]
        if not rows:
            return Cursor({})
        with self._lock:
            stmts = [("BEGIN", ())] if _WRITE.match(sql) and not self.in_transaction else []
            stmts += [(sql, p) for p in rows]
            results = self._pipeline(stmts)
            cur = Cursor(results[-1])
            cur.rowcount = sum(int(r.get("affected_row_count") or 0) for r in results[1 if stmts[0][0] == "BEGIN" else 0:])
            return cur

    def executescript(self, script: str) -> None:
        """Run a script of statements (the schema at start-up)."""
        statements, buf = [], ""
        for part in script.split(";"):
            buf += part + ";"
            if sqlite3.complete_statement(buf):
                if buf.strip(" \n\t;"):
                    statements.append(buf.strip())
                buf = ""
        with self._lock:
            if self.in_transaction:
                self.commit()
            for i in range(0, len(statements), 50):
                self._pipeline([(s, ()) for s in statements[i:i + 50]])

    def commit(self) -> None:
        with self._lock:
            if self.in_transaction:
                self._pipeline([("COMMIT", ())])

    def rollback(self) -> None:
        with self._lock:
            if self.in_transaction:
                try:
                    self._pipeline([("ROLLBACK", ())])
                except sqlite3.Error:
                    pass  # the server drops an unfinished transaction anyway
                self.in_transaction = False

    def close(self) -> None:
        with self._lock:
            if self.in_transaction:
                self.rollback()
            if self.baton:
                try:
                    self._pipeline([], close=True)
                except sqlite3.Error:
                    pass
            self.baton = None

    # `with connect() as db:` commits on success and rolls back on an error, like sqlite3.
    # It also closes the server-side stream; a later execute() simply opens a new one.
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        self.close()
        return False


def connect(url: str, token: str) -> Connection:
    return Connection(url, token)
