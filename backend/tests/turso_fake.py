"""A fake Turso server for the tests: speaks Turso's HTTP API (POST /v2/pipeline,
batons, typed values, per-statement errors) and runs each statement on a real
SQLite file underneath, one SQLite connection per Turso stream, like the real
service. Lets the whole test suite run through app/turso.py.

Run the suite against it:  DIXLAB_TEST_TURSO=1 python -m pytest"""
import base64
import json
import secrets
import sqlite3
import threading

import httpx

TOKEN = "test-turso-token"


class FakeTurso:
    def __init__(self, path: str):
        self.path = path
        self.streams: dict[str, sqlite3.Connection] = {}
        self.lock = threading.Lock()
        self.requests = 0

    @staticmethod
    def _arg(a: dict):
        t = a.get("type")
        if t == "null":
            return None
        if t == "integer":
            return int(a["value"])
        if t == "float":
            return float(a["value"])
        if t == "blob":
            return base64.b64decode(a["base64"])
        return a["value"]

    @staticmethod
    def _cell(v) -> dict:
        if v is None:
            return {"type": "null"}
        if isinstance(v, bool) or isinstance(v, int):
            return {"type": "integer", "value": str(int(v))}
        if isinstance(v, float):
            return {"type": "float", "value": v}
        if isinstance(v, bytes):
            return {"type": "blob", "base64": base64.b64encode(v).decode()}
        return {"type": "text", "value": str(v)}

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.headers.get("authorization") != f"Bearer {TOKEN}":
            return httpx.Response(401, json={"error": "Unauthorized"})
        if request.url.path != "/v2/pipeline":
            return httpx.Response(404)
        self.requests += 1
        body = json.loads(request.content)
        baton = body.get("baton")
        with self.lock:
            if baton:
                conn = self.streams.pop(baton, None)
                if conn is None:
                    return httpx.Response(400, json={"error": "stream expired"})
            else:
                conn = sqlite3.connect(self.path, isolation_level=None, check_same_thread=False, timeout=10)
        results, closed = [], False
        for req in body.get("requests", []):
            if req["type"] == "close":
                conn.close()
                closed = True
                results.append({"type": "ok", "response": {"type": "close"}})
                continue
            stmt = req["stmt"]
            try:
                cur = conn.execute(stmt["sql"], [self._arg(a) for a in stmt.get("args", [])])
                cols = [{"name": d[0], "decltype": None} for d in (cur.description or [])]
                rows = [[self._cell(v) for v in r] for r in cur.fetchall()] if cur.description else []
                results.append({"type": "ok", "response": {"type": "execute", "result": {
                    "cols": cols, "rows": rows,
                    "affected_row_count": 0 if cur.description else max(cur.rowcount, 0),
                    "last_insert_rowid": str(cur.lastrowid) if cur.lastrowid else None}}})
            except sqlite3.Error as e:
                results.append({"type": "error", "error": {"message": str(e), "code": type(e).__name__.upper()}})
        new_baton = None
        if not closed:
            new_baton = secrets.token_hex(8)
            with self.lock:
                self.streams[new_baton] = conn
        return httpx.Response(200, json={"baton": new_baton, "base_url": None, "results": results})


def install(path: str) -> FakeTurso:
    """Point app.turso at a fake server backed by the SQLite file at `path`."""
    from app import turso
    fake = FakeTurso(path)
    turso.transport = httpx.MockTransport(fake.handle)
    turso.reset_client()
    return fake
