"""A designer's Figma work, for building a portfolio ("From my profiles" → Figma).

Figma community profiles (figma.com/@name) only open for people signed in to
Figma, and its API can't read them. With the person's own access token Figma
does share:
  - who they are: GET /v1/me → name, handle, profile photo;
  - the files in a team or project they link (figma.com/files/team/<id>/… or
    …/project/<id>/…), each with Figma's own thumbnail;
  - what's inside a file (pages, screens, words): figma.read.
So a profile link fills in who they are, and team, project or file links bring
their designs: the strongest few are read in full, and every file's thumbnail
becomes that project's picture. Figma limits file reads, so at most
READ_IN_FULL files are opened per build."""
import re
from concurrent.futures import ThreadPoolExecutor

from . import figma, profile_projects
from .webread import Unreadable

MAX_FILES = 6
READ_IN_FULL = 3
PROFILE = re.compile(r"^https?://(?:www\.)?figma\.com/@([A-Za-z0-9_.\-]{1,60})", re.I)


def is_figma(url: str) -> bool:
    return bool(re.match(r"^https?://(?:www\.)?figma\.com/", url, re.I))


def gather(urls: list[str], own_token: str) -> dict:
    """{text, sources, files: [{title, link, thumb}], me: {name, handle, photo}} for the Figma links."""
    token = figma.token_for(own_token)
    sources, files, me, notes = [], [], {}, []
    for url in urls:
        m = PROFILE.match(url)
        try:
            if m:
                if not own_token.strip():
                    raise Unreadable("Figma profiles only open for people signed in to Figma. Add your Figma access token, "
                                     "and your team link (open your team in Figma and copy the address) to bring in your designs.")
                who = figma._get("/me", figma.token_for(own_token))
                # /v1/me gives {id, email, handle, img_url}; "handle" is their display name. Their email isn't used.
                me = {"name": str(who.get("handle") or "")[:80], "handle": m.group(1)[:60], "photo": str(who.get("img_url") or "")}
                notes.append(f"Figma profile: {me['name'] or me['handle']} (@{me['handle']}).")
                tip = None if any(not PROFILE.match(u) for u in urls if is_figma(u)) else \
                    "Figma doesn’t list a profile’s files to other apps. Add your team link to bring in your designs too."
                sources.append({"url": url, "platform": "figma", "read": True, "tip": tip, "detail": f"@{me['handle']}"})
                continue
            if not token:
                raise Unreadable("Add your Figma access token to read your Figma files.")
            listed = profile_projects.projects(url, own_token)["projects"]
            for p in listed:
                if all(f["link"] != p["links"][0] for f in files):
                    files.append({"title": p["title"] if p["title"] != "Figma file" else "", "link": p["links"][0],
                                  "thumb": p.get("thumb", ""), "team": p.get("desc", "")})
            sources.append({"url": url, "platform": "figma", "read": True, "tip": None,
                            "detail": f"{len(listed)} file{'s' if len(listed) != 1 else ''}"})
        except (Unreadable, figma.FigmaError) as e:
            sources.append({"url": url, "platform": "figma", "read": False, "tip": str(e)})
    files = files[:MAX_FILES]

    def read(f):
        try:
            return figma.read(f["link"], own_token)
        except figma.FigmaError:
            return None
    with ThreadPoolExecutor(max_workers=READ_IN_FULL) as pool:
        infos = list(pool.map(read, files[:READ_IN_FULL]))
    blocks = []
    for i, f in enumerate(files):
        info = infos[i] if i < len(infos) else None
        if info:
            f["title"] = f["title"] or info["name"]
            f["thumb"] = f["thumb"] or info.get("thumbnail", "")
            blocks.append(f"--- Design file \"{f['title']}\" · link: {f['link']}\n{info['text']}")
        else:
            blocks.append(f"--- Design file \"{f['title'] or 'Untitled'}\" · link: {f['link']}"
                          + (f" · in the Figma project \"{f['team']}\"" if f.get("team") else "") + " (only its name is known)")
    text = "\n".join(notes)
    if blocks:
        heading = ("THEIR FIGMA DESIGN FILES (their own design work: each is a portfolio project, "
                   "and its project link must be the file's link)")
        text += ("\n\n" if text else "") + heading + "\n" + "\n\n".join(blocks)
    return {"text": text.strip(), "sources": sources, "files": files, "me": me}
