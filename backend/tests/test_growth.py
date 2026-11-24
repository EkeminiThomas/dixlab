"""The gallery, custom domains, translations and live GitHub / Stack Overflow stats."""
from test_api import client, sign_up  # sets up the test database and environment first

from app import ai, config as cfg, livestats, translate
from app.admin import cli as admin_cli
from app.routers import domains


def _publish(c, h, pid, data):
    assert c.put(f"/api/projects/{pid}", json={"id": pid, **data}, headers=h).status_code in (200, 201)
    r = c.post(f"/api/projects/{pid}/publish", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["slug"]


def _admin(c, email):
    h = sign_up(c, email)
    assert admin_cli.main(["grant", email]) == 0
    return h


def test_gallery_needs_an_admin_to_feature_a_page():
    c = client()
    h = sign_up(c, "gal@example.com")
    slug = _publish(c, h, "p-g", {"type": "case", "template": "snapshot", "title": "Gallery case", "problem": "Hard to book.",
                                  "cover": {"src": "/uploads/" + "c" * 32 + ".png"}})
    assert c.put("/api/projects/p-g/publish/gallery", json={"listed": True}, headers=h).json()["gallery"] == "requested"
    assert all(p["slug"] != slug for p in c.get("/api/gallery").json()["pages"])    # not until it's featured
    a = _admin(c, "gal-admin@example.com")
    assert c.post(f"/api/admin/pages/{slug}/gallery", json={"status": "featured"}, headers=h).status_code == 403  # owners can't
    r = c.post(f"/api/admin/pages/{slug}/gallery", json={"status": "featured"}, headers=a)
    assert r.status_code == 200, r.text
    assert c.get("/api/admin/pages?gallery=featured", headers=a).json()["pages"][0]["gallery"] == "featured"
    shown = [p for p in c.get("/api/gallery?kind=case").json()["pages"] if p["slug"] == slug]
    assert shown and shown[0]["title"] == "Gallery case" and shown[0]["image"].startswith("/uploads/")
    assert not [p for p in c.get("/api/gallery?kind=cv").json()["pages"] if p["slug"] == slug]
    # Leaving the gallery, or locking the page, takes it out.
    assert c.put("/api/projects/p-g/publish/gallery", json={"listed": False}, headers=h).json()["gallery"] is None
    assert all(p["slug"] != slug for p in c.get("/api/gallery").json()["pages"])


def test_own_domains_are_free_to_connect(monkeypatch):
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    monkeypatch.setattr(cfg, "PUBLIC_URL", "https://dixlab.app")
    monkeypatch.setattr(cfg, "VERCEL_TOKEN", "")
    records = {}
    monkeypatch.setattr(domains, "dns", lambda name, kind: records.get((name, kind), []))
    c = client()
    h = sign_up(c, "dom@example.com")
    slug = _publish(c, h, "p-d", {"type": "portfolio", "template": "folio", "name": "Dom"})
    for bad in ("not a domain", "dixlab.app", "evil.vercel.app", "localhost", "ada.dixlab.click"):
        assert c.put("/api/projects/p-d/domain", json={"domain": bad}, headers=h).status_code == 422, bad
    d = c.put("/api/projects/p-d/domain", json={"domain": "https://Dom.dev/"}, headers=h).json()
    assert d["domain"] == "dom.dev" and not d["verified"]
    txt = next(r for r in d["records"] if r["type"] == "TXT")
    assert txt["name"] == "_dixlab.dom.dev" and next(r for r in d["records"] if r["type"] == "A")["value"] == domains.A_TARGET
    assert c.get("/api/domains/resolve?host=dom.dev").json() == {"slug": None}            # not verified yet
    # An unverified claim doesn't lock the domain: someone else can claim it, and whoever adds
    # the DNS record first proves it's theirs. (Squatting someone's domain used to block them.)
    other = sign_up(c, "dom-other@example.com")
    _publish(c, other, "p-d2", {"type": "portfolio", "template": "folio", "name": "Other"})
    assert c.put("/api/projects/p-d2/domain", json={"domain": "dom.dev"}, headers=other).status_code == 200
    d = c.put("/api/projects/p-d/domain", json={"domain": "dom.dev"}, headers=h).json()   # the real owner takes it back
    txt = next(r for r in d["records"] if r["type"] == "TXT")

    r = c.post("/api/projects/p-d/domain/check", headers=h).json()
    assert not r["owned"] and not r["verified"]
    records[("_dixlab.dom.dev", "TXT")] = [txt["value"]]
    records[("dom.dev", "A")] = [domains.A_TARGET]
    r = c.post("/api/projects/p-d/domain/check", headers=h).json()
    assert r["owned"] and r["pointed"] and r["verified"]
    assert c.get("/api/domains/resolve?host=dom.dev").json() == {"slug": slug}
    assert c.get("/api/domains/resolve?host=www.dom.dev").json() == {"slug": slug}
    # Once verified, nobody else can take it.
    assert c.put("/api/projects/p-d2/domain", json={"domain": "dom.dev"}, headers=other).status_code == 409
    assert c.get("/api/domains/resolve?host=dom.dev").json() == {"slug": slug}
    assert c.delete("/api/projects/p-d/domain", headers=h).status_code == 204
    assert c.get("/api/domains/resolve?host=dom.dev").json() == {"slug": None}


def test_translation_strings_skip_links_names_and_settings():
    project = {"type": "portfolio", "template": "folio", "name": "Ada Obi", "role": "Product designer",
               "tagline": "I design calm software.", "email": "ada@example.com", "photo": "/uploads/x.png",
               "projects": [{"title": "Ledger", "desc": "Bookkeeping for small shops.", "link": "https://ledger.app", "year": "2024"}],
               "experience": [{"role": "Designer", "company": "Paystack", "from": "2022", "to": "Present"}],
               "custom": {"accent": "#ff0000"}, "translations": {"fr": {"role": "x"}}, "metrics": [{"value": "54%", "label": "faster"}]}
    paths = dict(translate.strings(project))
    assert set(paths) == {"role", "tagline", "projects.0.title", "projects.0.desc", "experience.0.role", "metrics.0.label"}
    out = translate.apply(project, {"tagline": "Je conçois des logiciels calmes.", "projects.0.desc": "Comptabilité.", "nope.1": "x"})
    assert out["tagline"].startswith("Je conçois") and out["projects"][0]["desc"] == "Comptabilité." and out["name"] == "Ada Obi"


def test_translate_endpoint(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    calls = []

    def parse(schema, system, content, max_tokens=4000, effort="low"):
        calls.append(content)
        n = content.count("\n[")
        return schema(items=[f"[{i + 1}] FR-{i + 1}" for i in range(n)]), None
    monkeypatch.setattr(ai, "parse", parse)
    c = client()
    h = sign_up(c, "tr@example.com")
    body = {"project": {"type": "case", "title": "Faster booking", "problem": "Patients gave up.", "link": "https://x.y"}, "lang": "fr"}
    assert c.post("/api/assist/translate", json={**body, "lang": "xx"}, headers=h).status_code == 400
    r = c.post("/api/assist/translate", json=body, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["strings"] == {"title": "FR-1", "problem": "FR-2"} and "French" in calls[0]


def test_live_stats(monkeypatch):
    assert livestats.github_login("https://github.com/ada-obi?tab=repos") == "ada-obi"
    assert livestats.github_login("javascript:alert(1)") is None
    assert livestats.so_user("https://stackoverflow.com/users/22656/jon") == "22656"
    assert livestats.so_user("https://evil.com/users/1") is None

    def fake_json(url):
        if url.endswith("/users/ada-obi"):
            return {"login": "ada-obi", "public_repos": 3, "followers": 9}
        if "/users/ada-obi/repos" in url:
            return [{"name": "ledger", "stargazers_count": 40, "language": "TypeScript", "description": "Books"},
                    {"name": "fork", "fork": True, "stargazers_count": 999},
                    {"name": "notes", "stargazers_count": 2, "language": "Python"}]
        if "/users/1?" in url:
            return {"items": [{"display_name": "Ada &amp; co", "reputation": 1200, "badge_counts": {"gold": 1, "silver": 4, "bronze": 9}}]}
        if "/top-tags" in url:
            return {"items": [{"tag_name": "python"}]}
        raise AssertionError(url)
    monkeypatch.setattr(livestats, "_json", fake_json)
    livestats._cache.clear()
    c = client()
    h = sign_up(c, "live@example.com")
    slug = _publish(c, h, "p-live", {"type": "portfolio", "template": "folio", "name": "Ada",
                                     "liveStats": {"github": "ada-obi", "stackoverflow": "https://stackoverflow.com/users/1/ada"}})
    s = c.get(f"/api/public/{slug}/stats").json()
    assert s["github"]["stars"] == 42 and s["github"]["languages"] == ["TypeScript", "Python"] and s["github"]["top"][0]["name"] == "ledger"
    assert s["stackoverflow"]["name"] == "Ada & co" and s["stackoverflow"]["gold"] == 1 and s["stackoverflow"]["tags"] == ["python"]
    assert c.get("/api/public/missing/stats").json() == {}


def test_dixlab_addresses_are_an_unlock(monkeypatch):
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    monkeypatch.setattr(cfg, "VERCEL_TOKEN", "")
    c = client()
    h = sign_up(c, "sub@example.com")
    slug = _publish(c, h, "p-s", {"type": "portfolio", "template": "folio", "name": "Sub"})
    r = c.put("/api/projects/p-s/subdomain", json={"name": "ada-obi"}, headers=h)
    assert r.status_code == 402 and r.json()["detail"]["feature"] == "subdomain"
    admin_cli.main(["credits", "sub@example.com", "200"])
    assert c.post("/api/billing/unlock", json={"feature": "subdomain"}, headers=h).json()["features"]["subdomain"] is True
    for bad in ("ab", "www", "admin", "-ada", "ada_obi", "a" * 31):
        assert c.put("/api/projects/p-s/subdomain", json={"name": bad}, headers=h).status_code == 422, bad
    r = c.put("/api/projects/p-s/subdomain", json={"name": "Ada-Obi"}, headers=h).json()
    assert r == {"domain": "ada-obi.dixlab.click", "url": "https://ada-obi.dixlab.click"}
    assert c.get("/api/domains/resolve?host=ada-obi.dixlab.click").json() == {"slug": slug}   # live straight away
    info = c.get("/api/projects/p-s/domain", headers=h).json()
    assert info["sub"]["domain"] == "ada-obi.dixlab.click" and info["domain"] is None and info["subBase"] == "dixlab.click"
    # Taken names, renames and removal.
    other = sign_up(c, "sub-other@example.com")
    admin_cli.main(["set-plan", "sub-other@example.com", "pro"])
    _publish(c, other, "p-s2", {"type": "portfolio", "template": "folio", "name": "Other"})
    assert c.put("/api/projects/p-s2/subdomain", json={"name": "ada-obi"}, headers=other).status_code == 409
    c.put("/api/projects/p-s/subdomain", json={"name": "ada"}, headers=h)
    assert c.get("/api/domains/resolve?host=ada-obi.dixlab.click").json() == {"slug": None}
    assert c.put("/api/projects/p-s2/subdomain", json={"name": "ada-obi"}, headers=other).status_code == 200   # freed
    assert c.delete("/api/projects/p-s/subdomain", headers=h).status_code == 204
    assert c.get("/api/domains/resolve?host=ada.dixlab.click").json() == {"slug": None}
