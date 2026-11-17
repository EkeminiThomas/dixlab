"""Uploads: images and videos (portfolio projects, case study materials) and
documents (case study attachments: PDF, Word, PowerPoint, Excel). Files are
recognised by their contents, not the browser's claim, and streamed to disk
with a size cap."""
import re
import secrets
import sqlite3
import zipfile

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse

from ..config import MAX_FILE_BYTES, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, UPLOAD_DIR
from .. import config, events, plans, scan
from ..db import get_db
from ..security import current_user, now_ms

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
files = APIRouter(tags=["uploads"])  # serving: GET /uploads/<name>

CHUNK = 1024 * 1024
IMAGE_SIGNATURES = [
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"GIF87a", "gif", "image/gif"),
    (b"GIF89a", "gif", "image/gif"),
]


# Office documents are zip files; the part inside tells them apart.
OFFICE = {
    "docx": ("word/", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "pptx": ("ppt/", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    "xlsx": ("xl/", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
}
LIMITS = {"image": MAX_UPLOAD_BYTES, "video": MAX_VIDEO_BYTES, "file": MAX_FILE_BYTES}
LABELS = {"image": "Images", "video": "Videos", "file": "Files"}


def _office_kind(path) -> tuple[str, str] | None:
    """Which Office format a zip on disk is, from its contents."""
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
    except zipfile.BadZipFile:
        return None
    if "[Content_Types].xml" not in names:
        return None
    for ext, (folder, ctype) in OFFICE.items():
        if any(n.startswith(folder) for n in names):
            return ext, ctype
    return None


def _clean_name(name: str | None) -> str:
    """A display name for the original file: no paths, no control characters."""
    base = re.split(r"[\\/]", name or "")[-1]
    base = re.sub(r"[\x00-\x1f<>:\"|?*]+", "", base).strip(" .")
    return base[:120] or "file"


def _sniff(head: bytes) -> tuple[str, str, str] | None:
    """Return (kind, extension, content type) for a supported file."""
    for sig, ext, ctype in IMAGE_SIGNATURES:
        if head.startswith(sig):
            return "image", ext, ctype
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", "webp", "image/webp"
    if head[4:8] == b"ftyp":  # ISO media: MP4, M4V, MOV
        brand = head[8:12]
        if brand == b"qt  ":
            return "video", "mov", "video/quicktime"
        return "video", "mp4", "video/mp4"
    if head[:4] == b"\x1a\x45\xdf\xa3":  # Matroska / WebM
        return "video", "webm", "video/webm"
    if head.startswith(b"%PDF-"):
        return "file", "pdf", "application/pdf"
    if head.startswith(b"PK\x03\x04"):  # zip: checked further once saved
        return "file", "zip", "application/zip"
    return None


def _mb(n: int) -> str:
    return f"{n / 1048576:.0f} MB" if n < 1073741824 else f"{n / 1073741824:.1f} GB"


def _used(db, user_id: str) -> int:
    return db.execute("SELECT COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ?", (user_id,)).fetchone()[0]


def _free_unused(db, user_id: str) -> int:
    """Delete this user's uploads that none of their projects or pages use any
    more (older than an hour, so nothing mid-edit). Returns bytes freed."""
    from .projects import UPLOAD_RE  # local import avoids a cycle
    used = set()
    for (data,) in db.execute("SELECT data FROM projects WHERE user_id = ? UNION ALL SELECT data FROM publications WHERE user_id = ?",
                              (user_id, user_id)):
        used.update(UPLOAD_RE.findall(data))
    cutoff = now_ms() - 3600_000
    freed = 0
    for r in db.execute("SELECT name, size FROM uploads WHERE user_id = ? AND created_at < ?", (user_id, cutoff)).fetchall():
        if r["name"] not in used:
            db.execute("DELETE FROM uploads WHERE name = ?", (r["name"],))
            (UPLOAD_DIR / r["name"]).unlink(missing_ok=True)
            freed += r["size"]
    return freed


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload(file: UploadFile = File(...), user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    unsupported = "Upload an image (JPG, PNG, WebP, GIF), a video (MP4, WebM, MOV) or a document (PDF, Word, PowerPoint, Excel)."
    cap = plans.storage_limit(db, user["id"])  # depends on the plan (Free 100 MB, Pro 2 GB, Premium 10 GB)
    room = cap - _used(db, user["id"])
    if room < MAX_VIDEO_BYTES and _free_unused(db, user["id"]):  # nearly full: first clear out files nothing uses
        db.commit()
        room = cap - _used(db, user["id"])
    upgrade = " Or upgrade your plan for more space." if config.PLAN_LIMITS and plans.plan_of(db, user["id"]) != "premium" else ""
    full = (f"Your storage is full ({_mb(cap)}). Remove images or videos you no longer need "
            f"from your projects, or delete a project, then try again.{upgrade}")
    if room <= 0:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, full)
    head = await file.read(16)
    kind = _sniff(head)
    if not kind:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, unsupported)
    media, ext, ctype = kind
    limit = LIMITS[media]
    token = secrets.token_hex(16)
    path = UPLOAD_DIR / f"{token}.part"
    size = len(head)
    try:
        with path.open("wb") as out:
            out.write(head)
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                        f"{LABELS[media]} must be {limit // (1024 * 1024)} MB or smaller.")
                if size > room:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, full)
                out.write(chunk)
        if ext == "zip":  # only Word, PowerPoint and Excel files are accepted
            office = _office_kind(path)
            if not office:
                raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, unsupported)
            ext, ctype = office
        try:
            scan.check(path, ext)  # active content in PDFs/Office files, and ClamAV when configured
        except scan.Rejected as e:
            events.log(db, "upload.rejected", user["id"], ext=ext, reason=str(e)[:80])
            db.commit()
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from None
        except scan.ScannerUnavailable:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                                "We couldn’t scan this file for viruses right now, so it wasn’t uploaded. Please try again shortly.") from None
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    name = f"{token}.{ext}"
    path.rename(UPLOAD_DIR / name)
    db.execute(
        "INSERT INTO uploads (name, user_id, content_type, size, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, user["id"], ctype, size, now_ms()),
    )
    events.log(db, "upload.created", user["id"], kind=media, ext=ext, size=size)
    return {"url": f"/uploads/{name}", "name": name, "size": size, "contentType": ctype, "type": media,
            "filename": _clean_name(file.filename)}


@router.delete("/{name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_upload(name: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if db.execute("DELETE FROM uploads WHERE name = ? AND user_id = ?", (name, user["id"])).rowcount:
        (UPLOAD_DIR / name).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


NAME_RE = re.compile(r"^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm|mov|pdf|docx|pptx|xlsx)$")


@files.api_route("/uploads/{name}", methods=["GET", "HEAD"], include_in_schema=False)
def serve(name: str, db: sqlite3.Connection = Depends(get_db)):
    """Uploaded files, served with their stored type. Files belonging to a
    suspended account (or not in the uploads table) aren't served."""
    if not NAME_RE.match(name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    row = db.execute("SELECT up.content_type FROM uploads up JOIN users u ON u.id = up.user_id "
                     "WHERE up.name = ? AND u.suspended_at IS NULL", (name,)).fetchone()
    path = UPLOAD_DIR / name
    if not row or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    return FileResponse(path, media_type=row["content_type"], headers={"Cache-Control": "private, max-age=3600"})
