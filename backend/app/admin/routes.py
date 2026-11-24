"""Admin dashboard API. Everything here needs an admin account (see
app.admin.cli). Admins see accounts, activity and content metadata;
private things stay private: no passwords, no session tokens, and no
contents of the messages visitors send to portfolio owners."""
import csv
import io
import json
import os
import platform
import re
import sqlite3
import sys
import time

from typing import Literal

import fastapi
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import accounts, ai, events, mailer, plans
from ..config import DB_PATH, UPLOAD_DIR
from ..db import get_db
from ..security import now_ms
from .access import require_admin
from ..routers.projects import UPLOAD_RE

router = APIRouter(prefix="/api/admin", tags=["admin"])

STARTED = time.time()
DAY_MS = 86_400_000
PAGE = 25


# ---------- helpers ----------

def _days(days: int) -> list[str]:
    """The last `days` UTC dates, oldest first, ending today."""
    now = time.time()
    return [time.strftime("%Y-%m-%d", time.gmtime(now - i * 86400)) for i in range(days - 1, -1, -1)]


def _series(db, sql: str, params: tuple, days: list[str]) -> list[dict]:
    """Fill a {day: count} query into one value per day, zeros included."""
    counts = {r[0]: r[1] for r in db.execute(sql, params)}
    return [{"day": d, "value": counts.get(d, 0)} for d in days]


DAY_EXPR = "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')"


def _since(days: int) -> int:
    return now_ms() - days * DAY_MS


def _dir_size(path) -> tuple[int, int]:
    files = size = 0
    if path.exists():
        for f in path.iterdir():
            if f.is_file():
                files += 1
                size += f.stat().st_size
    return files, size


def _user_row(r) -> dict:
    return {
        "id": r["id"], "name": r["name"], "email": r["email"], "createdAt": r["created_at"],
        "lastSeenAt": r["last_seen_at"], "isAdmin": bool(r["is_admin"]), "emailVerified": r["email_verified_at"] is not None,
        "suspended": r["suspended_at"] is not None, "suspendedAt": r["suspended_at"], "suspendReason": r["suspend_reason"],
    }


def _event_row(r) -> dict:
    return {"id": r["id"], "type": r["type"], "userId": r["user_id"], "userName": r["user_name"], "userEmail": r["user_email"],
            "actorId": r["actor_id"], "data": json.loads(r["data"] or "{}"), "createdAt": r["created_at"]}


EVENT_SELECT = """SELECT e.*, u.name AS user_name, u.email AS user_email FROM events e
                  LEFT JOIN users u ON u.id = e.user_id"""


def _get_user(db, user_id: str):
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    return row


def _not_self(admin: dict, user_id: str, what: str) -> None:
    if admin["id"] == user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can’t {what} your own account.")


def _delete_files(names) -> None:
    for name in names:
        if re.fullmatch(r"[a-f0-9]{32}\.[a-z0-9]{2,5}", name):
            (UPLOAD_DIR / name).unlink(missing_ok=True)


# ---------- overview ----------

@router.get("/overview")
def overview(days: int = Query(30, ge=7, le=365), admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    since, prev = _since(days), _since(days * 2)
    one = lambda sql, *p: db.execute(sql, p).fetchone()[0] or 0  # noqa: E731
    day_list = _days(days)

    users_total = one("SELECT COUNT(*) FROM users")
    new_users = one("SELECT COUNT(*) FROM users WHERE created_at >= ?", since)
    new_users_prev = one("SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?", prev, since)
    active = one("SELECT COUNT(*) FROM users WHERE last_seen_at >= ?", _since(7))
    active_prev = one("SELECT COUNT(*) FROM users WHERE last_seen_at >= ? AND last_seen_at < ?", _since(14), _since(7))
    pages_live = one("SELECT COUNT(*) FROM publications")
    published = one("SELECT COUNT(*) FROM events WHERE type = 'page.published' AND created_at >= ?", since)
    published_prev = one("SELECT COUNT(*) FROM events WHERE type = 'page.published' AND created_at >= ? AND created_at < ?", prev, since)
    views_total = one("SELECT SUM(views) FROM publications")
    first_day = day_list[0]
    prev_first = _days(days * 2)[0]
    views = one("SELECT SUM(views) FROM page_views_daily WHERE day >= ?", first_day)
    views_prev = one("SELECT SUM(views) FROM page_views_daily WHERE day >= ? AND day < ?", prev_first, first_day)
    ai_calls = one("SELECT COUNT(*) FROM events WHERE type LIKE 'ai.%' AND created_at >= ?", since)
    ai_failed = one("SELECT COUNT(*) FROM events WHERE type LIKE 'ai.%' AND created_at >= ? AND json_extract(data, '$.ok') = 0", since)
    messages = one("SELECT COUNT(*) FROM messages WHERE created_at >= ?", since)
    errors = one("SELECT COUNT(*) FROM events WHERE type = 'error' AND created_at >= ?", _since(1))

    # Funnel: of everyone who signed up, how many got to each step.
    funnel = [
        {"step": "Signed up", "value": users_total},
        {"step": "Created a project", "value": one("SELECT COUNT(DISTINCT user_id) FROM projects")},
        {"step": "Published a page", "value": one("SELECT COUNT(DISTINCT user_id) FROM publications")},
        {"step": "Got a view", "value": one("SELECT COUNT(DISTINCT user_id) FROM publications WHERE views > 0")},
        {"step": "Got a message", "value": one("SELECT COUNT(DISTINCT user_id) FROM messages")},
    ]
    by_type = [{"label": r[0], "value": r[1]} for r in db.execute("SELECT type, COUNT(*) FROM projects GROUP BY type ORDER BY 2 DESC")]
    templates = [{"label": r[0] or "unknown", "kind": r[1], "value": r[2]} for r in db.execute(
        "SELECT json_extract(data, '$.template'), type, COUNT(*) FROM projects GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12")]
    ai_by_feature = [{"label": r[0][3:], "value": r[1], "failed": r[2]} for r in db.execute(
        "SELECT type, COUNT(*), SUM(json_extract(data, '$.ok') = 0) FROM events WHERE type LIKE 'ai.%' AND created_at >= ? "
        "GROUP BY type ORDER BY 2 DESC", (since,))]

    recent = [_event_row(r) for r in db.execute(f"{EVENT_SELECT} ORDER BY e.id DESC LIMIT 12")]
    return {
        "days": days,
        "kpis": {
            "users": {"value": users_total, "new": new_users, "newPrev": new_users_prev},
            "active7": {"value": active, "prev": active_prev},
            "pages": {"value": pages_live, "new": published, "newPrev": published_prev},
            "views": {"value": views, "prev": views_prev, "total": views_total},
            "ai": {"value": ai_calls, "failed": ai_failed, "configured": ai.configured()},
            "messages": {"value": messages},
            "errors24h": errors,
        },
        "series": {
            "signups": _series(db, f"SELECT {DAY_EXPR}, COUNT(*) FROM users WHERE created_at >= ? GROUP BY 1", (_since(days + 1),), day_list),
            "projects": _series(db, f"SELECT {DAY_EXPR}, COUNT(*) FROM events WHERE type = 'project.created' AND created_at >= ? GROUP BY 1", (_since(days + 1),), day_list),
            "published": _series(db, f"SELECT {DAY_EXPR}, COUNT(*) FROM events WHERE type = 'page.published' AND created_at >= ? GROUP BY 1", (_since(days + 1),), day_list),
            "views": _series(db, "SELECT day, SUM(views) FROM page_views_daily WHERE day >= ? GROUP BY day", (first_day,), day_list),
        },
        "funnel": funnel,
        "byType": by_type,
        "templates": templates,
        "aiByFeature": ai_by_feature,
        "recent": recent,
    }


# ---------- users ----------

USER_SORTS = {"newest": "u.created_at DESC", "oldest": "u.created_at ASC", "active": "u.last_seen_at DESC NULLS LAST",
              "name": "u.name COLLATE NOCASE ASC", "projects": "projects DESC", "views": "views DESC"}
USER_LIST = """SELECT u.*,
    (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
    (SELECT COUNT(*) FROM publications p WHERE p.user_id = u.id) AS pages,
    (SELECT COALESCE(SUM(views), 0) FROM publications p WHERE p.user_id = u.id) AS views
    FROM users u"""


def _user_filter(q: str, state: str) -> tuple[str, list]:
    where, params = [], []
    if q.strip():
        where.append("(u.name LIKE ? OR u.email LIKE ? OR u.id = ?)")
        like = f"%{q.strip()}%"
        params += [like, like, q.strip()]
    if state == "suspended":
        where.append("u.suspended_at IS NOT NULL")
    elif state == "active":
        where.append("u.suspended_at IS NULL")
    elif state == "admins":
        where.append("u.is_admin = 1")
    return (" WHERE " + " AND ".join(where)) if where else "", params


@router.get("/users")
def users(q: str = "", state: str = Query("all", pattern="^(all|active|suspended|admins)$"),
          sort: str = Query("newest", pattern="^(" + "|".join(USER_SORTS) + ")$"), page: int = Query(1, ge=1),
          admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    where, params = _user_filter(q, state)
    total = db.execute(f"SELECT COUNT(*) FROM users u{where}", params).fetchone()[0]
    rows = db.execute(f"{USER_LIST}{where} ORDER BY {USER_SORTS[sort]} LIMIT ? OFFSET ?", [*params, PAGE, (page - 1) * PAGE]).fetchall()
    items = [{**_user_row(r), "projects": r["projects"], "pages": r["pages"], "views": r["views"]} for r in rows]
    return {"users": items, "total": total, "page": page, "pageSize": PAGE}


@router.get("/users.csv")
def users_csv(q: str = "", state: str = Query("all", pattern="^(all|active|suspended|admins)$"),
              admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    where, params = _user_filter(q, state)
    rows = db.execute(f"{USER_LIST}{where} ORDER BY u.created_at DESC", params).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "name", "email", "joined_utc", "last_active_utc", "projects", "published_pages", "views", "status", "admin"])
    iso = lambda ms: time.strftime("%Y-%m-%d %H:%M", time.gmtime(ms / 1000)) if ms else ""  # noqa: E731
    for r in rows:
        u = _user_row(r)
        # Neutralise spreadsheet formulas in user-supplied text.
        safe = lambda v: f"'{v}" if isinstance(v, str) and v[:1] in "=+-@" else v  # noqa: E731
        w.writerow([u["id"], safe(u["name"]), safe(u["email"]), iso(u["createdAt"]), iso(u["lastSeenAt"]), r["projects"],
                    r["pages"], r["views"], "suspended" if u["suspended"] else "active", "yes" if u["isAdmin"] else "no"])
    events.log(db, "admin.export_users", None, admin["id"], count=len(rows))
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="dixlab-users.csv"'})


@router.get("/users/{user_id}")
def user_detail(user_id: str, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    row = _get_user(db, user_id)
    pubs = {r["project_id"]: r for r in db.execute("SELECT * FROM publications WHERE user_id = ?", (user_id,))}
    projects = []
    for r in db.execute("SELECT id, type, data, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC", (user_id,)):
        d = json.loads(r["data"])
        pub = pubs.get(r["id"])
        projects.append({"id": r["id"], "type": r["type"], "template": d.get("template"),
                         "title": d.get("title") or d.get("name") or "Untitled", "updatedAt": r["updated_at"],
                         "slug": pub["slug"] if pub else None, "views": pub["views"] if pub else 0})
    up = db.execute("SELECT COUNT(*), COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ?", (user_id,)).fetchone()
    sessions = db.execute("SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?", (user_id, int(time.time()))).fetchone()[0]
    msgs = db.execute("SELECT COUNT(*) FROM messages WHERE user_id = ?", (user_id,)).fetchone()[0]
    activity = [_event_row(r) for r in db.execute(f"{EVENT_SELECT} WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 30", (user_id,))]
    info = plans.current(db, user_id)
    plan = {"plan": info["plan"], "name": plans.PLANS[info["plan"]]["name"], "source": info["source"],
            "given": db.execute("SELECT plan_override FROM users WHERE id = ?", (user_id,)).fetchone()["plan_override"],
            "credits": plans.balance(db, user_id), "unlocks": plans.unlocked(db, user_id), "history": plans.history(db, user_id, 15)}
    return {"user": _user_row(row), "projects": projects, "uploads": {"count": up[0], "bytes": up[1]},
            "sessions": sessions, "messages": msgs, "activity": activity, "plan": plan}


class ReasonIn(BaseModel):
    reason: str = Field(default="", max_length=300)


@router.post("/users/{user_id}/suspend")
def suspend(user_id: str, body: ReasonIn, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    _not_self(admin, user_id, "suspend")
    _get_user(db, user_id)
    db.execute("UPDATE users SET suspended_at = ?, suspend_reason = ? WHERE id = ?", (now_ms(), body.reason.strip() or None, user_id))
    db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    events.log(db, "admin.suspend", user_id, admin["id"], reason=body.reason.strip())
    return {"ok": True}


@router.post("/users/{user_id}/unsuspend")
def unsuspend(user_id: str, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    _get_user(db, user_id)
    db.execute("UPDATE users SET suspended_at = NULL, suspend_reason = NULL WHERE id = ?", (user_id,))
    events.log(db, "admin.unsuspend", user_id, admin["id"])
    return {"ok": True}


@router.post("/users/{user_id}/signout")
def sign_out_everywhere(user_id: str, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    _get_user(db, user_id)
    n = db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,)).rowcount
    events.log(db, "admin.signout", user_id, admin["id"], sessions=n)
    return {"ok": True, "sessions": n}


class AdminIn(BaseModel):
    isAdmin: bool


@router.patch("/users/{user_id}/admin")
def set_admin(user_id: str, body: AdminIn, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    _get_user(db, user_id)  # 404 if the user doesn't exist
    if not body.isAdmin:
        _not_self(admin, user_id, "remove admin from")
    db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1 if body.isAdmin else 0, user_id))
    events.log(db, "admin.grant" if body.isAdmin else "admin.revoke", user_id, admin["id"])
    return {"ok": True}


class PlanIn(BaseModel):
    plan: Literal["free", "starter", "pro", "premium", "none"]


@router.patch("/users/{user_id}/plan")
def set_plan(user_id: str, body: PlanIn, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """Give someone a plan for free (yourself, teammates, testers), or "none" to take it back.
    Their own paid plan or trial still applies if it's higher."""
    _get_user(db, user_id)
    db.execute("UPDATE users SET plan_override = ? WHERE id = ?", (None if body.plan == "none" else body.plan, user_id))
    events.log(db, "admin.set_plan", user_id, admin["id"], plan=body.plan)
    info = plans.current(db, user_id)
    return {"plan": info["plan"], "name": plans.PLANS[info["plan"]]["name"], "source": info["source"],
            "given": None if body.plan == "none" else body.plan}


class CreditsIn(BaseModel):
    amount: int = Field(ge=-100000, le=100000)
    note: str = Field(default="", max_length=200)


@router.post("/users/{user_id}/credits")
def give_credits(user_id: str, body: CreditsIn, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """Give (or, with a negative amount, take back) credits: refunds by hand, goodwill, testers."""
    _get_user(db, user_id)
    if body.amount == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Enter a number of credits.")
    if body.amount < 0 and plans.balance(db, user_id) + body.amount < 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "That would take the balance below zero.")
    plans.add_credits(db, user_id, body.amount, "admin")
    events.log(db, "admin.credits", user_id, admin["id"], amount=body.amount, note=body.note.strip())
    return {"credits": plans.balance(db, user_id), "history": plans.history(db, user_id, 15)}


class ConfirmIn(BaseModel):
    email: str = Field(max_length=320)


@router.delete("/users/{user_id}")
def delete_user(user_id: str, body: ConfirmIn, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """Delete an account and everything in it. The admin must type the email to confirm."""
    _not_self(admin, user_id, "delete")
    row = _get_user(db, user_id)
    if body.email.strip().lower() != row["email"].lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type the account’s email exactly to confirm.")
    counts, files = accounts.delete_account(db, user_id)
    events.log(db, "admin.delete_user", user_id, admin["id"], email_domain=row["email"].split("@")[-1], **counts)
    db.commit()
    _delete_files(files)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- published pages ----------

PAGE_SORTS = {"newest": "p.created_at DESC", "updated": "p.updated_at DESC", "views": "p.views DESC"}


@router.get("/pages")
def pages(q: str = "", kind: str = Query("all", pattern="^(all|portfolio|cv|case)$"),
          gallery: str = Query("any", pattern="^(any|requested|featured)$"),
          sort: str = Query("newest", pattern="^(newest|updated|views)$"), page: int = Query(1, ge=1),
          admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    where, params = [], []
    if q.strip():
        like = f"%{q.strip()}%"
        where.append("(p.slug LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR json_extract(p.data, '$.title') LIKE ?)")
        params += [like, like, like, like]
    if kind != "all":
        where.append("json_extract(p.data, '$.type') = ?")
        params.append(kind)
    if gallery != "any":
        where.append("p.gallery = ?")
        params.append(gallery)
    w = (" WHERE " + " AND ".join(where)) if where else ""
    base = f"FROM publications p JOIN users u ON u.id = p.user_id{w}"
    total = db.execute(f"SELECT COUNT(*) {base}", params).fetchone()[0]
    rows = db.execute(
        f"""SELECT p.slug, p.project_id, p.views, p.gallery, p.created_at, p.updated_at, u.id AS user_id, u.name, u.email, u.suspended_at,
            json_extract(p.data, '$.type') AS kind, json_extract(p.data, '$.template') AS template,
            COALESCE(json_extract(p.data, '$.title'), json_extract(p.data, '$.name')) AS title
            {base} ORDER BY {PAGE_SORTS[sort]} LIMIT ? OFFSET ?""", [*params, PAGE, (page - 1) * PAGE]).fetchall()
    items = [{"slug": r["slug"], "projectId": r["project_id"], "title": r["title"] or "Untitled", "kind": r["kind"],
              "template": r["template"], "views": r["views"], "gallery": r["gallery"], "createdAt": r["created_at"], "updatedAt": r["updated_at"],
              "owner": {"id": r["user_id"], "name": r["name"], "email": r["email"], "suspended": r["suspended_at"] is not None}}
             for r in rows]
    return {"pages": items, "total": total, "page": page, "pageSize": PAGE}


@router.post("/pages/{slug}/takedown")
def takedown(slug: str, body: ReasonIn, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """Unpublish someone's page (for abuse or policy reasons). Their project is kept."""
    row = db.execute("SELECT user_id, project_id FROM publications WHERE slug = ?", (slug,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That page isn’t published.")
    db.execute("DELETE FROM publications WHERE slug = ?", (slug,))
    events.log(db, "admin.takedown", row["user_id"], admin["id"], slug=slug, project=row["project_id"], reason=body.reason.strip())
    return {"ok": True}


class GalleryDecision(BaseModel):
    status: Literal["featured", "declined", "none"]


@router.post("/pages/{slug}/gallery")
def gallery_decision(slug: str, body: GalleryDecision, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """Feature a page in the public gallery, decline the request, or take it out."""
    row = db.execute("SELECT user_id, password_hash FROM publications WHERE slug = ?", (slug,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That page isn’t published.")
    if body.status == "featured" and row["password_hash"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password-protected pages can’t be featured.")
    new = None if body.status == "none" else body.status
    db.execute("UPDATE publications SET gallery = ?, featured_at = ? WHERE slug = ?",
               (new, now_ms() if new == "featured" else None, slug))
    events.log(db, f"admin.gallery.{body.status}", row["user_id"], admin["id"], slug=slug)
    return {"ok": True, "gallery": new}


# ---------- messages (metadata only) ----------

@router.get("/messages")
def messages(page: int = Query(1, ge=1), admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    total = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    rows = db.execute(
        """SELECT m.id, m.slug, m.name, m.email, m.emailed, m.read_at, m.created_at, LENGTH(m.body) AS length,
                  u.id AS owner_id, u.name AS owner_name
           FROM messages m JOIN users u ON u.id = m.user_id ORDER BY m.created_at DESC LIMIT ? OFFSET ?""",
        (PAGE, (page - 1) * PAGE)).fetchall()
    # Repeat senders across many portfolios are a spam signal.
    senders = {r[0]: r[1] for r in db.execute(
        "SELECT lower(email), COUNT(DISTINCT user_id) FROM messages WHERE created_at >= ? GROUP BY 1", (_since(1),))}
    items = [{"id": r["id"], "slug": r["slug"], "fromName": r["name"], "fromEmail": r["email"], "emailed": bool(r["emailed"]),
              "read": r["read_at"] is not None, "createdAt": r["created_at"], "length": r["length"],
              "owner": {"id": r["owner_id"], "name": r["owner_name"]},
              "spammy": senders.get(r["email"].lower(), 0) >= 3} for r in rows]
    return {"messages": items, "total": total, "page": page, "pageSize": PAGE, "emailEnabled": mailer.configured()}


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(message_id: str, admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT user_id FROM messages WHERE id = ?", (message_id,)).fetchone()
    if row:
        db.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        events.log(db, "admin.delete_message", row["user_id"], admin["id"], message=message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- storage ----------

def _referenced(db) -> set[str]:
    names = set()
    for (data,) in db.execute("SELECT data FROM projects UNION ALL SELECT data FROM publications"):
        names.update(UPLOAD_RE.findall(data))
    return names


def _orphans(db, older_than_ms: int = DAY_MS):
    """Uploads no project or published page uses, older than a day (so
    nothing mid-edit is caught)."""
    used = _referenced(db)
    cutoff = now_ms() - older_than_ms
    return [r for r in db.execute("SELECT name, user_id, size, created_at FROM uploads WHERE created_at < ?", (cutoff,))
            if r["name"] not in used]


@router.get("/storage")
def storage(admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    kinds = [{"label": r[0], "count": r[1], "bytes": r[2]} for r in db.execute(
        """SELECT CASE WHEN content_type LIKE 'image/%' THEN 'Images' WHEN content_type LIKE 'video/%' THEN 'Videos'
                       ELSE 'Documents' END, COUNT(*), COALESCE(SUM(size), 0) FROM uploads GROUP BY 1 ORDER BY 3 DESC""")]
    largest = [{"name": r["name"], "size": r["size"], "contentType": r["content_type"], "createdAt": r["created_at"],
                "owner": {"id": r["user_id"], "name": r["uname"]}} for r in db.execute(
        "SELECT up.*, u.name AS uname FROM uploads up LEFT JOIN users u ON u.id = up.user_id ORDER BY up.size DESC LIMIT 15")]
    top_users = [{"id": r[0], "name": r[1], "count": r[2], "bytes": r[3]} for r in db.execute(
        """SELECT u.id, u.name, COUNT(*), SUM(up.size) FROM uploads up JOIN users u ON u.id = up.user_id
           GROUP BY u.id ORDER BY 4 DESC LIMIT 10""")]
    orphans = _orphans(db)
    files, disk = _dir_size(UPLOAD_DIR)
    return {"kinds": kinds, "largest": largest, "topUsers": top_users, "disk": {"files": files, "bytes": disk},
            "orphans": {"count": len(orphans), "bytes": sum(r["size"] for r in orphans)}}


@router.post("/storage/cleanup")
def cleanup(admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    orphans = _orphans(db)
    names = [r["name"] for r in orphans]
    for name in names:
        db.execute("DELETE FROM uploads WHERE name = ?", (name,))
    freed = sum(r["size"] for r in orphans)
    events.log(db, "admin.cleanup_uploads", None, admin["id"], files=len(names), bytes=freed)
    db.commit()
    _delete_files(names)
    return {"files": len(names), "bytes": freed}


# ---------- activity & audit ----------

@router.get("/activity")
def activity(type: str = Query("", max_length=40, pattern=r"^[a-z_.]*$"), user: str = Query("", max_length=64),
             page: int = Query(1, ge=1), admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    where, params = [], []
    if type:
        if type.endswith("."):
            where.append("e.type LIKE ?")
            params.append(type + "%")
        else:
            where.append("e.type = ?")
            params.append(type)
    if user:
        where.append("e.user_id = ?")
        params.append(user)
    w = (" WHERE " + " AND ".join(where)) if where else ""
    total = db.execute(f"SELECT COUNT(*) FROM events e{w}", params).fetchone()[0]
    rows = db.execute(f"{EVENT_SELECT}{w} ORDER BY e.id DESC LIMIT ? OFFSET ?", [*params, 50, (page - 1) * 50]).fetchall()
    actors = {r[0]: r[1] for r in db.execute("SELECT id, name FROM users WHERE id IN (SELECT DISTINCT actor_id FROM events WHERE actor_id IS NOT NULL)")}
    items = [{**_event_row(r), "actorName": actors.get(r["actor_id"])} for r in rows]
    types = [r[0] for r in db.execute("SELECT DISTINCT type FROM events ORDER BY 1")]
    return {"events": items, "total": total, "page": page, "pageSize": 50, "types": types}


# ---------- system ----------

@router.get("/system")
def system(admin=Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    from ..db import using_turso
    # On Turso the database isn't a file here: estimate from the server's page count.
    if using_turso():
        try:
            pages = db.execute("PRAGMA page_count").fetchone()[0]
            size = db.execute("PRAGMA page_size").fetchone()[0]
            db_bytes = int(pages) * int(size)
        except Exception:
            db_bytes = 0
    else:
        db_bytes = sum(os.path.getsize(p) for p in (str(DB_PATH), f"{DB_PATH}-wal", f"{DB_PATH}-shm") if os.path.exists(p))
    files, disk = _dir_size(UPLOAD_DIR)
    errors = [_event_row(r) for r in db.execute(f"{EVENT_SELECT} WHERE e.type = 'error' ORDER BY e.id DESC LIMIT 20")]
    err_24 = db.execute("SELECT COUNT(*) FROM events WHERE type = 'error' AND created_at >= ?", (_since(1),)).fetchone()[0]
    ai_24 = db.execute("SELECT COUNT(*), SUM(json_extract(data, '$.ok') = 0) FROM events WHERE type LIKE 'ai.%' AND created_at >= ?",
                       (_since(1),)).fetchone()
    tables = {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("users", "sessions", "projects", "publications", "uploads", "messages", "events")}
    return {
        "status": "ok",
        "uptimeSeconds": int(time.time() - STARTED),
        "versions": {"python": sys.version.split()[0], "fastapi": fastapi.__version__, "sqlite": sqlite3.sqlite_version,
                     "platform": platform.platform(terse=True)},
        "services": {
            "ai": {"configured": ai.configured(), "provider": ai.provider(), "model": ai.model(), "last24h": ai_24[0] or 0, "failed24h": ai_24[1] or 0},
            "email": {"configured": mailer.configured()},
        },
        "storage": {"databaseBytes": db_bytes, "database": "turso" if using_turso() else "sqlite file", "uploadFiles": files, "uploadBytes": disk},
        "tables": tables,
        "admins": {"count": db.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1").fetchone()[0]},
        "errors": {"last24h": err_24, "recent": errors},
    }
