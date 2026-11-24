"""Building a portfolio from Figma: a profile link fills in who they are, team / project /
file links bring their designs, and each file's thumbnail becomes its project's picture."""
import struct

from test_api import client, sign_up  # sets up the test database and environment first

from app import ai, config as cfg, figma, figma_portfolio, project_images, webread
from app.admin import cli as admin_cli
from app.routers import assist


def png(w=1200, h=800):
    return b"\x89PNG\r\n\x1a\n" + b"\0\0\0\rIHDR" + struct.pack(">II", w, h) + b"\x08\x06\0\0\0" + b"\0" * 200


def fake_get(path, token, params=None):
    if path == "/me":
        return {"id": "1", "email": "ada@example.com", "handle": "Ada Obi", "img_url": "https://s3.example/ada.png"}
    if path.startswith("/teams/"):
        return {"projects": [{"id": "77", "name": "Client work"}]}
    if path.startswith("/projects/"):
        return {"files": [
            {"key": "AbCdEfGhIj12", "name": "Clinic booking", "last_modified": "2026-10-02T10:00:00Z", "thumbnail_url": "https://s3.example/clinic.png"},
            {"key": "ZyXwVuTsRq98", "name": "Ledger app", "last_modified": "2026-09-01T10:00:00Z", "thumbnail_url": "https://s3.example/ledger.png"}]}
    raise AssertionError(path)


def fake_read(url, own_token=None):
    return {"name": "Clinic booking" if "AbCd" in url else "Ledger app", "thumbnail": "", "text": f"Figma design file: pages Research, Final UI ({url})"}


def test_a_figma_profile_without_a_token_explains_what_to_do():
    got = figma_portfolio.gather(["https://www.figma.com/@ada"], "")
    assert got["sources"][0]["read"] is False and "access token" in got["sources"][0]["tip"] and "team link" in got["sources"][0]["tip"]


def test_figma_links_become_design_projects_with_pictures(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "")
    monkeypatch.setattr(figma, "_get", fake_get)
    monkeypatch.setattr(figma, "read", fake_read)
    downloaded = []

    def download(url, client, deadline=None, min_width=480):
        downloaded.append((url, min_width))
        return (png(400, 400) if "ada.png" in url else png()), "png", "image/png"
    monkeypatch.setattr(project_images, "download", download)
    monkeypatch.setattr(webread, "gather", lambda urls, budget: ("", []))
    prompts = []

    def parse(schema, system, content, max_tokens=4000, effort="low"):
        prompts.append((system, content))
        return schema(name="", role="Product designer", tagline="Calm software for small businesses", summary="I design booking and money apps.",
                      skills=["Figma"], experience=[], education=[], certs=[], languages=[], website="", insights=[],
                      projects=[{"title": "Clinic booking", "desc": "Booking in under a minute.", "link": "https://www.figma.com/design/AbCdEfGhIj12/x",
                                 "role": "Designer", "year": "2026", "tools": ["Figma"], "details": ""}]), None
    monkeypatch.setattr(ai, "parse", parse)
    c = client(); h = sign_up(c, "figma-folio@example.com")
    admin_cli.main(["credits", "figma-folio@example.com", "100"])
    r = c.post("/api/assist/profiles", json={"kind": "portfolio", "figmaToken": "figd_" + "x" * 30,
                                              "urls": ["https://www.figma.com/@ada", "https://www.figma.com/files/team/1234567/Ada"]}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    d = body["draft"]
    system, content = prompts[0]
    assert "Figma design files are their own design work" in system
    assert "Figma profile: Ada Obi (@ada)" in content and "Clinic booking" in content and "Ledger app" in content
    assert d["name"] == "Ada Obi" and d["photo"].startswith("/uploads/")                      # from the Figma profile
    titles = [p["title"] for p in d["projects"]]
    assert titles == ["Clinic booking", "Ledger app"]                                           # a file the AI left out is added
    assert all(p["media"][0]["src"].startswith("/uploads/") for p in d["projects"])          # each with its thumbnail
    assert d["projects"][0]["link"].startswith("https://www.figma.com/design/AbCdEfGhIj12/")
    assert ("https://s3.example/ada.png", 96) in downloaded                                    # a small photo is fine
    assert [s["detail"] for s in body["sources"]] == ["@ada", "2 files"]
    # The pictures are the person's uploads: they're served.
    assert c.get(d["photo"]).status_code == 200


def test_cvs_dont_read_figma(monkeypatch):
    """Figma is for portfolios: a CV build reads the other links and leaves Figma alone."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(figma_portfolio, "gather", lambda *a: (_ for _ in ()).throw(AssertionError("not for CVs")))
    gathered = []
    monkeypatch.setattr(webread, "gather", lambda urls, budget: (gathered.extend(urls) or "=== x | GitHub profile", []))
    monkeypatch.setattr(ai, "parse", lambda schema, *a, **k: (schema(
        name="Ada", role="Developer", tagline="", summary="", skills=[], experience=[], education=[], projects=[], certs=[],
        languages=[], website="", insights=[]), None))
    c = client(); h = sign_up(c, "figma-cv@example.com")
    admin_cli.main(["credits", "figma-cv@example.com", "100"])
    r = c.post("/api/assist/profiles", json={"kind": "cv", "urls": ["https://github.com/ada", "https://www.figma.com/@ada"]}, headers=h)
    assert r.status_code == 200, r.text
    assert "figmaToken" in assist.ProfilesIn.model_fields and gathered[0] == "https://github.com/ada"


def test_github_and_website_projects_get_a_picture(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(webread, "gather", lambda urls, budget: ("=== https://github.com/ada\nGitHub profile", [{"url": u, "platform": "github", "read": True, "tip": None} for u in urls]))
    asked = []

    def collect(urls):
        asked.append(urls[0])
        return [] if "nothing" in urls[0] else [{"data": png(), "ext": "png", "ctype": "image/png", "caption": "", "from": "readme"}]
    monkeypatch.setattr(project_images, "collect", collect)
    projects = [{"title": "Ledger", "desc": "Bookkeeping.", "link": "github.com/ada/ledger", "role": "Creator", "year": "", "tools": ["Go"], "details": ""},
                {"title": "Shop", "desc": "A shop.", "link": "https://shop.example.ng", "role": "", "year": "", "tools": [], "details": ""},
                {"title": "Notes", "desc": "No pictures.", "link": "https://github.com/ada/nothing", "role": "", "year": "", "tools": [], "details": ""},
                {"title": "Idea", "desc": "No link.", "link": "", "role": "", "year": "", "tools": [], "details": ""}]
    monkeypatch.setattr(ai, "parse", lambda schema, *a, **k: (schema(
        name="Ada", role="Developer", tagline="", summary="", skills=[], experience=[], education=[], certs=[], languages=[], website="",
        insights=[], projects=projects), None))
    c = client(); h = sign_up(c, "gh-folio@example.com")
    admin_cli.main(["credits", "gh-folio@example.com", "100"])
    r = c.post("/api/assist/profiles", json={"kind": "portfolio", "urls": ["https://github.com/ada"]}, headers=h)
    assert r.status_code == 200, r.text
    got = r.json()["draft"]["projects"]
    assert asked == ["https://github.com/ada/ledger", "https://shop.example.ng", "https://github.com/ada/nothing"]
    assert got[0]["media"][0]["src"].startswith("/uploads/") and got[1]["media"][0]["src"].startswith("/uploads/")
    assert "media" not in got[2] and "media" not in got[3]                 # nothing found / no link: left as is
    assert c.get(got[0]["media"][0]["src"]).status_code == 200
