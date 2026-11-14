"""Get in touch: visitors to a published portfolio send its owner a message.
Every message is kept in the owner's Dixlab inbox, and emailed to them too
when SMTP is configured. The owner's email address is never shown to visitors."""
import json
import secrets
import sqlite3
import time
from collections import defaultdict, deque

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from .. import mailer
from ..config import CONTACT_PER_10_MIN
from ..db import connect, get_db
from ..security import current_user, now_ms

router = APIRouter(tags=["messages"])

_recent: dict[tuple[str, str], deque] = defaultdict(deque)
WINDOW = 600  # seconds


def _limited(ip: str, slug: str) -> bool:
    """At most CONTACT_PER_10_MIN messages per visitor, per page, per 10 minutes."""
    now = time.monotonic()
    q = _recent[(ip, slug)]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= CONTACT_PER_10_MIN:
        return True
    q.append(now)
    return False


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
    website: str = Field(default="", max_length=200)  # honeypot: people never see or fill this


def _one_line(s: str) -> str:
    return " ".join(s.split())


def _deliver(message_id: str, to: str, owner_name: str, name: str, email: str, body: str, page: str) -> None:
    first = (owner_name or "there").split()[0]
    text = (
        f"Hi {first},\n\n{name} sent you a message from your portfolio:\n\n"
        f"{body}\n\n"
        f"Reply to this email to answer {name} at {email}.\n\n"
        f"Sent from: {page}\n— Dixlab"
    )
    if mailer.send(to, f"New message from {name} via your portfolio", text, reply_to=(name, email)):
        with connect() as db:
            db.execute("UPDATE messages SET emailed = 1 WHERE id = ?", (message_id,))


@router.post("/api/public/{slug}/contact", status_code=status.HTTP_201_CREATED)
def contact(slug: str, body: ContactIn, request: Request, background: BackgroundTasks,
            db: sqlite3.Connection = Depends(get_db)):
    pub = db.execute(
        "SELECT p.user_id, p.project_id, p.data, u.email AS account_email, u.name AS owner_name "
        "FROM publications p JOIN users u ON u.id = p.user_id WHERE p.slug = ?", (slug,),
    ).fetchone()
    if not pub or json.loads(pub["data"]).get("type") != "portfolio":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This page isn't published.")
    if body.website.strip():
        return {"ok": True}  # a bot filled the hidden field: pretend it worked, keep nothing
    if _limited(request.client.host if request.client else "?", slug):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "You've sent a few messages already. Please try again in a few minutes.")

    name, message = _one_line(body.name), body.message.strip()
    if not name or not message:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add your name and a message.")
    message_id = f"m-{secrets.token_hex(8)}"
    db.execute(
        "INSERT INTO messages (id, user_id, project_id, slug, name, email, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (message_id, pub["user_id"], pub["project_id"], slug, name, str(body.email), message, now_ms()),
    )
    db.commit()  # saved before we try to email it
    if mailer.configured():
        data = json.loads(pub["data"])
        to = (data.get("email") or "").strip() or pub["account_email"]
        page = data.get("title") or data.get("name") or "your portfolio"
        background.add_task(_deliver, message_id, to, data.get("name") or pub["owner_name"], name, str(body.email), message, page)
    return {"ok": True}


def _row(r) -> dict:
    return {"id": r["id"], "projectId": r["project_id"], "slug": r["slug"], "name": r["name"], "email": r["email"],
            "body": r["body"], "emailed": bool(r["emailed"]), "read": r["read_at"] is not None, "createdAt": r["created_at"]}


@router.get("/api/messages")
def list_messages(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 500", (user["id"],)).fetchall()
    items = [_row(r) for r in rows]
    return {"messages": items, "unread": sum(not m["read"] for m in items), "emailEnabled": mailer.configured()}


class ReadIn(BaseModel):
    read: bool = True


@router.patch("/api/messages/{message_id}")
def mark_read(message_id: str, body: ReadIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute("UPDATE messages SET read_at = ? WHERE id = ? AND user_id = ?",
                     (now_ms() if body.read else None, message_id, user["id"]))
    if not cur.rowcount:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found.")
    return {"ok": True}


@router.delete("/api/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(message_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM messages WHERE id = ? AND user_id = ?", (message_id, user["id"]))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
