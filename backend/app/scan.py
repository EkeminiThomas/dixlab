"""Deeper checks on uploaded documents, after their type is known.

- PDFs with active content (JavaScript, launch actions, embedded files, forms
  that submit data) are refused. A portfolio PDF never needs them, and they're
  how malicious PDFs work. Compressed streams are unpacked and checked too.
- Office files (docx/pptx/xlsx) with macros or ActiveX, remote templates or
  external OLE objects (a common way to make Word fetch an attack), and
  "zip bombs" that unpack to gigabytes are refused.
- With DIXLAB_CLAMAV set, every upload is also scanned by a ClamAV daemon."""
import re
import socket
import struct
import zipfile
import zlib
from pathlib import Path

from .config import CLAMAV


class Rejected(Exception):
    """The file isn't safe to store; the message is shown to the uploader."""


class ScannerUnavailable(Exception):
    pass


# ---------- PDF ----------

# Names in a PDF can be written with #xx escapes ("/J#61vaScript"); undo them first.
_HEX_ESCAPE = re.compile(rb"#([0-9A-Fa-f]{2})")
_ACTIVE = re.compile(rb"/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|SubmitForm|ImportData|GoToE|XFA)(?![A-Za-z])")
_STREAM = re.compile(rb"stream\r?\n(.*?)endstream", re.S)
MAX_INFLATED = 200 * 1024 * 1024  # stop unpacking past this: no decompression bombs


def _active_in(data: bytes) -> bytes | None:
    m = _ACTIVE.search(_HEX_ESCAPE.sub(lambda h: bytes([int(h.group(1), 16)]), data))
    return m.group(1) if m else None


def check_pdf(path: Path) -> None:
    data = path.read_bytes()
    found = _active_in(data)
    budget = MAX_INFLATED
    if not found:
        # Object streams (PDF 1.5+) keep dictionaries compressed, so look inside.
        for m in _STREAM.finditer(data):
            d = zlib.decompressobj()
            try:
                inner = d.decompress(m.group(1), budget)
            except zlib.error:
                continue  # not Flate (an image, say): nothing to read
            budget -= len(inner)
            if budget <= 0:
                raise Rejected("This PDF couldn’t be checked (it unpacks to far too much data). Try saving it again or exporting a smaller copy.")
            found = _active_in(inner)
            if found:
                break
    if found:
        raise Rejected("This PDF contains scripts or other active content (" + found.decode() + "), so it can’t be uploaded. "
                       "Export or print it to a new PDF and try again.")


# ---------- Office ----------

MAX_ENTRIES = 5000
MAX_UNPACKED = 500 * 1024 * 1024
_DANGEROUS_PARTS = re.compile(r"(^|/)(vbaProject\.bin|vbaData\.xml|activeX/|.*\.(exe|dll|bat|cmd|com|scr|js|vbs|ps1|hta|msi|jar)$)", re.I)
_EXTERNAL_REL = re.compile(rb'<Relationship\b[^>]*>', re.I)
_RISKY_TYPES = (b"attachedTemplate", b"oleObject", b"frame", b"subDocument", b"package")


def check_office(path: Path) -> None:
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if len(infos) > MAX_ENTRIES or sum(i.file_size for i in infos) > MAX_UNPACKED:
            raise Rejected("This document unpacks to far too much data to be a normal file, so it can’t be uploaded.")
        for info in infos:
            if _DANGEROUS_PARTS.search(info.filename):
                raise Rejected("This document contains macros or embedded programs, so it can’t be uploaded. "
                               "Save a copy without macros (as .docx, .pptx or .xlsx) and try again.")
        for info in infos:
            if not info.filename.endswith(".rels"):
                continue
            for rel in _EXTERNAL_REL.findall(z.read(info)):
                if b'TargetMode="External"' in rel and any(t in rel for t in _RISKY_TYPES):
                    raise Rejected("This document loads content from the internet when opened (a remote template or "
                                   "linked object), so it can’t be uploaded. Remove the link and try again.")


# ---------- ClamAV ----------

def _clamd_address() -> tuple[str, int]:
    host, _, port = CLAMAV.rpartition(":")
    return (host or "127.0.0.1"), int(port or 3310)


def clamav_scan(path: Path) -> None:
    """Stream the file to clamd (INSTREAM). Raises Rejected if infected,
    ScannerUnavailable if clamd can't be reached or answers oddly."""
    if not CLAMAV:
        return
    try:
        with socket.create_connection(_clamd_address(), timeout=30) as s, path.open("rb") as f:
            s.sendall(b"zINSTREAM\0")
            while chunk := f.read(64 * 1024):
                s.sendall(struct.pack(">I", len(chunk)) + chunk)
            s.sendall(struct.pack(">I", 0))
            reply = b""
            while not reply.endswith(b"\0"):
                part = s.recv(4096)
                if not part:
                    break
                reply += part
    except OSError as e:
        raise ScannerUnavailable(str(e)) from e
    text = reply.rstrip(b"\0").decode("utf-8", "replace")
    if text.endswith("OK"):
        return
    if text.endswith("FOUND"):
        raise Rejected("Our virus scanner flagged this file, so it wasn’t uploaded.")
    raise ScannerUnavailable(text or "empty reply")


def check(path: Path, ext: str) -> None:
    """Every check that applies to a stored upload of this type."""
    if ext == "pdf":
        check_pdf(path)
    elif ext in ("docx", "pptx", "xlsx"):
        check_office(path)
    clamav_scan(path)
