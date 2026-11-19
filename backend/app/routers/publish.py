"""Publishing: turn a project into a public link you can send to a recruiter
or client. Publishing stores a snapshot, so drafts never leak; "Update"
republishes the latest version at the same link."""
import json
import re
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from .. import events, plans, safety
from ..db import get_db
from ..ratelimit import Limiter, client_ip
from ..security import current_user, now_ms, optional_user_id

router = APIRouter(tags=["publish"])

# Never part of a public page: bookkeeping and editor-only state.
PRIVATE_KEYS = {"sample", "status", "interview", "draftBackup", "updatedAt", "userId"}


def _public(project: dict) -> dict:
    return safety.clean({k: v for k, v in project.items() if k not in PRIVATE_KEYS})


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
    # Drafts can use any template (try before you buy); publishing needs a plan that includes it.
    plans.check_template(db, user["id"], str(project.get("template") or ""))
    snapshot = json.dumps(_public(project), ensure_ascii=False)
    now = now_ms()
    row = db.execute("SELECT * FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id)).fetchone()
    if not row and not user.get("email_verified", True):
        # New pages need a confirmed email: it stops throwaway accounts publishing
        # spam, and contact messages reach a real inbox. (Updates still work.)
        from .account import unverified_response
        return unverified_response()
    if row:
        db.execute("UPDATE publications SET data = ?, updated_at = ? WHERE slug = ?", (snapshot, now, row["slug"]))
        slug, views = row["slug"], row["views"]
        events.log(db, "page.updated", user["id"], slug=slug, kind=project.get("type"))
    else:
        slug, views = _slug(project), 0
        db.execute(
            "INSERT INTO publications (slug, user_id, project_id, data, views, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
            (slug, user["id"], project_id, snapshot, now, now),
        )
        events.log(db, "page.published", user["id"], slug=slug, kind=project.get("type"), template=project.get("template"))
    return {"published": True, "slug": slug, "publishedAt": now, "views": views}


@router.delete("/api/projects/{project_id}/publish", status_code=status.HTTP_204_NO_CONTENT)
def unpublish(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if db.execute("DELETE FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id)).rowcount:
        events.log(db, "page.unpublished", user["id"], project=project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# One view per visitor per page every 30 minutes, so refreshes and scripts
# don't inflate the numbers people (and the admin dashboard) rely on.
_seen = Limiter("page_view", 1, 30 * 60)


@router.get("/api/public/{slug}")
def public_page(slug: str, request: Request, db: sqlite3.Connection = Depends(get_db)):
    """No login needed. Returns only the published page content."""
    row = db.execute(
        "SELECT p.data, p.updated_at, p.user_id FROM publications p JOIN users u ON u.id = p.user_id "
        "WHERE p.slug = ? AND u.suspended_at IS NULL", (slug,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This page isn’t published.")
    owner_viewing = optional_user_id(request, db) == row["user_id"]
    if not owner_viewing and _seen.hit(f"{client_ip(request)}|{slug}"):
        db.execute("UPDATE publications SET views = views + 1 WHERE slug = ?", (slug,))
        day = time.strftime("%Y-%m-%d", time.gmtime())
        db.execute("INSERT INTO page_views_daily (slug, day, views) VALUES (?, ?, 1) "
                   "ON CONFLICT(slug, day) DO UPDATE SET views = views + 1", (slug, day))
    # Cleaned again on the way out, so pages published before a rule change are covered too.
    project = safety.clean(json.loads(row["data"]))
    # A portfolio's "Download CV" points at the owner's published CV, looked up now so it's always the latest.
    cv_slug = None
    if project.get("type") == "portfolio" and project.get("cvProjectId"):
        cv = db.execute("SELECT p.slug, p.data FROM publications p WHERE p.user_id = ? AND p.project_id = ?",
                        (row["user_id"], str(project["cvProjectId"]))).fetchone()
        if cv and json.loads(cv["data"]).get("type") == "cv":
            cv_slug = cv["slug"]
    plan = plans.plan_of(db, row["user_id"])
    # Visitors can download a CV as a PDF only when the owner's plan includes it.
    return {"project": project, "publishedAt": row["updated_at"],
            "pdf": plans.pdf_allowed(db, row["user_id"], str(project.get("type") or "")),
            "cvSlug": cv_slug,
            # Pro and Premium remove the "Made with Dixlab" footer.
            "branding": plans.PLANS[plan]["rank"] < plans.PLANS["pro"]["rank"]}
