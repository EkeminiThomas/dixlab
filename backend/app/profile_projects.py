"""From a profile link to the projects worth a case study ("Build from my profile").

A profile link lists the person's strongest projects, so they can pick one and
get a whole case study without typing anything. Free: public APIs only, no AI.

  GitHub        github.com/<user>             original repositories, strongest first
  GitLab        gitlab.com/<user>             original projects
  Hugging Face  huggingface.co/<user>         Spaces and models
  Figma         figma.com/files/team/<id>/…   files in the team's projects (needs a Figma token)
                figma.com/files/project/<id>/…
A link to one project (a repository, a Figma file) is returned as that project."""
import json
import re
import time
from urllib.parse import quote, urlsplit

from . import figma, webread
from .webread import Unreadable

GH = "application/vnd.github+json"
MAX_PROJECTS = 8
FIGMA_TEAM = re.compile(r"^https?://(?:www\.)?figma\.com/files/(?:\d+/)?(team|project)/(\d{3,25})", re.I)
FIGMA_PROFILE = re.compile(r"^https?://(?:www\.)?figma\.com/@", re.I)


class NoProjects(Unreadable):
    """Nothing to list; the message says what to do instead."""


def _json(url: str, accept: str = "application/json"):
    try:
        return json.loads(webread.fetch(url, accept=accept)[0])
    except ValueError:
        raise Unreadable("The site didn’t answer as expected.") from None


def _path(url: str) -> tuple[str, list[str]]:
    p = urlsplit(url)
    return (p.hostname or "").lower().removeprefix("www."), [x for x in p.path.split("/") if x]


def _age_days(iso: str) -> float:
    try:
        return (time.time() - time.mktime(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))) / 86400
    except (ValueError, TypeError):
        return 9999


def _project(title, desc, links, meta, url, kind):
    return {"title": str(title)[:90], "desc": str(desc or "")[:220], "links": [u for u in links if u][:4],
            "meta": [m for m in meta if m][:4], "url": url, "kind": kind}


# ---------------------------------------------------------------- GitHub

def github(user: str) -> list[dict]:
    repos = _json(f"https://api.github.com/users/{quote(user)}/repos?sort=pushed&per_page=100&type=owner", GH)
    if not isinstance(repos, list):
        raise Unreadable("There’s no GitHub user with that name.")
    out = []
    for r in repos:
        name = r.get("name", "").lower() if isinstance(r, dict) else ""
        if not isinstance(r, dict) or r.get("fork") or name in (".github", f"{user.lower()}.github.io"):
            continue
        # A repo named after its owner is usually their profile README; for organisations it's often the main project.
        if name == user.lower() and r.get("stargazers_count", 0) < 10:
            continue
        age = _age_days(r.get("pushed_at", ""))
        score = (r.get("stargazers_count", 0) * 3 + r.get("forks_count", 0) * 2 + (6 if r.get("description") else 0)
                 + (4 if r.get("homepage") else 0) + (5 if age < 365 else 0) + (2 if r.get("topics") else 0)
                 - (6 if r.get("archived") else 0) - (4 if r.get("size", 0) < 20 else 0))
        meta = [r.get("language") or "", f"★ {r['stargazers_count']}" if r.get("stargazers_count") else "",
                f"updated {str(r.get('pushed_at', ''))[:10]}"]
        out.append((score, _project(r.get("name", ""), r.get("description"), [r.get("html_url"), r.get("homepage")], meta,
                                    r.get("html_url"), "GitHub repository")))
    out.sort(key=lambda x: -x[0])
    return [p for _, p in out[:MAX_PROJECTS]]


# ---------------------------------------------------------------- GitLab

def gitlab(user: str) -> list[dict]:
    users = _json(f"https://gitlab.com/api/v4/users?username={quote(user)}")
    if not users:
        raise Unreadable("There’s no GitLab user with that name.")
    projects = _json(f"https://gitlab.com/api/v4/users/{users[0]['id']}/projects?per_page=50&order_by=last_activity_at")
    out = []
    for p in projects if isinstance(projects, list) else []:
        if not isinstance(p, dict) or p.get("forked_from_project"):
            continue
        score = p.get("star_count", 0) * 3 + p.get("forks_count", 0) * 2 + (6 if p.get("description") else 0) \
            + (5 if _age_days(p.get("last_activity_at", "")) < 365 else 0)
        out.append((score, _project(p.get("name", ""), p.get("description"), [p.get("web_url")],
                                    [f"★ {p['star_count']}" if p.get("star_count") else "", f"updated {str(p.get('last_activity_at', ''))[:10]}"],
                                    p.get("web_url"), "GitLab project")))
    out.sort(key=lambda x: -x[0])
    return [p for _, p in out[:MAX_PROJECTS]]


# ---------------------------------------------------------------- Hugging Face

def huggingface(user: str) -> list[dict]:
    out = []
    for kind, api, base in (("Space", "spaces", "https://huggingface.co/spaces/"), ("Model", "models", "https://huggingface.co/")):
        try:
            items = _json(f"https://huggingface.co/api/{api}?author={quote(user)}&sort=likes&limit=10")
        except Unreadable:
            continue
        for m in items if isinstance(items, list) else []:
            rid = m.get("id", "")
            if not rid:
                continue
            out.append((m.get("likes", 0) * 3 + m.get("downloads", 0) / 1000 + (4 if kind == "Space" else 0),
                        _project(rid.split("/")[-1], m.get("cardData", {}).get("title") if isinstance(m.get("cardData"), dict) else "",
                                 [base + rid], [kind, f"♥ {m['likes']}" if m.get("likes") else ""], base + rid, f"Hugging Face {kind.lower()}")))
    if not out:
        raise Unreadable("We found no public Spaces or models for that Hugging Face user.")
    out.sort(key=lambda x: -x[0])
    return [p for _, p in out[:MAX_PROJECTS]]


# ---------------------------------------------------------------- Figma (teams and projects)

def figma_files(kind: str, ident: str, own_token: str | None) -> list[dict]:
    token = figma.token_for(own_token)
    if not token:
        raise NoProjects("Add your Figma access token to list the files in a Figma team or project.")
    if kind == "team":
        projects = (figma._get(f"/teams/{ident}/projects", token).get("projects") or [])[:4]
    else:
        projects = [{"id": ident, "name": ""}]
    out = []
    for pr in projects:
        files = figma._get(f"/projects/{pr['id']}/files", token).get("files") or []
        for f in files:
            if not f.get("key"):
                continue
            link = f"https://www.figma.com/design/{f['key']}/{quote(re.sub(r'[^A-Za-z0-9]+', '-', f.get('name', 'file')).strip('-') or 'file')}"
            out.append((f.get("last_modified", ""), _project(f.get("name", "Figma file"), pr.get("name", ""), [link],
                                                            [f"edited {str(f.get('last_modified', ''))[:10]}"], link, "Figma file")))
    if not out:
        raise NoProjects("That Figma team or project has no files we can open with this token.")
    out.sort(key=lambda x: x[0], reverse=True)  # most recently edited first
    return [p for _, p in out[:MAX_PROJECTS]]


# ---------------------------------------------------------------- which kind of link

def projects(url: str, own_token: str | None = None) -> dict:
    """{platform, owner, projects:[...], single} for a profile or project link. Raises Unreadable."""
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    if figma.parse_url(url):
        return {"platform": "figma", "owner": "", "single": True,
                "projects": [_project("Figma file", "", [url], [], url, "Figma file")]}
    if FIGMA_PROFILE.match(url):
        raise NoProjects("Figma community profiles can’t be read. Paste a link to your Figma team or project "
                         "(open it in Figma and copy the address) or to one file, and add your Figma access token.")
    m = FIGMA_TEAM.match(url)
    if m:
        return {"platform": "figma", "owner": "", "single": False, "projects": figma_files(m.group(1).lower(), m.group(2), own_token)}
    host, path = _path(url)
    if host == "github.com" and path:
        if len(path) >= 2:
            return {"platform": "github", "owner": path[0], "single": True,
                    "projects": [_project(path[1], "", [f"https://github.com/{path[0]}/{path[1]}"], [], url, "GitHub repository")]}
        return {"platform": "github", "owner": path[0], "single": False, "projects": github(path[0])}
    if host == "gitlab.com" and path:
        if len(path) >= 2:
            return {"platform": "gitlab", "owner": path[0], "single": True,
                    "projects": [_project(path[-1], "", [url], [], url, "GitLab project")]}
        return {"platform": "gitlab", "owner": path[0], "single": False, "projects": gitlab(path[0])}
    if host == "huggingface.co" and path:
        if path[0] in ("spaces", "datasets") and len(path) >= 3 or path[0] not in ("spaces", "datasets", "models") and len(path) >= 2:
            return {"platform": "huggingface", "owner": path[1] if path[0] in ("spaces", "datasets") else path[0], "single": True,
                    "projects": [_project(path[-1], "", [url], [], url, "Hugging Face project")]}
        return {"platform": "huggingface", "owner": path[0], "single": False, "projects": huggingface(path[0])}
    raise NoProjects("Paste a GitHub, GitLab or Hugging Face profile, a Figma team or project link, "
                     "or a link to one project.")
