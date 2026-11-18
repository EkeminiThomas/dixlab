"""The Turso connector (app/turso.py) against a fake Turso server: rows, types,
transactions, errors, cascades and expired streams behave like sqlite3."""
import os
import sqlite3
import tempfile

import pytest

import test_api  # sets up the environment first
import turso_fake
from app import db as db_mod, turso


@pytest.fixture()
def fake(monkeypatch):
    path = os.path.join(tempfile.mkdtemp(), "turso.db")
    keep = turso.transport
    f = turso_fake.install(path)
    yield f
    turso.transport = keep
    turso.reset_client()


def conn():
    return turso.connect("libsql://fake-dixlab.turso.test", turso_fake.TOKEN)


def test_the_suite_really_runs_through_turso_when_asked():
    if not os.getenv("DIXLAB_TEST_TURSO"):
        pytest.skip("run with DIXLAB_TEST_TURSO=1")
    before = test_api.FAKE_TURSO.requests
    c = test_api.client()
    test_api.sign_up(c, "through-turso@example.com")
    assert db_mod.using_turso() and test_api.FAKE_TURSO.requests > before


def test_rows_types_and_rowcount(fake):
    c = conn()
    c.executescript("""CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE, score REAL, data BLOB, note TEXT);
                       -- a comment with a ; inside
                       CREATE INDEX t_name ON t(name);""")
    cur = c.execute("INSERT INTO t (name, score, data, note) VALUES (?, ?, ?, ?)", ("ada", 1.5, b"\x00\x01", None))
    assert cur.rowcount == 1 and cur.lastrowid == 1
    c.commit()
    row = c.execute("SELECT id, name, score, data, note FROM t").fetchone()
    assert row["name"] == "ada" and row[0] == 1 and row["score"] == 1.5 and row["data"] == b"\x00\x01" and row["note"] is None
    assert row.keys() == ["id", "name", "score", "data", "note"] and "name" in row.keys()
    i, name, *_ = row
    assert (i, name) == (1, "ada")
    assert c.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 1
    assert c.execute("UPDATE t SET score = 2 WHERE name = 'nobody'").rowcount == 0
    assert [r["name"] for r in c.execute("SELECT name FROM t")] == ["ada"]
    c.executemany("INSERT INTO t (name) VALUES (?)", [("bo",), ("cy",)])
    c.commit()
    assert {r[0] for r in c.execute("PRAGMA table_info(t)")} == {0, 1, 2, 3, 4}
    c.close()


def test_errors_and_transactions(fake):
    c = conn()
    c.executescript("CREATE TABLE t (name TEXT UNIQUE)")
    c.execute("INSERT INTO t VALUES ('ada')")
    c.commit()
    with pytest.raises(sqlite3.IntegrityError):
        c.execute("INSERT INTO t VALUES ('ada')")
    c.rollback()
    with pytest.raises(sqlite3.OperationalError):
        c.execute("SELECT nope FROM t")
    # Rolled back writes vanish; committed ones stay.
    c.execute("INSERT INTO t VALUES ('temp')")
    c.rollback()
    assert [r[0] for r in c.execute("SELECT name FROM t")] == ["ada"]
    # `with` commits on success, rolls back on error.
    with conn() as d:
        d.execute("INSERT INTO t VALUES ('kept')")
    with pytest.raises(RuntimeError):
        with conn() as d:
            d.execute("INSERT INTO t VALUES ('dropped')")
            raise RuntimeError
    assert sorted(r[0] for r in conn().execute("SELECT name FROM t")) == ["ada", "kept"]


def test_foreign_keys_cascade_like_the_local_database(fake):
    c = conn()
    c.executescript("""CREATE TABLE users (id TEXT PRIMARY KEY);
                       CREATE TABLE projects (user_id TEXT REFERENCES users(id) ON DELETE CASCADE, id TEXT);""")
    c.execute("INSERT INTO users VALUES ('u1')")
    c.execute("INSERT INTO projects VALUES ('u1', 'p1')")
    c.execute("DELETE FROM users WHERE id = 'u1'")
    c.commit()
    assert c.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 0     # deleting an account removes its work


def test_expired_streams_and_bad_tokens(fake):
    c = conn()
    c.execute("SELECT 1")
    fake.streams.clear()                       # the server dropped the idle stream
    assert c.execute("SELECT 2").fetchone()[0] == 2
    bad = turso.connect("libsql://fake-dixlab.turso.test", "wrong")
    with pytest.raises(sqlite3.OperationalError, match="TURSO_AUTH_TOKEN"):
        bad.execute("SELECT 1")
    assert turso.http_url("libsql://db-org.turso.io/") == "https://db-org.turso.io"
