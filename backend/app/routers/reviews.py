"""Other people helping: testimonials and feedback.

* Testimonials: the owner shares a link; a colleague or client writes a short
  recommendation. Nothing appears on the portfolio until the owner approves it.
* Feedback: the owner shares a link to a draft (even one that isn't published);
  reviewers read it and leave comments only the owner sees.

Links are long random tokens. Turning a link off (or getting a new one) stops
the old one working straight away."""
import json
import secrets
import sqlite3

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from .. import config, events, mailer, safety
from ..db import connect, get_db
from ..ratelimit import Limiter, client_ip
from ..security import current_user, now_ms

router = APIRouter(tags=["reviews"])

KINDS = ("testimonial", "feedback")
STATUSES = ("pending", "approved", "hidden")
MAX_PENDING = 50            # per project, so a leaked link can't flood the inbox
_submit = Limiter("invite_submit", 5, 60 * 60)   # per visitor per link, per hour
_look = Limiter("invite_look", 60, 60 * 60)      # page loads per visitor per hour
PRIVATE = {"sample", "status", "interview", "draftBackup", "updatedAt", "userId"}


def _one_line(s: str) -> str:
    return " ".join(str(s or "").split())


def _project(db, user_id: str, project_id: str) -> dict:
    row = db.execute("SELECT data FROM projects WHERE user_id = ? AND id = ?", (user_id, project_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Save the project first.")
    return json.loads(row["data"])


def _link(kind: str, token: str) -> str:
    return f"{config.PUBLIC_URL}/{'recommend' if kind == 'testimonial' else 'review'}/{token}"


# ---------------------------------------------------------------- owner: links

@router.get("/api/projects/{project_id}/invites/{kind}")
def get_invite(project_id: str, kind: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if kind not in KINDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown link.")
    row = db.execute("SELECT token FROM invites WHERE user_id = ? AND project_id = ? AND kind = ?",
                     (user["id"], project_id, kind)).fetchone()
    return {"active": True, "token": row["token"], "url": _link(kind, row["token"])} if row else {"active": False}


@router.post("/api/projects/{project_id}/invites/{kind}")
def make_invite(project_id: str, kind: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Returns the project's link of this kind, creating one if needed."""
    if kind not in KINDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown link.")
    _project(db, user["id"], project_id)
    if not user.get("email_verified", True):
        from .account import unverified_response
        return unverified_response()
    row = db.execute("SELECT token FROM invites WHERE user_id = ? AND project_id = ? AND kind = ?",
                     (user["id"], project_id, kind)).fetchone()
    token = row["token"] if row else secrets.token_urlsafe(18)
    if not row:
        db.execute("INSERT INTO invites (token, kind, user_id, project_id, created_at) VALUES (?, ?, ?, ?, ?)",
                   (token, kind, user["id"], project_id, now_ms()))
        events.log(db, f"invite.{kind}", user["id"], project=project_id)
    return {"active": True, "token": token, "url": _link(kind, token)}


@router.delete("/api/projects/{project_id}/invites/{kind}", status_code=204)
def stop_invite(project_id: str, kind: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM invites WHERE user_id = ? AND project_id = ? AND kind = ?", (user["id"], project_id, kind))
    return Response(status_code=204)


# ---------------------------------------------------------------- visitors

def _invite(db, token: str, request: Request):
    if not _look.hit(client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please try again later.")
    row = db.execute(
        "SELECT i.*, u.name AS owner_name, p.data FROM invites i JOIN users u ON u.id = i.user_id "
        "JOIN projects p ON p.user_id = i.user_id AND p.id = i.project_id "
        "WHERE i.token = ? AND u.suspended_at IS NULL", (token,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link isn’t active. Ask for a new one.")
    return row


@router.get("/api/invites/{token}")
def open_invite(token: str, request: Request, db: sqlite3.Connection = Depends(get_db)):
    row = _invite(db, token, request)
    project = json.loads(row["data"])
    owner = _one_line(project.get("name") or row["owner_name"]) or "Someone"
    out = {"kind": row["kind"], "owner": owner, "type": project.get("type"),
           "title": _one_line(project.get("title") or project.get("name") or "")}
    if row["kind"] == "feedback":
        # The draft as it is now, cleaned like a public page (it's being shown to someone else).
        out["project"] = safety.clean({k: v for k, v in project.items() if k not in PRIVATE})
    return out


class TestimonialIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="", max_length=80)
    company: str = Field(default="", max_length=80)
    relation: str = Field(default="", max_length=120)
    body: str = Field(min_length=20, max_length=1200)
    website: str = Field(default="", max_length=200)  # honeypot


class FeedbackIn(BaseModel):
    name: str = Field(default="", max_length=80)
    section: str = Field(default="", max_length=80)
    body: str = Field(min_length=2, max_length=3000)
    website: str = Field(default="", max_length=200)  # honeypot


def _notify(user_id: str, subject: str, text: str) -> None:
    with connect() as db:
        u = db.execute("SELECT email, name FROM users WHERE id = ?", (user_id,)).fetchone()
    if u:
        first = (u["name"] or "there").split()[0]
        mailer.send(u["email"], subject, f"Hi {first},\n\n{text}\n\n— Dixlab\nQuestions? Write to {config.CONTACT_EMAIL}")


def _guard_submit(db, row, request: Request, table: str):
    if row["kind"] != table.rstrip("s"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link isn’t active. Ask for a new one.")
    if not _submit.hit(f"{client_ip(request)}|{row['token']}"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "You’ve sent a few already. Please try again later.")
    waiting = db.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = ? AND project_id = ? AND "
                         + ("status = 'pending'" if table == "testimonials" else "resolved_at IS NULL"),
                         (row["user_id"], row["project_id"])).fetchone()[0]
    if waiting >= MAX_PENDING:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "This inbox is full right now. Please try again later.")


@router.post("/api/invites/{token}/testimonial", status_code=201)
def send_testimonial(token: str, body: TestimonialIn, request: Request, background: BackgroundTasks,
                     db: sqlite3.Connection = Depends(get_db)):
    row = _invite(db, token, request)
    if body.website.strip():
        return {"ok": True}
    _guard_submit(db, row, request, "testimonials")
    name, text = _one_line(body.name), body.body.strip()
    if not name or len(text) < 20:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add your name and a few sentences.")
    db.execute("INSERT INTO testimonials (id, user_id, project_id, name, role, company, relation, body, status, created_at) "
               "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
               (f"t-{secrets.token_hex(8)}", row["user_id"], row["project_id"], name, _one_line(body.role),
                _one_line(body.company), _one_line(body.relation), text, now_ms()))
    events.log(db, "testimonial.received", row["user_id"], project=row["project_id"])
    db.commit()
    if mailer.configured():
        background.add_task(_notify, row["user_id"], f"{name} wrote you a testimonial",
                            f"{name} wrote a testimonial for your portfolio. It stays hidden until you approve it:\n"
                            f"{config.PUBLIC_URL}/editor/{row['project_id']}")
    return {"ok": True}


@router.post("/api/invites/{token}/feedback", status_code=201)
def send_feedback(token: str, body: FeedbackIn, request: Request, background: BackgroundTasks,
                  db: sqlite3.Connection = Depends(get_db)):
    row = _invite(db, token, request)
    if body.website.strip():
        return {"ok": True}
    _guard_submit(db, row, request, "feedback")
    text = body.body.strip()
    if len(text) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Write a comment first.")
    name = _one_line(body.name) or "Anonymous"
    db.execute("INSERT INTO feedback (id, user_id, project_id, name, section, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
               (f"f-{secrets.token_hex(8)}", row["user_id"], row["project_id"], name, _one_line(body.section), text, now_ms()))
    events.log(db, "feedback.received", row["user_id"], project=row["project_id"])
    db.commit()
    if mailer.configured():
        background.add_task(_notify, row["user_id"], f"New feedback from {name}",
                            f"{name} left feedback on your draft:\n\n{text[:600]}\n\nSee all comments: {config.PUBLIC_URL}/editor/{row['project_id']}")
    return {"ok": True}


# ---------------------------------------------------------------- owner: inbox

def _testimonial(r) -> dict:
    return {"id": r["id"], "name": r["name"], "role": r["role"], "company": r["company"], "relation": r["relation"],
            "body": r["body"], "status": r["status"], "createdAt": r["created_at"]}


@router.get("/api/projects/{project_id}/testimonials")
def list_testimonials(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT * FROM testimonials WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC",
                      (user["id"], project_id))
    return {"testimonials": [_testimonial(r) for r in rows]}


class StatusIn(BaseModel):
    status: str


@router.patch("/api/testimonials/{tid}")
def set_testimonial(tid: str, body: StatusIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if body.status not in STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown status.")
    if not db.execute("UPDATE testimonials SET status = ? WHERE id = ? AND user_id = ?", (body.status, tid, user["id"])).rowcount:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    return _testimonial(db.execute("SELECT * FROM testimonials WHERE id = ?", (tid,)).fetchone())


@router.delete("/api/testimonials/{tid}", status_code=204)
def delete_testimonial(tid: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM testimonials WHERE id = ? AND user_id = ?", (tid, user["id"]))
    return Response(status_code=204)


def _comment(r) -> dict:
    return {"id": r["id"], "name": r["name"], "section": r["section"], "body": r["body"],
            "createdAt": r["created_at"], "resolved": bool(r["resolved_at"])}


@router.get("/api/projects/{project_id}/feedback")
def list_feedback(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT * FROM feedback WHERE user_id = ? AND project_id = ? ORDER BY resolved_at IS NOT NULL, created_at DESC",
                      (user["id"], project_id))
    return {"feedback": [_comment(r) for r in rows]}


class ResolveIn(BaseModel):
    resolved: bool


@router.patch("/api/feedback/{fid}")
def resolve_feedback(fid: str, body: ResolveIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("UPDATE feedback SET resolved_at = ? WHERE id = ? AND user_id = ?",
                      (now_ms() if body.resolved else None, fid, user["id"])).rowcount:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    return _comment(db.execute("SELECT * FROM feedback WHERE id = ?", (fid,)).fetchone())


@router.delete("/api/feedback/{fid}", status_code=204)
def delete_feedback(fid: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM feedback WHERE id = ? AND user_id = ?", (fid, user["id"]))
    return Response(status_code=204)


def approved_for(db, user_id: str, project_id: str) -> list[dict]:
    """What a published page shows: approved testimonials only, newest first, nothing private."""
    rows = db.execute("SELECT * FROM testimonials WHERE user_id = ? AND project_id = ? AND status = 'approved' "
                      "ORDER BY created_at DESC LIMIT 12", (user_id, project_id))
    return [{"name": r["name"], "role": r["role"], "company": r["company"], "relation": r["relation"], "body": r["body"]} for r in rows]
