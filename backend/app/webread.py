"""Reading public web pages for the AI assistant: job adverts and people's
profiles (GitHub, LinkedIn, X, personal sites).

The server fetches the pages itself, so a pasted link must never become a way
to reach private machines (server-side request forgery). Every address,
including each redirect, must resolve only to public IP addresses on ports 80
or 443; local, private, link-local (cloud metadata) and reserved ranges are
refused. Requests send no cookies or credentials, give up after a few seconds,
and read at most MAX_BYTES of text.

(A host could still change its DNS answer between the check and the request; the
check plus the short timeout and text-only reading keep that risk small. On a
production server, also block private ranges at the firewall for this process.)

GitHub profiles are read through GitHub's public API: the repository list and
the READMEs of the strongest repositories, which say far more than the HTML."""
import ipaddress
import json
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

MAX_BYTES = 1_500_000
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
MAX_REDIRECTS = 3
USER_AGENT = "DixlabBot/1.0"  # short: some sites (e.g. Dev.to) refuse longer bot names
TEXT_TYPES = ("text/html", "text/plain", "application/xhtml+xml", "application/json",
              "application/rss+xml", "application/atom+xml", "application/xml", "text/xml",
              "application/vnd.github")  # GitHub serves READMEs as application/vnd.github.raw


class Unreadable(Exception):
    """A page that couldn't be read; the message is safe to show."""


# ---------------------------------------------------------------- safety

def _public(host: str, port: int) -> bool:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        return False
    if not infos:
        return False
    for info in infos:
        ip = ipaddress.ip_address(str(info[4][0]).split("%")[0])  # drop an IPv6 zone ("fe80::1%eth0")
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:  # "::ffff:10.0.0.1" is really 10.0.0.1
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            return False
    return True


def check_url(url: str) -> str:
    """The URL if it's safe to fetch, else raise Unreadable."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise Unreadable("Only http and https links can be read.")
    if parts.username or parts.password:
        raise Unreadable("Links with a username or password can’t be read.")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in (80, 443):
        raise Unreadable("Only links on the standard web ports can be read.")
    if not _public(parts.hostname, port):
        raise Unreadable("That address isn’t a public website.")
    return url


# ---------------------------------------------------------------- fetching

def fetch(url: str, accept: str = "text/html,text/plain;q=0.9,*/*;q=0.1") -> tuple[str, str]:
    """(text, content type) of a public page, following a few checked redirects."""
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    from . import config
    if config.GITHUB_TOKEN and urlsplit(url).hostname == "api.github.com":
        # Optional: raises GitHub's limit from 60 to 5,000 requests an hour for this server.
        headers["Authorization"] = f"Bearer {config.GITHUB_TOKEN}"
    with httpx.Client(timeout=TIMEOUT, follow_redirects=False, trust_env=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            check_url(url)
            try:
                with client.stream("GET", url, headers=headers) as r:
                    if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                        url = urljoin(url, r.headers["location"])
                        continue
                    if r.status_code in (401, 403, 999):
                        raise Unreadable("The page needs a login.")
                    if r.status_code == 404:
                        raise Unreadable("The page wasn’t found.")
                    if r.status_code != 200:
                        raise Unreadable(f"The site answered {r.status_code}.")
                    ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                    if ctype and not ctype.startswith(TEXT_TYPES):
                        raise Unreadable("That link isn’t a web page.")
                    data = bytearray()
                    for chunk in r.iter_bytes():
                        data += chunk
                        if len(data) > MAX_BYTES:
                            break
                    return bytes(data[:MAX_BYTES]).decode(r.encoding or "utf-8", errors="replace"), ctype
            except httpx.HTTPError:
                raise Unreadable("The site didn’t respond.") from None
    raise Unreadable("Too many redirects.")


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "head"}
    BLOCK = {"p", "div", "section", "article", "li", "ul", "ol", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "header", "footer", "main"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.title, self.meta = [], 0, "", ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            a = dict(attrs)
            if (a.get("name") or a.get("property") or "").lower() in ("description", "og:description") and not self.meta:
                self.meta = a.get("content") or ""
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self.skip:
            self.out.append(data)


def html_to_text(html: str) -> str:
    p = _Text()
    try:
        p.feed(html)
    except Exception:  # malformed HTML: keep what was parsed
        pass
    body = re.sub(r"[ \t\r\f\v]+", " ", "".join(p.out))
    body = re.sub(r"\n\s*\n+", "\n", body).strip()
    head = "\n".join(x for x in (p.title.strip(), p.meta.strip()) if x)
    return (head + "\n\n" + body).strip() if head else body


def page_text(url: str, limit: int) -> str:
    text, ctype = fetch(url)
    if ctype in ("text/html", "application/xhtml+xml") or text.lstrip()[:1] == "<":
        text = html_to_text(text)
    text = text.strip()
    if len(text) < 80:
        raise Unreadable("The page has almost no text (it may need a login, or build itself with JavaScript).")
    return text[:limit]


# ---------------------------------------------------------------- GitHub

GITHUB_USER = re.compile(r"^https?://(?:www\.)?github\.com/([A-Za-z0-9-]{1,39})/?$")


def github_text(user: str, limit: int) -> str:
    """A GitHub profile as text: the profile, the repositories, and READMEs of the strongest few."""
    api = "application/vnd.github+json"
    try:
        profile = json.loads(fetch(f"https://api.github.com/users/{user}", accept=api)[0])
        repos = json.loads(fetch(f"https://api.github.com/users/{user}/repos?sort=pushed&per_page=30", accept=api)[0])
    except (ValueError, Unreadable) as e:
        raise Unreadable(str(e) if isinstance(e, Unreadable) else "GitHub didn’t answer as expected.") from None
    lines = [f"GitHub profile: {profile.get('name') or user} (@{user})"]
    for k in ("bio", "company", "location", "blog"):
        if profile.get(k):
            lines.append(f"{k.title()}: {profile[k]}")
    lines.append(f"Public repositories: {profile.get('public_repos', len(repos))}, followers: {profile.get('followers', 0)}")
    own = [r for r in repos if isinstance(r, dict) and not r.get("fork")]
    own.sort(key=lambda r: (r.get("stargazers_count", 0) * 3 + r.get("forks_count", 0), r.get("pushed_at", "")), reverse=True)
    lines.append("\nRepositories (original, strongest first):")
    for r in own[:15]:
        bits = [r.get("name", ""), r.get("description") or "", r.get("language") or "",
                f"{r.get('stargazers_count', 0)} stars", f"updated {str(r.get('pushed_at', ''))[:10]}"]
        if r.get("topics"):
            bits.append("topics: " + ", ".join(r["topics"][:6]))
        if r.get("homepage"):
            bits.append(f"site: {r['homepage']}")
        lines.append("- " + " · ".join(b for b in bits if b) + f" · https://github.com/{user}/{r.get('name', '')}")
    text = "\n".join(lines)
    for r in own[:4]:  # the READMEs say what the work is and how it was approached
        if len(text) > limit * 0.8:
            break
        try:
            readme = fetch(f"https://api.github.com/repos/{user}/{r.get('name', '')}/readme", accept="application/vnd.github.raw")[0]
        except Unreadable:
            continue
        readme = re.sub(r"!\[[^\]]*\]\([^)]*\)|<img[^>]*>|<[^>]+>", "", readme)  # drop images and HTML
        readme = re.sub(r"\n\s*\n+", "\n", readme).strip()
        text += f"\n\nREADME of {r.get('name')}:\n{readme[:1600]}"
    return text[:limit]


# ---------------------------------------------------------------- what the routes use

def platform(url: str) -> str:
    from . import profile_readers
    return profile_readers.platform(url)


def gather(urls: list[str], budget: int = 10000) -> tuple[str, list[dict]]:
    """Read each link (GitHub, GitLab, Stack Overflow, Hugging Face, ORCID, Credly, Medium,
    Dev.to, Hashnode, any public page). Returns (all the text, one {url, platform, read, tip} per link)."""
    from . import profile_readers
    if not urls:
        return "", []
    each = max(2000, budget // len(urls))

    def one(url):
        p = profile_readers.platform(url)
        try:
            return p, profile_readers.read(url, each), None
        except Unreadable as e:
            return p, None, str(e).strip()

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=min(5, len(urls))) as pool:  # read every link at once, in the given order
        results = list(pool.map(one, urls))
    parts, sources = [], []
    for url, (p, text, reason) in zip(urls, results):
        if text is not None:
            parts.append(f"=== {url}\n{text}")
            sources.append({"url": url, "platform": p, "read": True, "tip": None})
        else:
            tip = profile_readers.TIPS.get(p, profile_readers.TIPS["web"])
            sources.append({"url": url, "platform": p, "read": False,
                            "tip": tip if p in ("linkedin", "x") or reason == tip else f"{reason} {tip}".strip()})
    return "\n\n".join(parts), sources
