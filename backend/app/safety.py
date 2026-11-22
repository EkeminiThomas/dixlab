"""Cleaning user content before it's stored or shown to others.

Projects are free-form JSON from the editor and end up on public pages, so
every link and media address is checked here: links may only be web, email
or same-site addresses, and images/videos/files may only come from Dixlab's
own uploads (or an inline image). Anything else, such as `javascript:` links
or images on other sites that could track visitors, is removed."""
import re
from typing import Any

# Browsers ignore whitespace and control characters inside a URL scheme
# ("java\tscript:" still runs), so compare without them.
_CTRL = re.compile(r"[\x00-\x20\x7f]+")
_SCHEME = re.compile(r"^([a-z][a-z0-9+.\-]*):")
_DATA_IMAGE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$", re.I)

# Keys holding a link people click.
LINK_KEYS = {"link", "href", "url", "website", "linkedin", "github", "portfolio", "behance", "dribbble", "twitter", "instagram", "bookingurl"}
# Keys holding an image, video or file address the page loads.
MEDIA_KEYS = {"src", "photo", "poster", "avatar", "image", "thumbnail", "bgimage"}  # keys are compared lower-cased


def _compact(value: str) -> str:
    return _CTRL.sub("", value).lower()


def safe_link(value: str) -> str:
    """http(s), mailto, same-site paths and bare domains ("alex.dev") are kept."""
    v = value.strip()
    c = _compact(v)
    if not c:
        return ""
    m = _SCHEME.match(c)
    if m and m.group(1) not in ("http", "https", "mailto"):
        return ""
    return v


def safe_media(value: str) -> str:
    """Only Dixlab's own files ("/uploads/…", other "/…" paths) or inline images."""
    v = value.strip()
    c = _compact(v)
    if not c:
        return ""
    if c.startswith("/") and not c.startswith("//") and "\\" not in c:
        return v
    if _DATA_IMAGE.match(v):
        return v
    return ""


def _scrub_text(value: str) -> str:
    """Any other text that's really a script link is dropped too."""
    m = _SCHEME.match(_compact(value))
    return "" if m and m.group(1) in ("javascript", "vbscript") else value


def clean(obj: Any, key: str | None = None) -> Any:  # same shape out as in (a dict stays a dict)
    """Return a copy of `obj` with unsafe links and media addresses removed."""
    if isinstance(obj, dict):
        return {k: clean(v, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean(v, key) for v in obj]
    if isinstance(obj, str):
        k = (key or "").lower()
        if k in LINK_KEYS:
            return safe_link(obj)
        if k in MEDIA_KEYS:
            return safe_media(obj)
        return _scrub_text(obj)
    return obj
