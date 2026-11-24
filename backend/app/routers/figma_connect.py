"""Connect Figma, and the file picker: turn pasted Figma links into a list of files (name,
when it was edited, a small thumbnail) so people tick the ones to use."""
import base64
import sqlite3
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field, field_validator

from .. import ai, config, events, figma, figma_auth, figma_portfolio, profile_projects, project_images, webread
from ..db import get_db
from ..security import current_user, optional_user_id

router = APIRouter(prefix="/api/figma", tags=["figma"])
MAX_PICKER_FILES = 12
THUMB_BYTES = 700 * 1024


@router.get("/status")
def figma_status(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    return figma_auth.status(db, user["id"])


class ConnectIn(BaseModel):
    returnTo: str = Field(default="/dashboard", max_length=300)


@router.post("/connect")
def figma_connect(body: ConnectIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if not figma_auth.available():
        return ai.error(503, "Connecting Figma isn’t set up on this server yet. Paste a Figma access token instead.")
    return {"url": figma_auth.start(db, user["id"], body.returnTo)}


def _back(path: str, **params) -> RedirectResponse:
    query = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
    sep = "&" if "?" in path else "?"
    return RedirectResponse(f"{config.PUBLIC_URL}{path}{sep}{query}", status_code=303)


@router.get("/callback", include_in_schema=False)
def figma_callback(request: Request, code: str = Query("", max_length=600), state: str = Query("", max_length=100),
                   error: str = Query("", max_length=100), db: sqlite3.Connection = Depends(get_db)):
    """Where Figma sends people back. They must still be signed in to Dixlab (same browser)."""
    user_id = optional_user_id(request, db)
    if not user_id:
        return _back("/login", figma="signin")
    row = db.execute("SELECT return_to FROM figma_oauth_states WHERE state = ? AND user_id = ?", (state, user_id)).fetchone()
    back = row["return_to"] if row else "/dashboard"
    if error or not code:
        db.execute("DELETE FROM figma_oauth_states WHERE state = ?", (state,))
        return _back(back, figma="cancelled")
    try:
        back = figma_auth.finish(db, user_id, state, code)
    except figma_auth.ConnectError as e:
        return _back(back, figma="error", message=str(e))
    events.log(db, "figma.connected", user_id)
    return _back(back, figma="connected")


@router.delete("/connection", status_code=204)
def figma_disconnect(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    figma_auth.disconnect(db, user["id"])
    events.log(db, "figma.disconnected", user["id"])
    return Response(status_code=204)


class FilesIn(BaseModel):
    urls: list[str] = Field(default_factory=list, max_length=20)
    figmaToken: str = Field(default="", max_length=200)  # this request only, never stored

    @field_validator("urls")
    @classmethod
    def _urls(cls, v: list[str]) -> list[str]:
        out = []
        for u in v:
            u = str(u).strip()[:500]
            if u and not u.lower().startswith(("http://", "https://")):
                u = "https://" + u
            if u and figma_portfolio.is_figma(u) and u not in out:
                out.append(u)
        return out


def _thumb(url: str, client) -> str:
    """A small thumbnail as a data: URL (Dixlab pages only load their own images)."""
    if not url:
        return ""
    got = project_images.download(url, client, min_width=64)
    if not got or len(got[0]) > THUMB_BYTES:
        return ""
    return f"data:{got[2]};base64,{base64.b64encode(got[0]).decode()}"


@router.post("/files")
def figma_files(body: FilesIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """The files behind pasted Figma links (file, project or team links), for the picker. Free.
    Profile links are noted, not listed: Figma doesn't share a profile's files with apps."""
    from concurrent.futures import ThreadPoolExecutor
    if ai.rate_limited(user["id"]):
        return ai.error(429, "Too many requests. Try again in a moment.")
    own = figma_auth.pick(db, user["id"], body.figmaToken)
    if not figma.token_for(own):
        return ai.error(422, "Connect Figma (or paste a Figma access token) to see your files.")
    files, notes, profile = [], [], None
    for url in body.urls:
        if figma_portfolio.PROFILE.match(url):
            if figma_portfolio.READ_PROFILES:
                profile = url
            continue  # profile links are skipped for now (see figma_portfolio.READ_PROFILES)
        parsed = figma.parse_url(url)
        try:
            if parsed:
                meta = figma._get(f"/files/{parsed[1]}", figma.token_for(own), {"depth": 1})
                files.append({"link": url.split("?")[0], "name": str(meta.get("name") or "Figma file")[:120],
                              "edited": str(meta.get("lastModified") or "")[:10], "thumbUrl": meta.get("thumbnailUrl") or ""})
            else:
                for p in profile_projects.projects(url, own)["projects"]:
                    files.append({"link": p["links"][0], "name": p["title"], "edited": (p["meta"] or [""])[0].removeprefix("edited "),
                                  "thumbUrl": p.get("thumb", "")})
        except (figma.FigmaError, webread.Unreadable) as e:
            msg = str(e)
            if not parsed and ("403" in msg or "let us open" in msg):
                msg = "Figma only lets apps list a team’s files with a personal access token that has “Projects: read”. Paste the files’ links instead."
            notes.append({"url": url, "message": msg})
    seen, unique = set(), []
    for f in files:
        k = (figma.parse_url(f["link"]) or (None, f["link"]))[1]
        if k not in seen:
            seen.add(k); unique.append(f)
    unique = unique[:MAX_PICKER_FILES]
    with webread.client(project_images.TIMEOUT) as client, ThreadPoolExecutor(max_workers=4) as pool:
        thumbs = list(pool.map(lambda f: _thumb(f.pop("thumbUrl", ""), client), unique))
    for f, t in zip(unique, thumbs):
        f["thumb"] = t
    return {"files": unique, "notes": notes, "profile": profile}
