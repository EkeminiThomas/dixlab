"""Pictures for a case study from the project itself, best first:
  1. the live site's preview image (og:image), including the site a GitHub repo lists;
  2. screenshots in the README (GitHub and GitLab), demo GIFs included;
  3. screenshot files in the repository (screenshots/, docs/, assets/ … or files
     named screenshot, preview, demo …);
  4. the repository's social preview card, so a GitHub link always brings a picture.
Hugging Face Spaces and other pages give their preview image too.

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
MAX_IMAGE_BYTES = 6 * 1024 * 1024   # stills; a demo GIF may be bigger (up to the upload limit)
PER_IMAGE_SECONDS = 15
TOTAL_SECONDS = 30                   # pictures must never hold up the case study for long
IMG_FILE = re.compile(r"\.(png|jpe?g|webp|gif)$", re.I)
SHOT_NAME = re.compile(r"(screen|shot|preview|demo|showcase|hero|mockup|example|ui[-_.]|app[-_.]|dashboard|walkthrough)", re.I)
SHOT_DIRS = {"screenshots", "screenshot", "screens", "preview", "previews", "demo", "media", "images", "img", "assets", "docs", ".github"}
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
    return _images_in(text, base)  # in README order; a github.com/…/blob/… link becomes the file itself


GH = "application/vnd.github+json"


def _gh(path: str):
    try:
        return json.loads(webread.fetch(f"https://api.github.com{path}", accept=GH)[0])
    except (ValueError, Unreadable):
        return None


def repo_info(owner: str, repo: str) -> dict:
    """The repository's listed website, and screenshot files kept in the repo itself."""
    meta = _gh(f"/repos/{quote(owner)}/{quote(repo)}") or {}
    files: list[tuple[str, str]] = []
    root = _gh(f"/repos/{quote(owner)}/{quote(repo)}/contents") or []
    dirs = [i for i in root if isinstance(i, dict) and i.get("type") == "dir" and i.get("name", "").lower() in SHOT_DIRS]
    for i in root if isinstance(root, list) else []:
        if isinstance(i, dict) and i.get("type") == "file" and IMG_FILE.search(i.get("name", "")) and SHOT_NAME.search(i["name"]):
            files.append((i.get("download_url") or "", i["name"]))
    for d in sorted(dirs, key=lambda d: d["name"].lower() not in ("screenshots", "screenshot", "screens", "preview", "previews", "demo"))[:2]:
        whole = d["name"].lower() in ("screenshots", "screenshot", "screens", "preview", "previews", "demo")
        for i in _gh(f"/repos/{quote(owner)}/{quote(repo)}/contents/{quote(d['name'])}") or []:
            if isinstance(i, dict) and i.get("type") == "file" and IMG_FILE.search(i.get("name", "")) and (whole or SHOT_NAME.search(i["name"])):
                files.append((i.get("download_url") or "", i["name"]))
    caption = lambda n: re.sub(r"[-_.]+", " ", n.rsplit(".", 1)[0]).strip().capitalize()[:60]  # noqa: E731
    homepage = str(meta.get("homepage") or "").strip()
    return {"homepage": homepage if re.match(r"^https?://", homepage) else "",
            "files": [(u, caption(n)) for u, n in files if u.startswith("https://")][:8]}


def gitlab_readme_images(path: str) -> list[tuple[str, str]]:
    """Images in a GitLab project's README, as absolute URLs."""
    try:
        text = webread.fetch(f"https://gitlab.com/api/v4/projects/{quote(path, safe='')}/repository/files/README.md/raw?ref=HEAD",
                             accept="text/plain")[0]
    except Unreadable:
        return []
    return _images_in(text, f"https://gitlab.com/{path}/-/raw/HEAD/")


def _images_in(text: str, base: str) -> list[tuple[str, str]]:
    found = [(m.group(2), m.group(1)) for m in MD_IMG.finditer(text)]
    for m in HTML_IMG.finditer(text):
        alt = HTML_ALT.search(m.group(0))
        found.append((m.group(1), alt.group(1) if alt else ""))
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
    gif = url.lower().split("?")[0].endswith(".gif")
    deadline = min(deadline or 1e18, time.monotonic() + PER_IMAGE_SECONDS * (2 if gif else 1))  # a demo GIF gets longer
    cap = MAX_IMAGE_BYTES
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
                if r.headers.get("content-type", "").startswith("image/gif") or url.lower().split("?")[0].endswith(".gif"):
                    cap = config.MAX_UPLOAD_BYTES  # a demo GIF is often the best picture a README has
                if int(r.headers.get("content-length") or 0) > cap:
                    return None
                for chunk in r.iter_bytes():
                    data += chunk
                    if len(data) > min(cap, config.MAX_UPLOAD_BYTES) or time.monotonic() > deadline:
                        return None
        except (httpx.HTTPError, Unreadable):
            return None
        kind = _kind(bytes(data[:16]))
        if not kind or not looks_like_a_picture(bytes(data)):
            return None
        return bytes(data), kind[0], kind[1]
    return None


def _fetch_all(wanted: list[tuple[str, str, str]], deadline: float) -> list[dict]:
    """Download these (url, caption, origin) at once; keep the ones that are real pictures, in order."""
    from concurrent.futures import ThreadPoolExecutor
    unique, seen = [], set()
    for w in wanted:
        if w[0] and w[0] not in seen:
            seen.add(w[0]); unique.append(w)
    unique = unique[:MAX_IMAGES * 2]  # a few spares for images that turn out tiny or too big
    if not unique:
        return []
    with webread.client(TIMEOUT) as client, ThreadPoolExecutor(max_workers=4) as pool:
        got = list(pool.map(lambda w: download(w[0], client, deadline), unique))  # in parallel, results in order
    return [{"data": g[0], "ext": g[1], "ctype": g[2], "caption": cap, "from": origin}
            for (src, cap, origin), g in zip(unique, got) if g]


def collect(urls: list[str]) -> list[dict]:
    """Pictures for these project links, best first (see the top of this file).
    Returns [{data, ext, ctype, caption, from}], at most MAX_IMAGES."""
    import time
    from concurrent.futures import ThreadPoolExecutor as Pool

    def find(u: str) -> list[tuple[str, str, str]]:
        host = (urlsplit(u).hostname or "").lower().removeprefix("www.")
        path = [p for p in urlsplit(u).path.split("/") if p]
        if host == "github.com" and len(path) >= 2:
            owner, repo = path[0], path[1].removesuffix(".git")
            with Pool(max_workers=3) as p:
                readme, info, card = p.submit(readme_images, owner, repo), p.submit(repo_info, owner, repo),                     p.submit(og_image, f"https://github.com/{owner}/{repo}")
                readme, info, card = readme.result(), info.result(), card.result()
            site = og_image(info["homepage"]) if info["homepage"] and info["homepage"] not in urls else None
            return ([(site, "", "site")] if site else []) + [(s, a, "readme") for s, a in readme]                 + [(s, a, "files") for s, a in info["files"]] + ([(card, "", "card")] if card else [])
        if host == "gitlab.com" and len(path) >= 2:
            return [(s, a, "readme") for s, a in gitlab_readme_images("/".join(path[:2]))]
        if webread.platform(u) in ("web", "huggingface"):
            og = og_image(u)
            return [(og, "", "site")] if og else []
        return []
    with Pool(max_workers=4) as finders:  # every link is looked at at the same time
        found = [w for f in finders.map(find, urls[:4]) for w in f]
    deadline = time.monotonic() + TOTAL_SECONDS  # for the downloads: finding them has its own timeouts
    # Real pictures first: the site's preview (a good cover), README and repo screenshots.
    order = {"site": 0, "readme": 1, "files": 2}
    best = sorted([w for w in found if w[2] != "card"], key=lambda w: order.get(w[2], 3))
    out = _fetch_all(best, deadline)
    if not out:  # nothing else: the repository's social preview card, so there's always a picture
        out = _fetch_all([w for w in found if w[2] == "card"], deadline + 8)
    return out[:MAX_IMAGES]
