"""Reading people's public profiles for the AI assistant ("From my profiles",
and "about you" when building a CV for a job).

Each platform is read through its public API or feed: no login, no keys. All
requests go through webread.fetch, so the same safety rules apply (public
addresses only, short timeouts, size limits).

  GitHub         api.github.com          repositories + READMEs (webread.github_text)
  GitLab         gitlab.com/api/v4       profile, projects, READMEs
  Stack Overflow api.stackexchange.com   reputation, top tags, best-answered questions
  Hugging Face   huggingface.co/api      models, datasets, Spaces
  ORCID          pub.orcid.org/v3.0      employment, education, publications, awards
  Credly         credly.com/users/*/badges.json   certifications (issuer, date, skills)
  Medium         medium.com/feed/@user   articles and topics
  Dev.to         dev.to/api              articles, tags, reactions
  Hashnode       <blog>/rss.xml          articles (Hashnode retired its public API)
  anything else  the page's text

LinkedIn and X need a login, so they aren't read: people paste text from them."""
import html
import json
import re
from urllib.parse import quote, urlsplit

from . import webread
from .webread import Unreadable

JSON = "application/json"


def _json(url: str):
    try:
        return json.loads(webread.fetch(url, accept=JSON)[0])
    except ValueError:
        raise Unreadable("The site didn’t answer as expected.") from None


def _parallel(jobs: dict) -> dict:
    """Run independent reads at once. A job that can't be read is simply missing from the result."""
    from concurrent.futures import ThreadPoolExecutor
    out = {}
    with ThreadPoolExecutor(max_workers=min(6, len(jobs) or 1)) as pool:
        futures = {name: pool.submit(fn) for name, fn in jobs.items()}
        for name, fut in futures.items():
            try:
                out[name] = fut.result()
            except Unreadable:
                pass
    return out


def _host_path(url: str) -> tuple[str, list[str]]:
    parts = urlsplit(url)
    return (parts.hostname or "").lower().removeprefix("www."), [p for p in parts.path.split("/") if p]


def _clip(text: str, n: int) -> str:
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(text or "")))).strip()
    return text if len(text) <= n else text[:n].rsplit(" ", 1)[0] + "…"


# ---------------------------------------------------------------- which platform

def platform(url: str) -> str:
    host, path = _host_path(url)
    if host.endswith("linkedin.com"):
        return "linkedin"
    if host in ("x.com", "twitter.com", "mobile.twitter.com"):
        return "x"
    if host == "github.com":
        return "github"
    if host == "gitlab.com":
        return "gitlab"
    if host == "figma.com" or host.endswith(".figma.com"):
        return "figma"
    if host == "stackoverflow.com":
        return "stackoverflow"
    if host == "huggingface.co":
        return "huggingface"
    if host == "orcid.org":
        return "orcid"
    if host == "credly.com":
        return "credly"
    if host == "medium.com" or host.endswith(".medium.com"):
        return "medium"
    if host == "dev.to":
        return "devto"
    if host.endswith(".hashnode.dev") or host == "hashnode.com":
        return "hashnode"
    return "web"


TIPS = {
    "linkedin": "LinkedIn only shows profiles to signed-in members, so it can’t be read. Copy your About and Experience sections into the text box instead.",
    "x": "X only shows posts to signed-in members, so it can’t be read. Paste your bio and a few posts into the text box instead.",
    "github": "Check the username is right and the profile is public.",
    "gitlab": "Check the username is right and your profile and projects are public.",
    "stackoverflow": "Use your profile link, like stackoverflow.com/users/1234567/yourname.",
    "huggingface": "Check the username is right.",
    "orcid": "Use your ORCID iD, like 0000-0002-1825-0097, and make your record public.",
    "credly": "Use your profile link, like credly.com/users/your-name, and make your profile public in Credly’s settings.",
    "medium": "Use your profile link, like medium.com/@yourname.",
    "devto": "Check the username is right.",
    "hashnode": "Use your blog’s address, like yourname.hashnode.dev or your own domain.",
    "figma": "Use a Figma file or prototype link, and set sharing to “Anyone with the link can view”.",
    "web": "The page may need a login, or build itself with JavaScript. Paste the text instead.",
}


# ---------------------------------------------------------------- readers

def gitlab(url: str, limit: int) -> str:
    _, path = _host_path(url)
    if not path:
        raise Unreadable("Add your GitLab username.")
    users = _json(f"https://gitlab.com/api/v4/users?username={quote(path[0])}")
    if not users:
        raise Unreadable("There’s no GitLab user with that name.")
    u = users[0]  # the full profile (/users/:id) now needs a login; the lookup and projects stay public
    lines = [f"GitLab profile: {u.get('name') or path[0]} (@{u.get('username') or path[0]})"]
    projects = _json(f"https://gitlab.com/api/v4/users/{users[0]['id']}/projects?per_page=30&order_by=last_activity_at")
    own = [p for p in projects if isinstance(p, dict) and not p.get("forked_from_project")]
    own.sort(key=lambda p: (p.get("star_count", 0) * 3 + p.get("forks_count", 0), p.get("last_activity_at", "")), reverse=True)
    lines.append("\nProjects (original, strongest first):")
    for p in own[:12]:
        bits = [p.get("name", ""), _clip(p.get("description") or "", 200), f"{p.get('star_count', 0)} stars",
                f"updated {str(p.get('last_activity_at', ''))[:10]}"]
        if p.get("topics"):
            bits.append("topics: " + ", ".join(p["topics"][:6]))
        lines.append("- " + " · ".join(b for b in bits if b) + f" · {p.get('web_url', '')}")
    text = "\n".join(lines)
    for p in own[:3]:
        if len(text) > limit * 0.8:
            break
        try:
            readme = webread.fetch(f"https://gitlab.com/api/v4/projects/{p['id']}/repository/files/README.md/raw"
                                   f"?ref={quote(p.get('default_branch') or 'main')}", accept="text/plain")[0]
        except Unreadable:
            continue
        text += f"\n\nREADME of {p.get('name')}:\n{_clip(readme, 1400)}"
    return text[:limit]


def stackoverflow(url: str, limit: int) -> str:
    _, path = _host_path(url)
    if len(path) < 2 or path[0] != "users" or not path[1].isdigit():
        raise Unreadable(TIPS["stackoverflow"])
    uid = path[1]
    api = "https://api.stackexchange.com/2.3"
    items = _json(f"{api}/users/{uid}?site=stackoverflow").get("items") or []
    if not items:
        raise Unreadable("There’s no Stack Overflow user with that link.")
    u = items[0]
    b = u.get("badge_counts") or {}
    lines = [f"Stack Overflow profile: {html.unescape(u.get('display_name', ''))}",
             f"Reputation: {u.get('reputation', 0):,} · badges: {b.get('gold', 0)} gold, {b.get('silver', 0)} silver, {b.get('bronze', 0)} bronze"]
    if u.get("location"):
        lines.append(f"Location: {html.unescape(u['location'])}")
    tags = _json(f"{api}/users/{uid}/top-tags?site=stackoverflow&pagesize=12").get("items") or []
    if tags:
        lines.append("Top tags (answers / answer score): " + ", ".join(
            f"{t['tag_name']} ({t.get('answer_count', 0)} / {t.get('answer_score', 0)})" for t in tags))
    answers = _json(f"{api}/users/{uid}/answers?site=stackoverflow&sort=votes&order=desc&pagesize=8").get("items") or []
    ids = ";".join(str(a["question_id"]) for a in answers if a.get("question_id"))
    if ids:
        qs = {q["question_id"]: q for q in _json(f"{api}/questions/{ids}?site=stackoverflow").get("items") or []}
        lines.append("\nBest-received answers (questions they solved):")
        for a in answers:
            q = qs.get(a.get("question_id"))
            if q:
                lines.append(f"- {html.unescape(q.get('title', ''))} · answer score {a.get('score', 0)}"
                             + (" · accepted" if a.get("is_accepted") else "") + f" · tags: {', '.join(q.get('tags', [])[:5])}")
    return "\n".join(lines)[:limit]


def huggingface(url: str, limit: int) -> str:
    _, path = _host_path(url)
    if not path:
        raise Unreadable("Add your Hugging Face username.")
    user = path[0]
    lines = [f"Hugging Face profile: {user}"]
    try:
        o = _json(f"https://huggingface.co/api/users/{quote(user)}/overview")
        if o.get("fullname"):
            lines[0] = f"Hugging Face profile: {o['fullname']} (@{user})"
        counts = [f"{o[k]} {label}" for k, label in (("numModels", "models"), ("numDatasets", "datasets"), ("numSpaces", "Spaces"),
                                                    ("numFollowers", "followers")) if o.get(k)]
        if counts:
            lines.append(", ".join(counts))
    except Unreadable:
        pass  # organisations have no user overview; their models still list below
    found = False
    for kind, sort in (("models", "downloads"), ("datasets", "downloads"), ("spaces", "likes")):
        rows = _json(f"https://huggingface.co/api/{kind}?author={quote(user)}&sort={sort}&direction=-1&limit=8")
        if not rows:
            continue
        found = True
        lines.append(f"\n{kind.title()}:")
        for r in rows:
            bits = [r.get("id", ""), r.get("pipeline_tag") or "", f"{r.get('downloads', 0):,} downloads" if kind != "spaces" else "",
                    f"{r.get('likes', 0)} likes"]
            lines.append("- " + " · ".join(b for b in bits if b) + f" · https://huggingface.co/{'' if kind == 'models' else kind + '/'}{r.get('id', '')}")
    if not found and len(lines) == 1:
        raise Unreadable("There’s nothing public on that Hugging Face profile.")
    return "\n".join(lines)[:limit]


ORCID_ID = re.compile(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]")


def orcid(url: str, limit: int) -> str:
    m = ORCID_ID.search(url)
    if not m:
        raise Unreadable(TIPS["orcid"])
    r = _json(f"https://pub.orcid.org/v3.0/{m.group(0)}/record")
    v = lambda o, *keys: _dig(o, *keys)  # noqa: E731
    person = r.get("person") or {}
    name = " ".join(x for x in (v(person, "name", "given-names", "value"), v(person, "name", "family-name", "value")) if x)
    lines = [f"ORCID record: {name or m.group(0)}"]
    if v(person, "biography", "content"):
        lines.append(f"Biography: {_clip(v(person, 'biography', 'content'), 500)}")
    keywords = [k.get("content") for k in (v(person, "keywords", "keyword") or []) if k.get("content")]
    if keywords:
        lines.append("Keywords: " + ", ".join(keywords[:15]))
    acts = r.get("activities-summary") or {}
    for section, key, label in (("employments", "employment-summary", "Employment"), ("educations", "education-summary", "Education"),
                                ("qualifications", "qualification-summary", "Qualifications"), ("distinctions", "distinction-summary", "Awards"),
                                ("memberships", "membership-summary", "Memberships"), ("invited-positions", "invited-position-summary", "Invited positions")):
        rows = []
        for group in v(acts, section, "affiliation-group") or []:
            for s in group.get("summaries") or []:
                e = s.get(key) or {}
                when = "–".join(x for x in (v(e, "start-date", "year", "value"), v(e, "end-date", "year", "value") or ("Present" if v(e, "start-date", "year", "value") else "")) if x)
                place = ", ".join(x for x in (v(e, "organization", "address", "city"), v(e, "organization", "address", "country")) if x)
                rows.append("- " + " · ".join(x for x in (e.get("role-title"), e.get("department-name"), v(e, "organization", "name"), place, when) if x))
        if rows:
            lines.append(f"\n{label}:")
            lines += rows[:10]
    works = []
    for group in v(acts, "works", "group") or []:
        w = (group.get("work-summary") or [{}])[0]
        title = v(w, "title", "title", "value")
        if title:
            works.append("- " + " · ".join(x for x in (title, v(w, "journal-title", "value"), (w.get("type") or "").replace("-", " ").lower(),
                                                       v(w, "publication-date", "year", "value")) if x))
    if works:
        lines.append(f"\nPublications and works ({len(works)}):")
        lines += works[:15]
    return "\n".join(lines)[:limit]


def _dig(obj, *keys):
    for k in keys:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj


def credly(url: str, limit: int) -> str:
    _, path = _host_path(url)
    if len(path) < 2 or path[0] != "users":
        raise Unreadable(TIPS["credly"])
    data = _json(f"https://www.credly.com/users/{quote(path[1])}/badges.json")
    badges = data.get("data") if isinstance(data, dict) else data
    if not badges:
        raise Unreadable("No public badges on that Credly profile.")
    lines = [f"Credly certifications and badges ({len(badges)}):"]
    for b in badges[:20]:
        t = b.get("badge_template") or {}
        issuer = _dig(b, "issuer", "summary") or ", ".join(
            _dig(e, "entity", "name") or "" for e in (_dig(b, "issuer", "entities") or []) if _dig(e, "entity", "name"))
        skills = [s.get("name") if isinstance(s, dict) else str(s) for s in (t.get("skills") or [])]
        bits = [t.get("name") or b.get("name") or "", issuer.replace("issued by ", "") if issuer else "",
                f"issued {str(b.get('issued_at_date') or b.get('issued_at') or '')[:10]}" if (b.get("issued_at_date") or b.get("issued_at")) else "",
                f"expires {str(b.get('expires_at_date'))[:10]}" if b.get("expires_at_date") else "",
                "skills: " + ", ".join(s for s in skills[:6] if s) if skills else ""]
        lines.append("- " + " · ".join(x for x in bits if x))
    return "\n".join(lines)[:limit]


def _rss(xml: str, source: str, limit: int) -> str:
    """Titles, dates and topics from an RSS feed (no XML parser: feeds are untrusted)."""
    def field(block, tag):
        m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", block, re.S | re.I)
        return _clip(re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", m.group(1), flags=re.S), 300) if m else ""
    channel = xml.split("<item", 1)[0]
    lines = [f"{source}: {field(channel, 'title')}"]
    if field(channel, "description"):
        lines.append(f"About: {field(channel, 'description')}")
    items = re.findall(r"<item\b.*?</item>", xml, re.S | re.I)
    if not items:
        raise Unreadable("That feed has no articles yet.")
    lines.append(f"\nArticles ({len(items)} recent):")
    for it in items[:15]:
        cats = [_clip(re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", c, flags=re.S), 40) for c in re.findall(r"<category[^>]*>(.*?)</category>", it, re.S)]
        bits = [field(it, "title"), field(it, "pubDate")[:16], "topics: " + ", ".join(cats[:5]) if cats else ""]
        lines.append("- " + " · ".join(b for b in bits if b))
    return "\n".join(lines)[:limit]


def medium(url: str, limit: int) -> str:
    host, path = _host_path(url)
    if host == "medium.com" and path and path[0].startswith("@"):
        feed = f"https://medium.com/feed/{path[0]}"
    elif host.endswith(".medium.com"):
        feed = f"https://{host}/feed"
    else:
        raise Unreadable(TIPS["medium"])
    return _rss(webread.fetch(feed, accept="application/rss+xml, text/xml")[0], "Medium", limit)


def devto(url: str, limit: int) -> str:
    _, path = _host_path(url)
    if not path:
        raise Unreadable("Add your Dev.to username.")
    user = path[0]
    lines = [f"Dev.to profile: {user}"]
    try:
        u = _json(f"https://dev.to/api/users/by_username?url={quote(user)}")
        lines[0] = f"Dev.to profile: {u.get('name') or user} (@{user})"
        for key, label in (("summary", "Bio"), ("location", "Location"), ("website_url", "Website"), ("github_username", "GitHub")):
            if u.get(key):
                lines.append(f"{label}: {_clip(u[key], 300)}")
    except Unreadable:
        pass
    articles = _json(f"https://dev.to/api/articles?username={quote(user)}&per_page=20")
    if not articles:
        raise Unreadable("No public articles on that Dev.to profile.")
    lines.append(f"\nArticles ({len(articles)}):")
    for a in sorted(articles, key=lambda a: a.get("public_reactions_count", 0), reverse=True)[:15]:
        lines.append("- " + " · ".join(b for b in (a.get("title", ""), _clip(a.get("description") or "", 160),
                                                  f"{a.get('public_reactions_count', 0)} reactions", str(a.get("published_at", ""))[:10],
                                                  "tags: " + ", ".join(a.get("tag_list") or [])) if b))
    return "\n".join(lines)[:limit]


def hashnode(url: str, limit: int) -> str:
    host, _ = _host_path(url)
    if host == "hashnode.com":
        raise Unreadable(TIPS["hashnode"])  # a profile page doesn't say where the blog lives
    return _rss(webread.fetch(f"https://{host}/rss.xml", accept="application/rss+xml, text/xml")[0], "Hashnode blog", limit)


# ---------------------------------------------------------------- projects (for case studies)

def github_repo(owner: str, repo: str, limit: int) -> str:
    """One GitHub repository: what it is, the stack, signs of use, releases, and its README."""
    api = f"https://api.github.com/repos/{quote(owner)}/{quote(repo)}"
    r = _json(api)
    if not isinstance(r, dict) or r.get("message") == "Not Found":
        raise Unreadable("That repository isn’t public, or the link is wrong.")
    api = r.get("url") or api  # its current address: a renamed or moved repo would redirect every call
    lines = [f"GitHub repository: {r.get('full_name') or owner + '/' + repo}"]
    for key, label in (("description", "Description"), ("homepage", "Live site"), ("license", "License")):
        val = r.get(key)
        if isinstance(val, dict):
            val = val.get("name")
        if val:
            lines.append(f"{label}: {_clip(val, 300)}")
    lines.append(f"Stars: {r.get('stargazers_count', 0)} · forks: {r.get('forks_count', 0)} · open issues: {r.get('open_issues_count', 0)}"
                 f" · created {str(r.get('created_at', ''))[:10]} · last push {str(r.get('pushed_at', ''))[:10]}")
    if r.get("topics"):
        lines.append("Topics: " + ", ".join(r["topics"][:10]))
    # The follow-up calls don't depend on each other: run them at once (each round trip can take seconds).
    def readme():
        raw = webread.fetch(f"{api}/readme", accept="application/vnd.github.raw")[0]
        return re.sub(r"!\[[^\]]*\]\([^)]*\)|<img[^>]*>", "", raw)
    got = _parallel({"langs": lambda: _json(f"{api}/languages"), "people": lambda: _json(f"{api}/contributors?per_page=10"),
                     "releases": lambda: _json(f"{api}/releases?per_page=5"), "readme": readme})
    langs, people, releases = got.get("langs"), got.get("people"), got.get("releases")
    if isinstance(langs, dict) and langs:
        total = sum(langs.values()) or 1
        lines.append("Languages: " + ", ".join(f"{k} {round(v * 100 / total)}%" for k, v in list(langs.items())[:6]))
    if isinstance(people, list) and people:
        lines.append(f"Contributors (top {len(people)}): " + ", ".join(f"{c.get('login')} ({c.get('contributions')} commits)" for c in people[:6]))
    if isinstance(releases, list) and releases:
        lines.append("Recent releases: " + "; ".join(f"{x.get('name') or x.get('tag_name')} ({str(x.get('published_at', ''))[:10]})" for x in releases))
    text = "\n".join(lines)
    if got.get("readme"):
        text += "\n\nREADME:\n" + _clip(got["readme"], max(1500, limit - len(text) - 200))
    return text[:limit]


def gitlab_project(path: str, limit: int) -> str:
    api = f"https://gitlab.com/api/v4/projects/{quote(path, safe='')}"
    r = _json(api)
    lines = [f"GitLab project: {r.get('name_with_namespace') or path}"]
    if r.get("description"):
        lines.append(f"Description: {_clip(r['description'], 400)}")
    lines.append(f"Stars: {r.get('star_count', 0)} · forks: {r.get('forks_count', 0)} · created {str(r.get('created_at', ''))[:10]}"
                 f" · last activity {str(r.get('last_activity_at', ''))[:10]}")
    if r.get("topics"):
        lines.append("Topics: " + ", ".join(r["topics"][:10]))
    try:
        langs = _json(f"{api}/languages")
        lines.append("Languages: " + ", ".join(f"{k} {round(v)}%" for k, v in list(langs.items())[:6]))
    except Unreadable:
        pass
    text = "\n".join(lines)
    try:
        readme = webread.fetch(f"{api}/repository/files/README.md/raw?ref={quote(r.get('default_branch') or 'main')}", accept="text/plain")[0]
        text += "\n\nREADME:\n" + _clip(readme, max(1500, limit - len(text) - 200))
    except Unreadable:
        pass
    return text[:limit]


FIGMA_FILE = re.compile(r"^https?://(?:www\.)?figma\.com/(file|design|proto|board|slides|deck)/[A-Za-z0-9]+", re.I)


def figma(url: str, limit: int) -> str:
    """A Figma file's title (its contents need the owner's login). It's embedded in the case study as well."""
    if not FIGMA_FILE.match(url):
        raise Unreadable("Use a link to a Figma file or prototype (figma.com/design/… or figma.com/proto/…).")
    o = _json(f"https://www.figma.com/api/oembed?url={quote(url, safe='')}")
    if not o.get("title"):
        raise Unreadable("Figma didn’t share that file. Check its share settings allow anyone with the link to view.")
    kind = re.search(r"figma\.com/(\w+)/", url, re.I).group(1).lower()
    return (f"Figma {'prototype' if kind == 'proto' else 'design file'}: \"{o['title']}\" ({url}). "
            "It is embedded live in the case study. Its contents aren’t readable here, so use its title only as context.")[:limit]


READERS = {"gitlab": gitlab, "stackoverflow": stackoverflow, "huggingface": huggingface, "orcid": orcid,
           "credly": credly, "medium": medium, "devto": devto, "hashnode": hashnode, "figma": figma}


def read(url: str, limit: int) -> str:
    """The profile behind a link, as text for the AI. Raises Unreadable with a reason."""
    p = platform(url)
    if p in ("linkedin", "x"):
        raise Unreadable(TIPS[p])  # login walls: never fetched
    if p == "github":
        _, path = _host_path(url)
        if len(path) >= 2:
            return github_repo(path[0], path[1].removesuffix(".git"), limit)  # a project: github.com/owner/repo
        m = webread.GITHUB_USER.match(url)
        if not m:
            raise Unreadable("Use your GitHub profile link, like github.com/yourname, or a repository link.")
        return webread.github_text(m.group(1), limit)
    if p == "gitlab":
        _, path = _host_path(url)
        if len(path) >= 2 and path[1] != "-":
            return gitlab_project("/".join(path[:path.index("-")] if "-" in path else path), limit)
    if p in READERS:
        return READERS[p](url, limit)
    return webread.page_text(url, limit)
