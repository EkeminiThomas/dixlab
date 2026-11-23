"""Reading a Figma file for a case study: its screens (as images), the words on
them, its fonts, colours and structure (pages, sections, frames, prototype flows).

Uses Figma's REST API (api.figma.com/v1), which needs an access token:
  - the server's own token, FIGMA_TOKEN (opens any file shared as
    "Anyone with the link can view"), and/or
  - a person's own token, sent with one request and never stored or logged
    (opens their private files too).

Without a token Dixlab falls back to the file's title (profile_readers.figma).

Two reads per file keep big files cheap: the outline (pages and the frames on
them, depth 3), then the full contents of the few screens we picked. Screens are
exported as PNGs at a sensible width and saved as the person's own uploads."""
import colorsys
import json
import logging
import re
import secrets
from collections import Counter
from urllib.parse import parse_qs, urlsplit

import httpx

from . import config
from .webread import Unreadable, check_url

log = logging.getLogger("dixlab.figma")

API = "https://api.figma.com/v1"
TIMEOUT = httpx.Timeout(25.0, connect=6.0)
MAX_JSON = 25 * 1024 * 1024          # a file's outline or picked screens, as JSON
MAX_SCREENS = 8                      # images added to the gallery (the case study holds 8)
MAX_TEXT = 6000                      # characters of the file described for the AI
TOKEN_RE = re.compile(r"^[A-Za-z0-9_\-]{20,200}$")
URL_RE = re.compile(r"^https?://(?:www\.)?figma\.com/(file|design|proto|board|slides|deck)/([A-Za-z0-9]{10,64})"
                    r"(?:/[^/?#]*)?(?:/branch/([A-Za-z0-9]{10,64}))?", re.I)
# Pages that hold scraps, not the work.
SKIP_PAGE = re.compile(r"\b(archived?|old|unused|scratch(pad)?|playground|sandbox|wip|trash|graveyard|backup|deprecated|"
                       r"components?|library|styles?|tokens|assets|icons?)\b|^\W*$", re.I)
COVER_PAGE = re.compile(r"^\W*(cover|thumbnail)\W*$", re.I)
SCREEN_TYPES = {"FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"}
PLACEHOLDER = re.compile(r"^(lorem ipsum|button|label|text|title|heading|placeholder|subtitle|caption|\d+|[\W_]+)$", re.I)


class FigmaError(Unreadable):
    """Figma refused or couldn't answer; the message says what to do."""


class TooBig(FigmaError):
    """The answer was over MAX_JSON."""


def parse_url(url: str) -> tuple[str, str, str | None] | None:
    """(kind, file key, node id or None) for a Figma file link, else None.
    A branch link reads the branch."""
    m = URL_RE.match(url.strip())
    if not m:
        return None
    node = parse_qs(urlsplit(url).query).get("node-id", [None])[0]
    node = node.replace("-", ":") if node and re.fullmatch(r"\d+[-:]\d+", node) else None
    return m.group(1).lower(), m.group(3) or m.group(2), node


def token_for(own: str | None) -> str:
    own = (own or "").strip()
    if own and TOKEN_RE.match(own):
        return own
    return config.FIGMA_TOKEN


def available(own: str | None = None) -> bool:
    return bool(token_for(own))


# ---------------------------------------------------------------- calling Figma

def _get(path: str, token: str, params: dict | None = None) -> dict:
    url = f"{API}{path}"
    try:
        with httpx.Client(timeout=TIMEOUT, trust_env=False) as client, \
                client.stream("GET", url, params=params, headers={"X-Figma-Token": token, "Accept": "application/json"}) as r:
            if r.status_code in (401, 403):
                raise FigmaError("Figma didn’t let us open that file. Set its sharing to “Anyone with the link can view”, "
                                 "or add your own Figma access token so we can open your private files.")
            if r.status_code == 404:
                raise FigmaError("Figma couldn’t find that file. Check the link is to a design file or prototype.")
            if r.status_code == 429:
                raise FigmaError("Figma is limiting how often files can be read right now. Try again in a few minutes.")
            if r.status_code != 200:
                raise FigmaError(f"Figma answered {r.status_code}. Try again shortly.")
            data = bytearray()
            for chunk in r.iter_bytes():
                data += chunk
                if len(data) > MAX_JSON:
                    raise TooBig("That Figma file is too big to read in one go. Link to one page or section instead "
                                     "(right-click it in Figma → Copy link).")
    except httpx.HTTPError:
        raise FigmaError("We couldn’t reach Figma. Try again shortly.") from None
    try:
        return json.loads(bytes(data))
    except ValueError:
        raise FigmaError("Figma didn’t answer as expected.") from None


# ---------------------------------------------------------------- reading the file

def _visible(n: dict) -> bool:
    return n.get("visible", True) is not False


def _box(n: dict) -> tuple[float, float, float, float]:
    b = n.get("absoluteBoundingBox") or {}
    return b.get("x", 0), b.get("y", 0), b.get("width", 0), b.get("height", 0)


def _hex(c: dict) -> str:
    return "#{:02x}{:02x}{:02x}".format(*(max(0, min(255, round(c.get(k, 0) * 255))) for k in "rgb"))


def _screens_in(node: dict, page: str, section: str = "") -> list[dict]:
    """Top-level screens: frames on the canvas, and frames inside sections."""
    out = []
    for ch in node.get("children") or []:
        if not _visible(ch):
            continue
        t = ch.get("type")
        if t == "SECTION":
            out += _screens_in(ch, page, ch.get("name", ""))
        elif t in SCREEN_TYPES:
            _, _, w, h = _box(ch)
            if w >= 200 and h >= 150:
                out.append({"id": ch["id"], "name": ch.get("name", "").strip()[:80], "page": page, "section": section,
                            "w": round(w), "h": round(h), "x": _box(ch)[0], "y": _box(ch)[1]})
    return out


def _focus(doc: dict, node: str | None) -> dict | None:
    """The page, section or frame a link points at (node-id=...), if any."""
    if not node:
        return None
    stack = [doc]
    while stack:
        n = stack.pop()
        if n.get("id") == node:
            return n
        stack.extend(n.get("children") or [])
    return None


def _pick(outline: list[dict], starts: list[str]) -> list[dict]:
    """Up to MAX_SCREENS screens, spread over the pages in order, flow starting points first."""
    first = [s for s in outline if s["id"] in starts]
    rest = [s for s in outline if s["id"] not in starts]
    pages: dict[str, list[dict]] = {}
    for s in rest:
        pages.setdefault(s["page"], []).append(s)
    for frames in pages.values():
        frames.sort(key=lambda s: (s["y"] // 400, s["x"]))  # reading order on the canvas
    picked = first[:MAX_SCREENS]
    while len(picked) < MAX_SCREENS and any(pages.values()):
        for frames in pages.values():
            if frames and len(picked) < MAX_SCREENS:
                picked.append(frames.pop(0))
    return picked


def _walk(node: dict, styles: dict, fonts: Counter, sizes: dict, weights: dict, colors: Counter, names: dict,
          texts: list, stats: Counter) -> None:
    if not _visible(node):
        return
    t = node.get("type")
    if node.get("interactions") or node.get("transitionNodeID"):
        stats["links"] += 1
    if t == "INSTANCE":
        stats["instances"] += 1
    _, _, w, h = _box(node)
    for f in node.get("fills") or []:
        if f.get("type") == "SOLID" and f.get("visible", True) and (f.get("opacity", 1) * f.get("color", {}).get("a", 1)) > 0.5:
            hx = _hex(f["color"])
            colors[hx] += max(1, int((w * h) ** 0.5)) if t != "TEXT" else 40
            sid = (node.get("styles") or {}).get("fill") or (node.get("styles") or {}).get("fills")
            if sid and sid in styles:
                names.setdefault(hx, styles[sid].get("name", "")[:40])
    if t == "TEXT":
        chars = str(node.get("characters") or "").strip()
        st = node.get("style") or {}
        fam = str(st.get("fontFamily") or "").strip()[:40]
        if fam:
            n = max(1, len(chars))
            fonts[fam] += n
            if st.get("fontSize"):
                sizes.setdefault(fam, Counter())[round(st["fontSize"])] += n
            if st.get("fontWeight"):
                weights.setdefault(fam, set()).add(int(st["fontWeight"]))
        for ov in (node.get("styleOverrideTable") or {}).values():
            if ov.get("fontFamily"):
                fonts[str(ov["fontFamily"])[:40]] += 5
                if ov.get("fontWeight"):
                    weights.setdefault(str(ov["fontFamily"])[:40], set()).add(int(ov["fontWeight"]))
        if chars and not PLACEHOLDER.match(chars) and not chars.lower().startswith("lorem ipsum"):
            texts.append((_box(node)[1], _box(node)[0], re.sub(r"\s+", " ", chars)[:240]))
    for ch in node.get("children") or []:
        _walk(ch, styles, fonts, sizes, weights, colors, names, texts, stats)


def _accent(colors: list[dict]) -> str | None:
    """The most-used colour that reads as a brand colour (not grey, not near black or white)."""
    for c in colors:
        r, g, b = (int(c["hex"][i:i + 2], 16) / 255 for i in (1, 3, 5))
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        if s >= 0.35 and 0.25 <= l <= 0.72:
            return c["hex"]
    return None


# Closest of Dixlab's font pairings (components/sites/brand.js FONT_PAIRS).
def font_pair(families: list[str]) -> str | None:
    if not families:
        return None
    head = families[0].lower()
    if any("mono" in f.lower() or "code" in f.lower() for f in families[:1]):
        return "technical"
    if "instrument serif" in head or "cormorant" in head or "fraunces" in head:
        return "elegant"
    if any(k in head for k in ("playfair", "serif", "georgia", "times", "merriweather", "lora", "libre baskerville", "dm serif", "garamond")):
        return "editorial"
    if "space grotesk" in head or "grotesk" in head:
        return "grotesk"
    if "syne" in head or "clash" in head or "unbounded" in head:
        return "expressive"
    if any(k in head for k in ("bricolage", "nunito", "poppins", "quicksand", "rubik", "comfortaa", "fredoka")):
        return "friendly"
    return "modern"


def read(url: str, own_token: str | None = None) -> dict:
    """Everything a case study can use from a Figma file. Raises FigmaError."""
    parsed = parse_url(url)
    if not parsed:
        raise FigmaError("Use a link to a Figma file or prototype (figma.com/design/… or figma.com/proto/…).")
    kind, key, node = parsed
    token = token_for(own_token)
    if not token:
        raise FigmaError("Reading Figma files isn’t set up on this server yet.")
    try:
        meta = _get(f"/files/{key}", token, {"depth": 3})
    except TooBig:  # a huge file: pages and their top-level frames only (frames inside sections are missed)
        meta = _get(f"/files/{key}", token, {"depth": 2})
    doc = meta.get("document") or {}
    styles = meta.get("styles") or {}
    focus = _focus(doc, node)
    pages = [p for p in doc.get("children") or [] if p.get("type") == "CANVAS"]
    outline, starts, structure, cover = [], [], [], None
    for p in pages:
        pname = p.get("name", "").strip()[:60]
        frames = _screens_in(p, pname)
        if COVER_PAGE.match(pname):
            cover = cover or (frames[0] if frames else None)
            continue
        if SKIP_PAGE.search(pname) and len(pages) > 1:
            structure.append({"page": pname, "frames": len(frames), "names": [], "skipped": True})
            continue
        starts += [f.get("nodeId") for f in p.get("flowStartingPoints") or [] if f.get("nodeId")]
        structure.append({"page": pname, "frames": len(frames), "names": [f["name"] for f in frames[:14]],
                          "sections": sorted({f["section"] for f in frames if f["section"]})[:8],
                          "flows": [f.get("name", "")[:60] for f in p.get("flowStartingPoints") or []][:6]})
        outline += frames
    if focus is not None and focus.get("type") != "DOCUMENT":  # the link points at one page, section or frame
        if focus.get("type") in SCREEN_TYPES:
            outline = [s for s in outline if s["id"] == focus["id"]] or outline
        else:
            ids = {s["id"] for s in _screens_in(focus, focus.get("name", ""))}
            outline = [s for s in outline if s["id"] in ids] or outline
    picked = _pick(outline, starts)

    fonts, sizes, weights, colors, names, stats = Counter(), {}, {}, Counter(), {}, Counter()
    screen_text: dict[str, list[str]] = {}
    if picked:
        got = _get(f"/files/{key}/nodes", token, {"ids": ",".join(s["id"] for s in picked)})
        for s in picked:
            n = ((got.get("nodes") or {}).get(s["id"]) or {}).get("document")
            if not n:
                continue
            texts: list = []
            _walk(n, {**styles, **((got.get("nodes") or {}).get(s["id"]) or {}).get("styles", {})},
                  fonts, sizes, weights, colors, names, texts, stats)
            seen, words = set(), []
            for _, _, t in sorted(texts):
                if t.lower() not in seen:
                    seen.add(t.lower()); words.append(t)
            screen_text[s["id"]] = words

    # Headings first (the family used most at 24px and up), then by how much text uses each.
    big = Counter({f: sum(n for sz, n in c.items() if sz >= 24) for f, c in sizes.items()})
    heading = next((f for f, n in big.most_common(1) if n), None)
    order = ([heading] if heading else []) + [f for f, _ in fonts.most_common(5) if f != heading]
    font_list = [{"family": f, "role": "Headings" if f == heading else ("Body" if i == (1 if heading else 0) else ""),
                  "weights": sorted(weights.get(f, set()))[:6],
                  "sizes": sorted(c for c, _ in sizes.get(f, Counter()).most_common(6))} for i, f in enumerate(order[:4])]
    total = sum(colors.values()) or 1
    color_list = [{"hex": hx, "name": names.get(hx, ""), "share": round(100 * n / total)} for hx, n in colors.most_common(8)]
    style_kinds = Counter(s.get("styleType", "") for s in styles.values())
    info = {
        "name": str(meta.get("name") or "Figma file")[:120],
        "kind": {"proto": "prototype", "board": "FigJam board", "slides": "Slides deck", "deck": "Slides deck"}.get(kind, "design file"),
        "url": url,
        "lastModified": str(meta.get("lastModified") or "")[:10],
        "thumbnail": meta.get("thumbnailUrl") or "",
        "screens": picked,
        "cover": cover["id"] if cover else None,
        "coverFrame": {"id": cover["id"], "name": "Cover", "w": cover["w"], "h": cover["h"]} if cover else None,
        "fonts": font_list,
        "colors": color_list,
        "accent": _accent(color_list),
        "fontPair": font_pair([f["family"] for f in font_list]),
        "structure": structure,
        "stats": {"pages": len([s for s in structure if not s.get("skipped")]), "screens": len(outline),
                  "components": len(meta.get("components") or {}), "componentSets": len(meta.get("componentSets") or {}),
                  "colorStyles": style_kinds.get("FILL", 0), "textStyles": style_kinds.get("TEXT", 0),
                  "flows": sum(len(s.get("flows") or []) for s in structure), "links": stats["links"]},
    }
    info["text"] = describe(info, screen_text)
    return info


def describe(info: dict, screen_text: dict[str, list[str]]) -> str:
    """The file, as text for the AI."""
    st = info["stats"]
    lines = [f"Figma {info['kind']}: \"{info['name']}\"" + (f" (last edited {info['lastModified']})" if info["lastModified"] else ""),
             f"{st['pages']} pages, {st['screens']} screens, {st['components']} components"
             + (f", {st['flows']} prototype flows" if st["flows"] else "")
             + (f", {st['colorStyles']} colour styles and {st['textStyles']} text styles" if st["colorStyles"] or st["textStyles"] else "") + "."]
    lines.append("\nSTRUCTURE (pages in order, with their sections and frame names):")
    for s in info["structure"]:
        if s.get("skipped"):
            continue
        bits = [f"- Page \"{s['page']}\" ({s['frames']} frames)"]
        if s.get("sections"):
            bits.append("sections: " + ", ".join(s["sections"]))
        if s.get("names"):
            bits.append("frames: " + ", ".join(n for n in s["names"] if n))
        if s.get("flows"):
            bits.append("prototype flows: " + ", ".join(s["flows"]))
        lines.append(" · ".join(bits))
    if info["fonts"]:
        lines.append("\nTYPOGRAPHY: " + "; ".join(
            f"{f['family']}" + (f" (weights {', '.join(map(str, f['weights']))})" if f["weights"] else "")
            + (f" at {', '.join(map(str, f['sizes']))}px" if f["sizes"] else "") for f in info["fonts"]))
    if info["colors"]:
        lines.append("COLOURS: " + ", ".join(f"{c['hex']}{' ' + c['name'] if c['name'] else ''}" for c in info["colors"]))
    lines.append("\nWORDS ON THE MAIN SCREENS:")
    text = "\n".join(lines)
    per = max(300, (MAX_TEXT - len(text)) // max(1, len(info["screens"])))
    for s in info["screens"]:
        words = " | ".join(screen_text.get(s["id"], []))
        if words:
            text += f"\n[{s['page']} › {s['name']}] {words[:per]}"
    return text[:MAX_TEXT]


# ---------------------------------------------------------------- screens as images

SCALES = (0.25, 0.5, 0.75, 1, 1.5, 2)


def _scale(w: float, h: float) -> float:
    """Export at about 1600px wide (phones at 2x), never taller than 5000px."""
    s = min(2.0, 1600 / max(1.0, w))
    if h * s > 5000:
        s = 5000 / h
    return max([x for x in SCALES if x <= s] or [0.25])


def export(key_url: str, picked: list[dict], cover: dict | None, own_token: str | None, room: int) -> list[dict]:
    """Render the picked screens (and the cover frame) as PNGs and save them in
    UPLOAD_DIR. Returns [{id, name, path, size}] in order, stopping at `room` bytes.
    Failures are skipped: the case study still gets its words."""
    parsed = parse_url(key_url)
    token = token_for(own_token)
    if not parsed or not token:
        return []
    key = parsed[1]
    wanted = ([cover] if cover else []) + picked
    groups: dict[float, list[str]] = {}
    for s in wanted:
        groups.setdefault(_scale(s["w"], s["h"]), []).append(s["id"])
    urls: dict[str, str] = {}
    for scale, ids in groups.items():
        try:
            r = _get(f"/images/{key}", token, {"ids": ",".join(ids), "format": "png", "scale": scale})
            urls.update({k: v for k, v in (r.get("images") or {}).items() if v})
        except FigmaError as e:
            log.info("figma export failed: %s", e)
    out, used = [], 0
    with httpx.Client(timeout=TIMEOUT, trust_env=False, follow_redirects=False) as client:
        for s in wanted:
            src = urls.get(s["id"])
            if not src:
                continue
            try:
                check_url(src)
                data = bytearray()
                with client.stream("GET", src) as r:
                    if r.status_code != 200:
                        continue
                    for chunk in r.iter_bytes():
                        data += chunk
                        if len(data) > config.MAX_UPLOAD_BYTES:
                            break
                if len(data) > config.MAX_UPLOAD_BYTES or not bytes(data[:8]) == b"\x89PNG\r\n\x1a\n":
                    continue
            except (httpx.HTTPError, Unreadable):
                continue
            if used + len(data) > room:
                break
            name = f"{secrets.token_hex(16)}.png"
            (config.UPLOAD_DIR / name).write_bytes(bytes(data))
            used += len(data)
            out.append({"id": s["id"], "name": s["name"], "file": name, "size": len(data), "cover": bool(cover) and s is cover})
    return out
