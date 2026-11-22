"""Live GitHub and Stack Overflow numbers for published portfolios.

Read from the public APIs (same safety rules as every outside read) and kept
in memory for a few hours, so a busy page doesn't hammer GitHub's rate limit.
Only public numbers: repositories, stars, followers, languages, reputation, badges."""
import html
import re
import threading
import time

from .profile_readers import _json, _parallel
from .webread import Unreadable

TTL = 6 * 3600
_cache: dict[str, tuple[float, dict | None]] = {}
_lock = threading.Lock()

GITHUB_USER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
SO_USER = re.compile(r"^https?://(?:www\.)?stackoverflow\.com/users/(\d{1,10})(?:/|$)", re.I)


def github_login(value: str) -> str | None:
    """'octocat', '@octocat' or 'https://github.com/octocat' -> 'octocat'."""
    v = str(value or "").strip().removeprefix("@")
    m = re.match(r"^(?:https?://)?(?:www\.)?github\.com/([^/?#]+)", v, re.I)
    v = m.group(1) if m else v
    return v if GITHUB_USER.match(v) else None


def so_user(value: str) -> str | None:
    m = SO_USER.match(str(value or "").strip())
    return m.group(1) if m else None


def _cached(key: str, fn):
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < TTL:
            return hit[1]
    try:
        value = fn()
    except Unreadable:
        value = None  # remembered too, so a missing profile isn't retried on every visit
    with _lock:
        if len(_cache) > 2000:
            _cache.clear()
        _cache[key] = (now, value)
    return value


def github(login: str) -> dict | None:
    def read():
        api = f"https://api.github.com/users/{login}"
        got = _parallel({"user": lambda: _json(api), "repos": lambda: _json(f"{api}/repos?per_page=100&sort=pushed&type=owner")})
        u = got.get("user")
        if not isinstance(u, dict) or not u.get("login"):
            raise Unreadable("No such GitHub user.")
        repos = [r for r in (got.get("repos") or []) if isinstance(r, dict) and not r.get("fork")]
        langs: dict[str, int] = {}
        for r in repos:
            if r.get("language"):
                langs[r["language"]] = langs.get(r["language"], 0) + 1
        top = sorted(repos, key=lambda r: (r.get("stargazers_count", 0), r.get("pushed_at") or ""), reverse=True)[:3]
        return {
            "login": u["login"], "url": f"https://github.com/{u['login']}",
            "repos": u.get("public_repos", 0), "followers": u.get("followers", 0),
            "stars": sum(r.get("stargazers_count", 0) for r in repos),
            "languages": [k for k, _ in sorted(langs.items(), key=lambda kv: -kv[1])[:5]],
            "top": [{"name": r.get("name", ""), "description": (r.get("description") or "")[:140], "stars": r.get("stargazers_count", 0),
                     "language": r.get("language") or "", "url": f"https://github.com/{u['login']}/{r.get('name', '')}"} for r in top],
        }
    return _cached(f"gh:{login.lower()}", read)


def stackoverflow(uid: str) -> dict | None:
    def read():
        api = "https://api.stackexchange.com/2.3"
        got = _parallel({"user": lambda: _json(f"{api}/users/{uid}?site=stackoverflow"),
                         "tags": lambda: _json(f"{api}/users/{uid}/top-tags?site=stackoverflow&pagesize=5")})
        items = (got.get("user") or {}).get("items") or []
        if not items:
            raise Unreadable("No such Stack Overflow user.")
        u = items[0]
        b = u.get("badge_counts") or {}
        return {
            "name": html.unescape(u.get("display_name", "")), "url": f"https://stackoverflow.com/users/{uid}",
            "reputation": u.get("reputation", 0), "gold": b.get("gold", 0), "silver": b.get("silver", 0), "bronze": b.get("bronze", 0),
            "tags": [t.get("tag_name", "") for t in ((got.get("tags") or {}).get("items") or [])][:5],
        }
    return _cached(f"so:{uid}", read)


def for_project(project: dict) -> dict:
    s = project.get("liveStats") if isinstance(project.get("liveStats"), dict) else {}
    out = {}
    jobs = {}
    if (login := github_login(s.get("github"))):
        jobs["github"] = lambda: github(login)
    if (uid := so_user(s.get("stackoverflow"))):
        jobs["stackoverflow"] = lambda: stackoverflow(uid)
    if jobs:
        out = {k: v for k, v in _parallel(jobs).items() if v}
    return out
