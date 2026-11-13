"""Portfolios, CVs and case studies. A project is stored as the JSON the
frontend editor works with; the server only checks its shape and size."""
import json
import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from ..config import MAX_PROJECT_BYTES, UPLOAD_DIR
from ..db import get_db
from ..security import current_user, now_ms

router = APIRouter(prefix="/api/projects", tags=["projects"])

ID_RE = r"^[A-Za-z0-9_-]{1,64}$"
UPLOAD_RE = re.compile(r"/uploads/([a-f0-9]{32}\.(?:jpg|png|webp|gif|mp4|webm|mov|pdf|docx|pptx|xlsx))")


class ProjectIn(BaseModel):
    """Any editor fields are accepted; these few are required."""
    model_config = ConfigDict(extra="allow")
    id: str = Field(pattern=ID_RE)
    type: str = Field(pattern=r"^(portfolio|cv|case)$")
    template: str = Field(min_length=1, max_length=40)
    updatedAt: int | None = None


def _row_to_project(row) -> dict:
    return json.loads(row["data"])


@router.get("")
def list_projects(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT data FROM projects WHERE user_id = ? ORDER BY updated_at DESC", (user["id"],)
    ).fetchall()
    return {"projects": [_row_to_project(r) for r in rows]}


@router.get("/{project_id}")
def get_project(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT data FROM projects WHERE user_id = ? AND id = ?", (user["id"], project_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return {"project": _row_to_project(row)}


@router.put("/{project_id}")
def save_project(project_id: str, body: ProjectIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Create or replace a project (the editor autosaves through this)."""
    if body.id != project_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project id doesn’t match the URL.")
    project = body.model_dump()
    project["updatedAt"] = body.updatedAt or now_ms()
    data = json.dumps(project, ensure_ascii=False)
    if len(data.encode()) > MAX_PROJECT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "This project is too large to save. Try removing some images.")
    db.execute(
        """INSERT INTO projects (user_id, id, type, data, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, id) DO UPDATE SET type = excluded.type, data = excluded.data, updated_at = excluded.updated_at""",
        (user["id"], project_id, body.type, data, project["updatedAt"]),
    )
    return {"project": project}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT data FROM projects WHERE user_id = ? AND id = ?", (user["id"], project_id)).fetchone()
    if not row:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.execute("DELETE FROM projects WHERE user_id = ? AND id = ?", (user["id"], project_id))
    db.execute("DELETE FROM publications WHERE user_id = ? AND project_id = ?", (user["id"], project_id))
    # Remove images this project used, unless another of the user's projects still uses them.
    others = " ".join(r["data"] for r in db.execute(
        "SELECT data FROM projects WHERE user_id = ? UNION ALL SELECT data FROM publications WHERE user_id = ?",
        (user["id"], user["id"])))
    for name in set(UPLOAD_RE.findall(row["data"])):
        if f"/uploads/{name}" in others:
            continue
        if db.execute("DELETE FROM uploads WHERE name = ? AND user_id = ?", (name, user["id"])).rowcount:
            (UPLOAD_DIR / name).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
