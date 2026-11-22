"""Visitor analytics for published pages, and share previews for link unfurls.

Privacy first: nothing identifies a visitor. Published pages send small events
(where the visitor came from, which project they opened, how far they scrolled,
and whether they downloaded the CV or booked a call); each is counted per page
per day. No cookies, no IP addresses, no user agents are stored. The same
visitor is only counted once per event every 30 minutes (in memory, by a hash).

Owners see their numbers on Pro (30 days) and Premium (365 days)."""
import html
import re
import sqlite3
import time
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from .. import config, plans
from ..db import get_db
from ..ratelimit import Limiter, client_ip
from ..security import current_user, optional_user_id

router = APIRouter(tags=["analytics"])

_seen = Limiter("page_event", 1, 30 * 60)         # one count per visitor, event and page every 30 minutes
_per_ip = Limiter("page_event_ip", 120, 60 * 60)  # and a ceiling, so a script can't inflate anything

KINDS = {"ref", "open", "depth", "action"}
DEPTHS = {"25", "50", "75", "100"}
ACTIONS = {"cv", "book", "contact", "link"}
SOURCES = (  # host suffix -> source name
    ("linkedin.com", "linkedin"), ("lnkd.in", "linkedin"), ("t.co", "x"), ("x.com", "x"), ("twitter.com", "x"),
    ("github.com", "github"), ("facebook.com", "facebook"), ("fb.com", "facebook"), ("instagram.com", "instagram"),
    ("whatsapp.com", "whatsapp"), ("wa.me", "whatsapp"), ("t.me", "telegram"), ("telegram.org", "telegram"),
    ("bing.com", "bing"), ("duckduckgo.com", "duckduckgo"), ("mercor.com", "mercor"), ("upwork.com", "upwork"),
)


def source_of(referrer: str) -> str:
    """Where a visitor came from, as a short name: never the full address."""
    host = (urlsplit(referrer).hostname or "").lower().removeprefix("www.") if referrer else ""
    if not host:
        return "direct"
    own = (urlsplit(config.PUBLIC_URL).hostname or "").lower().removeprefix("www.")
    if host == own:
        return "dixlab"
    if re.match(r"^google\.[a-z.]+$", host) or host.startswith("google."):
        return "google"
    for suffix, name in SOURCES:
        if host == suffix or host.endswith("." + suffix):
            return name
    return host[:60]


class EventIn(BaseModel):
    kind: str = Field(max_length=10)
    key: str = Field(default="", max_length=300)


def _count(db, slug: str, kind: str, key: str) -> None:
    day = time.strftime("%Y-%m-%d", time.gmtime())
    db.execute("INSERT INTO page_events (slug, day, kind, key, count) VALUES (?, ?, ?, ?, 1) "
               "ON CONFLICT(slug, day, kind, key) DO UPDATE SET count = count + 1", (slug, day, kind, key))


@router.post("/api/public/{slug}/event", status_code=204)
def page_event(slug: str, body: EventIn, request: Request, db: sqlite3.Connection = Depends(get_db)):
    """A visitor did something on a published page. Always answers 204 (nothing to learn from it)."""
    row = db.execute("SELECT user_id FROM publications WHERE slug = ?", (slug,)).fetchone()
    if not row or body.kind not in KINDS:
        return Response(status_code=204)
    if optional_user_id(request, db) == row["user_id"]:
        return Response(status_code=204)  # the owner looking at their own page doesn't count
    key = body.key.strip()
    if body.kind == "ref":
        key = source_of(key)
    elif body.kind == "depth" and key not in DEPTHS:
        return Response(status_code=204)
    elif body.kind == "action" and key not in ACTIONS:
        return Response(status_code=204)
    elif body.kind == "open":
        key = key[:120] or "Untitled"
    ip = client_ip(request)
    if not _per_ip.hit(ip) or not _seen.hit(f"{ip}|{slug}|{body.kind}|{key}"):
        return Response(status_code=204)
    _count(db, slug, body.kind, key)
    return Response(status_code=204)


@router.get("/api/projects/{project_id}/analytics")
def project_analytics(project_id: str, days: int = Query(30, ge=7, le=365), user=Depends(current_user),
                      db: sqlite3.Connection = Depends(get_db)):
    """Views over time, sources, opened projects, scroll depth and actions for one published project."""
    allowed = plans.entitlements(db, user["id"])["insightDays"]
    if not allowed:
        raise plans.unlock_error("insights", None, db, user["id"])
    days = min(days, allowed)
    pub = db.execute("SELECT slug, views, created_at FROM publications WHERE user_id = ? AND project_id = ?",
                     (user["id"], project_id)).fetchone()
    if not pub:
        return {"published": False, "days": days, "maxDays": allowed}
    slug = pub["slug"]
    first = time.strftime("%Y-%m-%d", time.gmtime(time.time() - (days - 1) * 86400))
    by_day = {r["day"]: r["views"] for r in db.execute("SELECT day, views FROM page_views_daily WHERE slug = ? AND day >= ?", (slug, first))}
    series = []
    for i in range(days):
        d = time.strftime("%Y-%m-%d", time.gmtime(time.time() - (days - 1 - i) * 86400))
        series.append({"day": d, "views": by_day.get(d, 0)})

    def grouped(kind, limit=10):
        return [{"key": r["key"], "count": r["n"]} for r in db.execute(
            "SELECT key, SUM(count) AS n FROM page_events WHERE slug = ? AND kind = ? AND day >= ? GROUP BY key ORDER BY n DESC LIMIT ?",
            (slug, kind, first, limit))]
    depth = {k["key"]: k["count"] for k in grouped("depth")}
    actions = {k["key"]: k["count"] for k in grouped("action")}
    messages = db.execute("SELECT COUNT(*) FROM messages WHERE slug = ? AND created_at >= ?",
                          (slug, int((time.time() - days * 86400) * 1000))).fetchone()[0]
    return {
        "published": True, "slug": slug, "days": days, "maxDays": allowed,
        "total": sum(x["views"] for x in series), "allTime": pub["views"], "series": series,
        "sources": grouped("ref"), "opens": grouped("open"),
        "depth": {k: depth.get(k, 0) for k in ("25", "50", "75", "100")},
        "actions": {"cv": actions.get("cv", 0), "book": actions.get("book", 0), "link": actions.get("link", 0), "messages": messages},
    }


# ---------------------------------------------------------------- share previews (LinkedIn, X, WhatsApp, Slack…)

def _abs(src: str) -> str:
    src = str(src or "").strip()
    if src.startswith("/") and not src.startswith("//"):
        return config.PUBLIC_URL + src  # the website forwards /uploads to the API
    return ""


def preview_for(project: dict) -> dict:
    kind = project.get("type")
    title = (project.get("title") or project.get("name") or "").strip()
    if kind == "portfolio":
        title = " · ".join(x for x in ((project.get("name") or "").strip(), (project.get("role") or "").strip()) if x) or title
    desc = (project.get("tagline") or project.get("problem") or project.get("notes") or project.get("role") or "").strip()
    desc = re.sub(r"\s+", " ", desc)[:200]
    cover = project.get("cover") if isinstance(project.get("cover"), dict) else {}
    image = _abs(cover.get("src")) if cover.get("type", "image") == "image" else ""
    image = image or _abs(project.get("photo")) or f"{config.PUBLIC_URL}/og-default.png"
    return {"title": title or "Made with Dixlab", "description": desc or "A portfolio, CV and case studies made with Dixlab.", "image": image}


@router.get("/api/public/{slug}/share", response_class=HTMLResponse, include_in_schema=False)
def share_page(slug: str, db: sqlite3.Connection = Depends(get_db)):
    """What link previews read (they don't run JavaScript). People who land here go straight on to the page."""
    import json
    row = db.execute("SELECT p.data, p.password_hash FROM publications p JOIN users u ON u.id = p.user_id "
                     "WHERE p.slug = ? AND u.suspended_at IS NULL", (slug,)).fetchone()
    if not row:
        return HTMLResponse("<!doctype html><title>Not found</title>", status_code=404)
    from .. import safety
    if row["password_hash"]:  # a private page: say nothing about what's inside
        meta = {"title": "A private page on Dixlab", "description": "This page is password protected.",
                "image": f"{config.PUBLIC_URL}/og-default.png"}
    else:
        meta = preview_for(safety.clean(json.loads(row["data"])))
    url = f"{config.PUBLIC_URL}/p/{slug}"
    e = lambda s: html.escape(s, quote=True)  # noqa: E731
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>{e(meta['title'])}</title>
<meta name="description" content="{e(meta['description'])}">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Dixlab">
<meta property="og:title" content="{e(meta['title'])}"><meta property="og:description" content="{e(meta['description'])}">
<meta property="og:url" content="{e(url)}"><meta property="og:image" content="{e(meta['image'])}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(meta['title'])}">
<meta name="twitter:description" content="{e(meta['description'])}"><meta name="twitter:image" content="{e(meta['image'])}">
<meta http-equiv="refresh" content="0;url={e(url)}">
</head><body><p><a href="{e(url)}">{e(meta['title'])}</a></p></body></html>"""
    return HTMLResponse(page, headers={"Cache-Control": "public, max-age=300"})


# ---------------------------------------------------------------- live GitHub / Stack Overflow numbers

_stats_ip = Limiter("live_stats_ip", 60, 60 * 60)


@router.get("/api/public/{slug}/stats")
def live_stats(slug: str, request: Request, db: sqlite3.Connection = Depends(get_db)):
    """The numbers a portfolio's "Live stats" strip shows. Empty when it's off or nothing could be read."""
    import json
    from .. import livestats
    row = db.execute("SELECT p.data, p.password_hash FROM publications p JOIN users u ON u.id = p.user_id "
                     "WHERE p.slug = ? AND u.suspended_at IS NULL", (slug,)).fetchone()
    if not row or row["password_hash"] or not _stats_ip.hit(client_ip(request)):
        return {}
    project = json.loads(row["data"])
    if project.get("type") != "portfolio":
        return {}
    return livestats.for_project(project)
