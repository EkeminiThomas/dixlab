"""Publishing: turn a project into a public link you can send to a recruiter
or client. Publishing stores a snapshot, so drafts never leak; "Update"
republishes the latest version at the same link."""
import json
import re
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from .. import events, plans, safety
from . import reviews
from ..db import get_db
from ..ratelimit import Limiter, client_ip
from ..security import current_user, hash_password, now_ms, optional_user_id, verify_password

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
    return {"published": True, "slug": row["slug"], "publishedAt": row["updated_at"], "views": row["views"],
            "protected": bool(row["password_hash"]), "gallery": row["gallery"]}


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
    protected = bool(row and row["password_hash"])
    return {"published": True, "slug": slug, "publishedAt": now, "views": views, "protected": protected,
            "gallery": row["gallery"] if row else None}


class PasswordIn(BaseModel):
    password: str | None = Field(default=None, max_length=128)


@router.put("/api/projects/{project_id}/publish/password")
def set_page_password(project_id: str, body: PasswordIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """With the password unlock: only people with the password can open the page. None removes it."""
    row = db.execute("SELECT * FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Publish the page first.")
    password = (body.password or "").strip()
    if password:
        plans.require(db, user["id"], "password")
        if len(password) < 4:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Use at least 4 characters.")
    db.execute("UPDATE publications SET password_hash = ? WHERE slug = ?", (hash_password(password) if password else None, row["slug"]))
    if password:  # private pages leave the public gallery
        db.execute("UPDATE publications SET gallery = NULL, featured_at = NULL WHERE slug = ?", (row["slug"],))
    events.log(db, "page.protected" if password else "page.unprotected", user["id"], slug=row["slug"])
    return {**_status(row), "protected": bool(password), "gallery": None if password else row["gallery"]}


@router.delete("/api/projects/{project_id}/publish", status_code=status.HTTP_204_NO_CONTENT)
def unpublish(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if db.execute("DELETE FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id)).rowcount:
        events.log(db, "page.unpublished", user["id"], project=project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# One view per visitor per page every 30 minutes, so refreshes and scripts
# don't inflate the numbers people (and the admin dashboard) rely on.
_seen = Limiter("page_view", 1, 30 * 60)


# Password guesses: a few per visitor per page every 15 minutes.
_guesses = Limiter("page_password", 8, 15 * 60)


class UnlockIn(BaseModel):
    password: str = Field(max_length=128)


@router.get("/api/public/{slug}")
def public_page(slug: str, request: Request, db: sqlite3.Connection = Depends(get_db)):
    """No login needed. Returns only the published page content."""
    return _page(slug, request, db, None)


@router.post("/api/public/{slug}/unlock")
def unlock_page(slug: str, body: UnlockIn, request: Request, db: sqlite3.Connection = Depends(get_db)):
    """A password-protected page, opened with its password."""
    return _page(slug, request, db, body.password)


def _page(slug: str, request: Request, db: sqlite3.Connection, password: str | None):
    row = db.execute(
        "SELECT p.data, p.updated_at, p.user_id, p.project_id, p.password_hash FROM publications p JOIN users u ON u.id = p.user_id "
        "WHERE p.slug = ? AND u.suspended_at IS NULL", (slug,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This page isn’t published.")
    owner_viewing = optional_user_id(request, db) == row["user_id"]
    if row["password_hash"] and not owner_viewing:
        if password is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"code": "password_required", "message": "This page is password protected."})
        if not _guesses.hit(f"{client_ip(request)}|{slug}"):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many tries. Please wait a few minutes.")
        if not verify_password(password, row["password_hash"]):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"code": "password_wrong", "message": "That password isn’t right."})
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
    # Visitors can download a CV as a PDF only when the owner's plan includes it.
    return {"project": project, "publishedAt": row["updated_at"],
            "pdf": plans.pdf_allowed(db, row["user_id"], str(project.get("type") or "")),
            "cvSlug": cv_slug,
            "testimonials": reviews.approved_for(db, row["user_id"], row["project_id"]) if project.get("type") == "portfolio" else [],
            # The "Remove Made with Dixlab" unlock hides the footer.
            "branding": not plans.has(db, row["user_id"], "branding")}


# ---------------------------------------------------------------- the public gallery (/gallery)

class GalleryIn(BaseModel):
    listed: bool


@router.put("/api/projects/{project_id}/publish/gallery")
def ask_for_gallery(project_id: str, body: GalleryIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Ask for the page to appear in the Dixlab gallery (an admin reviews it first), or take it out."""
    row = db.execute("SELECT * FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Publish the page first.")
    if body.listed and row["password_hash"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password-protected pages can’t be in the gallery.")
    if body.listed:
        new = row["gallery"] if row["gallery"] in ("requested", "featured") else "requested"
    else:
        new = None
    db.execute("UPDATE publications SET gallery = ?, featured_at = CASE WHEN ? IS NULL THEN NULL ELSE featured_at END WHERE slug = ?",
               (new, new, row["slug"]))
    if new != row["gallery"]:
        events.log(db, "gallery.requested" if new else "gallery.left", user["id"], slug=row["slug"])
    return {**_status(row), "gallery": new}


def _cover(project: dict) -> str:
    cover = project.get("cover") if isinstance(project.get("cover"), dict) else {}
    src = cover.get("src") if cover.get("type", "image") == "image" else ""
    for v in (src, project.get("photo")):
        v = safety.safe_media(str(v or ""))
        if v and not v.startswith("data:"):
            return v
    return ""


@router.get("/api/gallery")
def gallery(kind: str = "all", db: sqlite3.Connection = Depends(get_db)):
    """Featured pages, chosen by the Dixlab team. No login needed."""
    params: list = []
    where = "p.gallery = 'featured' AND p.password_hash IS NULL AND u.suspended_at IS NULL"
    if kind in ("portfolio", "cv", "case"):
        where += " AND json_extract(p.data, '$.type') = ?"
        params.append(kind)
    rows = db.execute(f"SELECT p.slug, p.data FROM publications p JOIN users u ON u.id = p.user_id WHERE {where} "
                      "ORDER BY p.featured_at DESC LIMIT 60", params).fetchall()
    out = []
    for r in rows:
        d = safety.clean(json.loads(r["data"]))
        out.append({"slug": r["slug"], "type": d.get("type"), "template": d.get("template"),
                    "title": (d.get("title") or d.get("name") or "").strip()[:120], "name": (d.get("name") or "").strip()[:80],
                    "role": (d.get("role") or "").strip()[:80],
                    "summary": " ".join(str(d.get("tagline") or d.get("problem") or d.get("notes") or "").split())[:160],
                    "image": _cover(d)})
    return {"pages": out}
