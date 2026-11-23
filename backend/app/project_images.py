"""Pictures for a case study from the project itself: screenshots in a GitHub
README, and the preview image (og:image) of the live site.

Every image is fetched like any other link (public addresses only, each
redirect checked), recognised by its bytes (PNG, JPEG, WebP, GIF), and skipped if
it's tiny (badges, icons, logos)."""
import base64
import html
import json
import re
import struct
from urllib.parse import quote, urljoin, urlsplit

import httpx

from . import config, webread
from .webread import Unreadable, check_url

MAX_IMAGES = 6
MIN_WIDTH = 480
MAX_IMAGE_BYTES = 6 * 1024 * 1024   # a big animated GIF isn't worth the wait or the storage
PER_IMAGE_SECONDS = 10
TOTAL_SECONDS = 25                   # pictures must never hold up the case study for long
TIMEOUT = httpx.Timeout(12.0, connect=5.0)
SKIP = re.compile(r"(shields\.io|badge|badgen|travis-ci|circleci|codecov|coveralls|github\.com/.+/workflows/|"
                  r"img\.shields|\.svg(\?|$)|contrib\.rocks|star-history|komarev|vercel\.com/button|deploy-button|logo)", re.I)
MD_IMG = re.compile(r"!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
HTML_IMG = re.compile(r"<img\b[^>]*?\bsrc\s*=\s*[\"']([^\"']+)[\"'][^>]*>", re.I)
HTML_ALT = re.compile(r"\balt\s*=\s*[\"']([^\"']*)[\"']", re.I)
OG = [re.compile(r"<meta[^>]+(?:property|name)=[\"'](?:og:image|twitter:image)(?::src)?[\"'][^>]*content=[\"']([^\"']+)[\"']", re.I),
      re.compile(r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*(?:property|name)=[\"'](?:og:image|twitter:image)(?::src)?[\"']", re.I)]


# ---------------------------------------------------------------- finding pictures

def readme_images(owner: str, repo: str) -> list[tuple[str, str]]:
    """(absolute image URL, alt text) from a repository's README, in order."""
    try:
        r = json.loads(webread.fetch(f"https://api.github.com/repos/{quote(owner)}/{quote(repo)}/readme",
                                     accept="application/vnd.github+json")[0])
        text = base64.b64decode(r.get("content", "")).decode("utf-8", errors="replace")
    except (ValueError, Unreadable):
        return []
    base = (r.get("download_url") or f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/README.md").rsplit("/", 1)[0] + "/"
    found = [(m.group(2), m.group(1)) for m in MD_IMG.finditer(text)]
    for m in HTML_IMG.finditer(text):
        alt = HTML_ALT.search(m.group(0))
        found.append((m.group(1), alt.group(1) if alt else ""))
    # Keep the order they appear in the README.
    found.sort(key=lambda f: text.find(f[0]))
    out, seen = [], set()
    for src, alt in found:
        src = html.unescape(src.strip())
        if SKIP.search(src) or SKIP.search(alt):
            continue
        if src.startswith("//"):
            src = "https:" + src
        if not re.match(r"^https?://", src):
            src = urljoin(base, src.lstrip("./"))
        # github.com/<o>/<r>/blob/<ref>/x.png shows a page: the file itself is ?raw=true
        src = re.sub(r"^https://github\.com/([^/]+)/([^/]+)/blob/", r"https://github.com/\1/\2/raw/", src)
        if src not in seen:
            seen.add(src)
            out.append((src, alt.strip()[:80]))
    return out[:12]


def og_image(url: str) -> str | None:
    """The page's preview image (og:image / twitter:image), as an absolute URL."""
    try:
        page, _ = webread.fetch(url)
    except Unreadable:
        return None
    head = page[:200_000]
    for rx in OG:
        m = rx.search(head)
        if m:
            src = html.unescape(m.group(1).strip())
            return urljoin(url, src) if not SKIP.search(src) else None
    return None


# ---------------------------------------------------------------- fetching one picture

def _kind(head: bytes) -> tuple[str, str] | None:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp", "image/webp"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif", "image/gif"
    return None


def size(data: bytes) -> tuple[int, int]:
    """(width, height) in pixels of a PNG, GIF, JPEG or WebP ((0, 0) if it can't tell)."""
    try:
        if data.startswith(b"\x89PNG"):
            return struct.unpack(">II", data[16:24])
        if data[:3] == b"GIF":
            return struct.unpack("<HH", data[6:10])
        if data[:4] == b"RIFF" and data[12:16] == b"VP8 ":
            w, h = struct.unpack("<HH", data[26:30])
            return w & 0x3FFF, h & 0x3FFF
        if data[:4] == b"RIFF" and data[12:16] == b"VP8L":
            b = struct.unpack("<I", data[21:25])[0]
            return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
        if data[:4] == b"RIFF" and data[12:16] == b"VP8X":
            return int.from_bytes(data[24:27], "little") + 1, int.from_bytes(data[27:30], "little") + 1
        if data[:2] == b"\xff\xd8":
            i = 2
            while i + 9 < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    except (struct.error, IndexError):
        return 0, 0
    return 0, 0


def width(data: bytes) -> int:
    return size(data)[0]


def looks_like_a_picture(data: bytes) -> bool:
    """Big enough to show, and not shaped like a logo, banner or badge (very wide and short)."""
    w, h = size(data)
    return w >= MIN_WIDTH and h >= 200 and w / max(h, 1) <= 3.2


def download(url: str, client: httpx.Client, deadline: float | None = None) -> tuple[bytes, str, str] | None:
    """(bytes, extension, content type) of a public image, or None (also when it's too big
    or too slow: past `deadline`, a time.monotonic() value)."""
    import time
    deadline = min(deadline or 1e18, time.monotonic() + PER_IMAGE_SECONDS)
    for _ in range(4):  # a few redirects (GitHub raw → CDN), each one checked
        try:
            check_url(url)
            data = bytearray()
            with client.stream("GET", url, headers={"User-Agent": webread.USER_AGENT, "Accept": "image/*"}) as r:
                if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                    url = urljoin(url, r.headers["location"])
                    continue
                if r.status_code != 200:
                    return None
                if int(r.headers.get("content-length") or 0) > MAX_IMAGE_BYTES:
                    return None
                for chunk in r.iter_bytes():
                    data += chunk
                    if len(data) > min(MAX_IMAGE_BYTES, config.MAX_UPLOAD_BYTES) or time.monotonic() > deadline:
                        return None
        except (httpx.HTTPError, Unreadable):
            return None
        kind = _kind(bytes(data[:16]))
        if not kind or not looks_like_a_picture(bytes(data)):
            return None
        return bytes(data), kind[0], kind[1]
    return None


def collect(urls: list[str]) -> list[dict]:
    """Pictures for these project links: the live site's preview first (a good cover), then
    README screenshots. Returns [{data, ext, ctype, caption, from}] (at most MAX_IMAGES)."""
    from concurrent.futures import ThreadPoolExecutor as Pool

    def find(u: str) -> list[tuple[str, str, str]]:
        host = (urlsplit(u).hostname or "").lower().removeprefix("www.")
        path = [p for p in urlsplit(u).path.split("/") if p]
        if host == "github.com" and len(path) >= 2:
            return [(src, alt, "readme") for src, alt in readme_images(path[0], path[1].removesuffix(".git"))]
        if webread.platform(u) == "web":
            og = og_image(u)
            return [(og, "", "site")] if og else []
        return []
    with Pool(max_workers=4) as finders:  # every link is looked at at the same time
        found = list(finders.map(find, urls[:4]))
    # The live site's preview first (it makes a good cover), then README screenshots.
    wanted = [w for f in found for w in f if w[2] == "site"] + [w for f in found for w in f if w[2] != "site"]
    import time
    from concurrent.futures import ThreadPoolExecutor
    deadline = time.monotonic() + TOTAL_SECONDS
    unique, seen = [], set()
    for w in wanted:
        if w[0] not in seen:
            seen.add(w[0]); unique.append(w)
    unique = unique[:MAX_IMAGES * 2]  # a few spares for images that turn out tiny or too big
    with httpx.Client(timeout=TIMEOUT, trust_env=False, follow_redirects=False) as client, ThreadPoolExecutor(max_workers=4) as pool:
        got = list(pool.map(lambda w: download(w[0], client, deadline), unique))  # in parallel, results in order
    out = [{"data": g[0], "ext": g[1], "ctype": g[2], "caption": alt, "from": origin}
           for (src, alt, origin), g in zip(unique, got) if g]
    return out[:MAX_IMAGES]
