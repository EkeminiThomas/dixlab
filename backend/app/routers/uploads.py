"""Uploads: images and videos (portfolio projects, case study materials) and
documents (case study attachments: PDF, Word, PowerPoint, Excel). Files are
recognised by their contents, not the browser's claim, and streamed to disk
with a size cap."""
import re
import secrets
import sqlite3
import zipfile

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from ..config import MAX_FILE_BYTES, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, UPLOAD_DIR
from ..db import get_db
from ..security import current_user, now_ms

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

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


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload(file: UploadFile = File(...), user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    unsupported = "Upload an image (JPG, PNG, WebP, GIF), a video (MP4, WebM, MOV) or a document (PDF, Word, PowerPoint, Excel)."
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
                out.write(chunk)
        if ext == "zip":  # only Word, PowerPoint and Excel files are accepted
            office = _office_kind(path)
            if not office:
                raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, unsupported)
            ext, ctype = office
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    name = f"{token}.{ext}"
    path.rename(UPLOAD_DIR / name)
    db.execute(
        "INSERT INTO uploads (name, user_id, content_type, size, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, user["id"], ctype, size, now_ms()),
    )
    return {"url": f"/uploads/{name}", "name": name, "size": size, "contentType": ctype, "type": media,
            "filename": _clean_name(file.filename)}


@router.delete("/{name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_upload(name: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if db.execute("DELETE FROM uploads WHERE name = ? AND user_id = ?", (name, user["id"])).rowcount:
        (UPLOAD_DIR / name).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
