"""Case studies from a Figma file: reading its structure, words, fonts and colours,
and adding its screens as the person's own uploads."""
from test_api import client, sign_up  # sets up the test database and environment first

from app import ai, config as cfg, figma, webread
from app.admin import cli as admin_cli

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64


def _text(id_, chars, family="Inter", size=16, weight=400, y=0):
    return {"id": id_, "type": "TEXT", "characters": chars, "absoluteBoundingBox": {"x": 0, "y": y, "width": 100, "height": 20},
            "style": {"fontFamily": family, "fontSize": size, "fontWeight": weight},
            "fills": [{"type": "SOLID", "color": {"r": 0.07, "g": 0.07, "b": 0.07, "a": 1}}]}


def _frame(id_, name, w=1440, h=900, x=0, y=0, children=()):
    return {"id": id_, "type": "FRAME", "name": name, "absoluteBoundingBox": {"x": x, "y": y, "width": w, "height": h},
            "fills": [{"type": "SOLID", "color": {"r": 1, "g": 1, "b": 1, "a": 1}}], "children": list(children)}


FILE = {
    "name": "Clinic booking", "lastModified": "2026-10-02T10:00:00Z", "thumbnailUrl": "https://s3.example/thumb.png",
    "components": {"1:1": {}, "1:2": {}}, "styles": {"S:1": {"name": "Brand/Primary", "styleType": "FILL"}, "S:2": {"name": "H1", "styleType": "TEXT"}},
    "document": {"id": "0:0", "type": "DOCUMENT", "children": [
        {"id": "0:1", "type": "CANVAS", "name": "Cover", "children": [_frame("9:1", "Cover")]},
        {"id": "0:2", "type": "CANVAS", "name": "Research", "children": [_frame("2:1", "Personas"), _frame("2:2", "Journey map", x=1600)]},
        {"id": "0:3", "type": "CANVAS", "name": "Final UI", "flowStartingPoints": [{"nodeId": "3:2", "name": "Book an appointment"}], "children": [
            {"id": "3:0", "type": "SECTION", "name": "Booking", "children": [_frame("3:1", "Home", 390, 844), _frame("3:2", "Pick a time", 390, 844, x=500)]},
            _frame("3:9", "tiny", 40, 40), dict(_frame("3:8", "Hidden"), visible=False)]},
        {"id": "0:4", "type": "CANVAS", "name": "Archive", "children": [_frame("4:1", "Old idea")]},
    ]},
}
NODES = {"nodes": {
    "3:2": {"document": _frame("3:2", "Pick a time", 390, 844, children=[
        _text("t1", "Pick a time that suits you", "Playfair Display", 32, 700),
        _text("t2", "Earliest slots first", y=60), _text("t3", "Button", y=90),
        {"id": "b1", "type": "RECTANGLE", "absoluteBoundingBox": {"x": 0, "y": 0, "width": 300, "height": 300}, "styles": {"fill": "S:1"},
         "fills": [{"type": "SOLID", "color": {"r": 0.32, "g": 0.27, "b": 0.91, "a": 1}}], "interactions": [{}]}])},
    "2:1": {"document": _frame("2:1", "Personas", children=[_text("t4", "Amaka, 68, books for her husband")])},
}}


def fake_get(calls):
    def get(path, token, params=None):
        calls.append((path, token, params))
        if path.endswith("/nodes"):
            return NODES
        if path.startswith("/images/"):
            return {"images": {i: f"https://s3.example/{i}.png" for i in params["ids"].split(",")}}
        return FILE
    return get


def test_figma_links_are_parsed():
    assert figma.parse_url("https://www.figma.com/design/AbCdEfGhIj12/Clinic?node-id=3-2&t=x") == ("design", "AbCdEfGhIj12", "3:2")
    assert figma.parse_url("https://figma.com/proto/AbCdEfGhIj12/Clinic") == ("proto", "AbCdEfGhIj12", None)
    assert figma.parse_url("https://www.figma.com/design/AbCdEfGhIj12/Clinic/branch/BrAnChKeY99/Clinic")[1] == "BrAnChKeY99"
    assert figma.parse_url("https://evil.example/figma.com/design/AbCdEfGhIj12") is None


def test_a_figma_file_is_read_into_structure_words_fonts_and_colours(monkeypatch):
    calls = []
    monkeypatch.setattr(figma, "_get", fake_get(calls))
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "server-token-0123456789")
    info = figma.read("https://www.figma.com/design/AbCdEfGhIj12/Clinic")
    ids = [s["id"] for s in info["screens"]]
    assert ids[0] == "3:2"                                   # the prototype's starting screen comes first
    assert set(ids) == {"3:2", "2:1", "2:2", "3:1"}          # no cover, archive, hidden or tiny frames
    assert info["cover"] == "9:1"
    assert info["stats"]["pages"] == 2 and info["stats"]["components"] == 2 and info["stats"]["flows"] == 1
    assert info["fonts"][0]["family"] == "Playfair Display" and info["fontPair"] == "editorial"
    assert info["accent"] == "#5245e8" and any(c["name"] == "Brand/Primary" for c in info["colors"])
    t = info["text"]
    assert "Page \"Research\"" in t and "Booking" in t and "Book an appointment" in t
    assert "Pick a time that suits you" in t and "Amaka, 68" in t and "Button" not in t   # placeholder words dropped
    assert "Old idea" not in t
    assert calls[0][1] == "server-token-0123456789" and calls[0][2] == {"depth": 3}


def test_a_link_to_one_frame_puts_it_first_and_still_reads_every_page(monkeypatch):
    monkeypatch.setattr(figma, "_get", fake_get([]))
    info = figma.read("https://www.figma.com/design/AbCdEfGhIj12/Clinic?node-id=2-1", own_token="figd_" + "x" * 30)
    ids = [s["id"] for s in info["screens"]]
    assert ids[0] == "2:1" and {"3:1", "3:2", "2:2"} <= set(ids)
    assert {s["page"] for s in info["screens"]} == {"Research", "Final UI"}


def test_a_link_copied_from_an_open_page_reads_every_page(monkeypatch):
    """Links copied from the address bar carry the open page (node-id): all pages are still read."""
    monkeypatch.setattr(figma, "_get", fake_get([]))
    info = figma.read("https://www.figma.com/design/AbCdEfGhIj12/Clinic?node-id=0-2&t=abc", own_token="figd_" + "x" * 30)
    assert {s["page"] for s in info["screens"]} == {"Research", "Final UI"}
    assert info["stats"]["pages"] == 2 and "Page \"Research\"" in info["text"] and "Page \"Final UI\"" in info["text"]


def test_a_big_linked_section_leaves_room_for_the_other_pages():
    outline = [{"id": f"1:{i}", "name": f"S{i}", "page": "UI", "section": "Flow", "w": 400, "h": 800, "x": i * 500, "y": 0} for i in range(12)] \
        + [{"id": f"2:{i}", "name": f"R{i}", "page": "Research", "section": "", "w": 1440, "h": 900, "x": i * 1600, "y": 0} for i in range(3)]
    picked = figma._pick(outline, [f"1:{i}" for i in range(12)])
    assert len(picked) == figma.MAX_SCREENS and sum(s["page"] == "Research" for s in picked) == 2  # pages take turns
    assert [s["id"] for s in picked[:4]] == ["1:0", "1:1", "1:2", "1:3"]


def test_screens_export_at_a_sensible_size():
    assert figma._scale(390, 844) == 2 and figma._scale(1440, 900) == 1 and figma._scale(3200, 2000) == 0.5
    assert figma._scale(390, 9000) <= 0.75                   # very long pages are not exported huge


def test_a_case_study_gets_the_figma_screens_fonts_and_colours(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "server-token-0123456789")
    monkeypatch.setattr(figma, "_get", fake_get([]))
    gathered, prompts = [], []

    def export(url, picked, cover, own, room):
        out = []
        assert cover == {"id": "9:1", "name": "Cover", "w": 1440, "h": 900}
        for s in ([cover] if cover else []) + picked:
            name = f"{len(out):032x}.png"
            (cfg.UPLOAD_DIR / name).write_bytes(PNG)
            out.append({"id": s["id"], "name": s["name"], "file": name, "size": len(PNG), "cover": s["name"] == "Cover"})
        return out

    def gather(urls, budget):
        gathered.extend(urls)
        return "", [{"url": u, "platform": webread.platform(u), "read": False, "tip": "x"} for u in urls]

    def parse(schema, system, content, max_tokens=4000, effort="low"):
        prompts.append(content)
        return schema(title="Booking in under a minute", tagline="", role="", client="", timeline="", team="", background="",
                      problem="Booking took too long.", goals=[], research="", process=[{"title": "Research", "desc": "Personas."}],
                      contribution="", tradeoffs="", solution="", metrics=[], learned="", next="", skills=["Figma"]), None
    monkeypatch.setattr(figma, "export", export)
    monkeypatch.setattr(webread, "gather", gather)
    monkeypatch.setattr(ai, "parse", parse)
    c = client(); h = sign_up(c, "figma-case@example.com")
    admin_cli.main(["credits", "figma-case@example.com", "100"])
    url = "https://www.figma.com/design/AbCdEfGhIj12/Clinic"
    r = c.post("/api/assist/case-from-links", json={"urls": [url]}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    d = body["draft"]
    assert body["figma"] is True and gathered == []          # read through the API, not as a web page
    assert "Pick a time that suits you" in prompts[0]
    assert d["cover"]["src"].startswith("/uploads/") and len(d["gallery"]) == 4
    assert d["gallery"][0]["caption"] == "Pick a time"
    assert d["design"]["fonts"][0]["family"] == "Playfair Display" and d["brand"] == {"accent": "#5245e8", "font": "editorial"}
    assert d["embeds"] == [{"url": url, "title": ""}]
    # The images are the person's uploads: they count towards storage and can be saved in the project.
    saved = c.put("/api/projects/p-fig", json={"id": "p-fig", "type": "case", "template": "snapshot", "title": "x", "cover": d["cover"], "gallery": d["gallery"],
                                               "design": d["design"], "updatedAt": 1}, headers=h)
    assert saved.status_code in (200, 201), saved.text
    assert c.get("/api/projects/p-fig", headers=h).json()["project"]["gallery"][0]["src"] == d["gallery"][0]["src"]


def test_without_a_figma_token_only_the_title_is_used(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "")
    gathered = []

    def gather(urls, budget):
        gathered.extend(urls)
        return "=== x\nFigma design file: \"Clinic\"", [{"url": u, "platform": "figma", "read": True, "tip": None} for u in urls]
    monkeypatch.setattr(webread, "gather", gather)
    monkeypatch.setattr(ai, "parse", lambda schema, *a, **k: (schema(
        title="t", tagline="", role="", client="", timeline="", team="", background="", problem="", goals=[], research="", process=[],
        contribution="", tradeoffs="", solution="", metrics=[], learned="", next="", skills=[]), None))
    c = client(); h = sign_up(c, "figma-notoken@example.com")
    admin_cli.main(["credits", "figma-notoken@example.com", "100"])
    r = c.post("/api/assist/case-from-links", json={"urls": ["https://www.figma.com/design/AbCdEfGhIj12/Clinic"]}, headers=h)
    assert r.status_code == 200 and r.json()["figma"] is False and r.json()["figmaSetup"] is True
    assert "cover" not in r.json()["draft"] and gathered == ["https://www.figma.com/design/AbCdEfGhIj12/Clinic"]


def test_a_private_file_falls_back_to_the_title_with_a_tip(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "server-token-0123456789")

    def denied(*a, **k):
        raise figma.FigmaError("Figma didn’t let us open that file.")
    monkeypatch.setattr(figma, "_get", denied)
    monkeypatch.setattr(webread, "gather", lambda urls, budget: ("=== x\nFigma design file: \"Clinic\"",
                                                                  [{"url": u, "platform": "figma", "read": True, "tip": None} for u in urls]))
    monkeypatch.setattr(ai, "parse", lambda schema, *a, **k: (schema(
        title="t", tagline="", role="", client="", timeline="", team="", background="", problem="", goals=[], research="", process=[],
        contribution="", tradeoffs="", solution="", metrics=[], learned="", next="", skills=[]), None))
    c = client(); h = sign_up(c, "figma-private@example.com")
    admin_cli.main(["credits", "figma-private@example.com", "100"])
    r = c.post("/api/assist/case-from-links", json={"urls": ["https://www.figma.com/design/AbCdEfGhIj12/Clinic"]}, headers=h)
    assert r.status_code == 200
    src = r.json()["sources"][0]
    assert src["read"] is True and "didn’t let us open" in src["tip"] and "title only" in src["tip"]


def test_page_names_are_skipped_by_whole_words():
    skip = lambda n: bool(figma.SKIP_PAGE.search(n))  # noqa: E731
    assert skip("Archive") and skip("🗄 Old") and skip("Components") and skip("---") and skip("Design system styles")
    assert not skip("Golden path") and not skip("Lifestyles") and not skip("Swipe flows") and not skip("Final UI")


def test_a_huge_file_is_read_more_lightly(monkeypatch):
    calls = []
    inner = fake_get(calls)

    def get(path, token, params=None):
        if params == {"depth": 3}:
            calls.append((path, token, params))
            raise figma.TooBig("too big")
        return inner(path, token, params)
    monkeypatch.setattr(figma, "_get", get)
    info = figma.read("https://www.figma.com/design/AbCdEfGhIj12/Clinic", own_token="figd_" + "x" * 30)
    assert [c[2] for c in calls][:2] == [{"depth": 3}, {"depth": 2}] and info["screens"]



def test_screens_wait_for_the_virus_scanner_only_once_and_say_why(monkeypatch):
    from app import scan
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(cfg, "FIGMA_TOKEN", "server-token-0123456789")
    monkeypatch.setattr(figma, "_get", fake_get([]))
    calls = []

    def export(url, picked, cover, own, room):
        out = []
        for i, s in enumerate(([cover] if cover else []) + picked):
            name = f"{0xf0 + i:032x}.png"
            (cfg.UPLOAD_DIR / name).write_bytes(PNG)
            out.append({"id": s["id"], "name": s["name"], "file": name, "size": len(PNG), "cover": s is cover})
        return out

    def down(path, ext):
        calls.append(path)
        raise scan.ScannerUnavailable()
    monkeypatch.setattr(figma, "export", export)
    monkeypatch.setattr(scan, "check", down)
    monkeypatch.setattr(ai, "parse", lambda schema, *a, **k: (schema(
        title="t", tagline="", role="", client="", timeline="", team="", background="", problem="", goals=[], research="", process=[],
        contribution="", tradeoffs="", solution="", metrics=[], learned="", next="", skills=[]), None))
    c = client(); h = sign_up(c, "figma-noscan@example.com")
    admin_cli.main(["credits", "figma-noscan@example.com", "100"])
    r = c.post("/api/assist/case-from-links", json={"urls": ["https://www.figma.com/design/AbCdEfGhIj12/Clinic"]}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert len(calls) == 1 and body["draft"]["gallery"] == [] and body["draft"]["cover"] is None
    assert "scan the images for viruses" in body["note"]
    assert not any(cfg.UPLOAD_DIR.glob(f"{0xf0:030x}*.png"))   # nothing unscanned is left behind


def test_a_monthly_figma_limit_asks_for_their_own_token():
    assert "your own Figma access token" in str(figma.RateLimited("low", "200000"))
    assert "Try again in a minute" in str(figma.RateLimited("high", "30"))


def test_screens_are_exported_in_one_call(monkeypatch):
    calls = []

    def get(path, token, params=None):
        calls.append(params)
        return {"images": {}}
    monkeypatch.setattr(figma, "_get", get)
    screens = [{"id": "1:1", "name": "Phone", "w": 390, "h": 844}, {"id": "1:2", "name": "Desk", "w": 1440, "h": 900},
               {"id": "1:3", "name": "Phone 2", "w": 390, "h": 844}]
    figma.export("https://www.figma.com/design/AbCdEfGhIj12/x", screens, None, "figd_" + "x" * 30, 10**9)
    assert len(calls) == 1 and calls[0]["ids"] == "1:1,1:2,1:3" and calls[0]["scale"] == 2
