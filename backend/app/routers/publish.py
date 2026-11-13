"""Publishing: turn a project into a public link you can send to a recruiter
or client. Publishing stores a snapshot, so drafts never leak; "Update"
republishes the latest version at the same link."""
import json
import re
import secrets
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..db import get_db
from ..security import current_user, now_ms

router = APIRouter(tags=["publish"])

# Never part of a public page: bookkeeping and editor-only state.
PRIVATE_KEYS = {"sample", "status", "interview", "draftBackup", "updatedAt", "userId"}


def _public(project: dict) -> dict:
    return {k: v for k, v in project.items() if k not in PRIVATE_KEYS}


def _slug(project: dict) -> str:
    """Short, unguessable link, prefixed with a readable bit of the title."""
    words = re.sub(r"[^a-z0-9]+", "-", (project.get("title") or project.get("name") or project.get("type", "work")).lower()).strip("-")
    return f"{words[:40].rstrip('-') or 'work'}-{secrets.token_hex(5)}"


def _status(row) -> dict:
    return {"published": True, "slug": row["slug"], "publishedAt": row["updated_at"], "views": row["views"]}


@router.get("/api/projects/{project_id}/publish")
def publish_status(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id)).fetchone()
    return _status(row) if row else {"published": False}


@router.post("/api/projects/{project_id}/publish")
def publish(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    proj = db.execute("SELECT data FROM projects WHERE user_id = ? AND id = ?", (user["id"], project_id)).fetchone()
    if not proj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Save the project first, then publish it.")
    project = json.loads(proj["data"])
    snapshot = json.dumps(_public(project), ensure_ascii=False)
    now = now_ms()
    row = db.execute("SELECT * FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id)).fetchone()
    if row:
        db.execute("UPDATE publications SET data = ?, updated_at = ? WHERE slug = ?", (snapshot, now, row["slug"]))
        slug, views = row["slug"], row["views"]
    else:
        slug, views = _slug(project), 0
        db.execute(
            "INSERT INTO publications (slug, user_id, project_id, data, views, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
            (slug, user["id"], project_id, snapshot, now, now),
        )
    return {"published": True, "slug": slug, "publishedAt": now, "views": views}


@router.delete("/api/projects/{project_id}/publish", status_code=status.HTTP_204_NO_CONTENT)
def unpublish(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/public/{slug}")
def public_page(slug: str, db: sqlite3.Connection = Depends(get_db)):
    """No login needed. Returns only the published page content."""
    row = db.execute("SELECT data, updated_at FROM publications WHERE slug = ?", (slug,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This page isn’t published.")
    db.execute("UPDATE publications SET views = views + 1 WHERE slug = ?", (slug,))
    return {"project": json.loads(row["data"]), "publishedAt": row["updated_at"]}
