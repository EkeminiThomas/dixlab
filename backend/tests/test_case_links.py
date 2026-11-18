"""Case studies from project links, the free case study review, and the new fields' safety."""
import pytest

from test_api import client, sign_up  # sets up the test database and environment first

from app import ai, casestandard, config as cfg, safety, webread
from app.admin import cli as admin_cli
from app.routers import assist, interview

STRONG = {
    "title": "Halving the time to book an appointment", "role": "Lead product designer",
    "problem": "Seven in ten patients who started booking online gave up before confirming, and older patients found the form impossible on a phone.",
    "contribution": "I led research and design end to end and ran every usability session.",
    "process": [{"title": "Discover", "desc": "Mapped the journey."}, {"title": "Prototype", "desc": "Tested four rounds."}, {"title": "Ship", "desc": "Released to 10%."}],
    "tradeoffs": "I cut rescheduling from the first release to keep the timeline.",
    "solution": "A three-step flow that suggests the earliest slots first.",
    "metrics": [{"value": "54s", "label": "median time to book"}, {"value": "71%", "label": "online completion"}],
    "learned": "Test with screen-reader users from week one.",
    "notes": "Northwind’s patients booked over the phone or through a 12-step web form built in 2014. " * 3,
    "cover": {"src": "/uploads/" + "a" * 32 + ".png"}, "embeds": [{"url": "https://www.figma.com/proto/abc123/Booking"}],
}


def _levels(r):
    return {c["id"]: c["level"] for c in r["checks"]}


def test_a_strong_case_study_is_ready_to_share():
    r = casestandard.check(STRONG)
    assert r["fixes"] == 0 and r["grade"] == "Ready to share", r
    assert _levels(r)["metrics"] == _levels(r)["tradeoffs"] == _levels(r)["visuals"] == "ok"


def test_a_weak_case_study_gets_the_right_fixes():
    r = casestandard.check({"title": "Booking app", "process": [{"title": "Design"}], "metrics": [{"value": "big", "label": "impact"}]})
    lv = _levels(r)
    assert r["grade"] == "Needs work"
    assert lv["title"] == "improve" and lv["problem"] == "fix" and lv["role"] == "fix" and lv["solution"] == "fix"
    assert lv["process"] == "improve" and lv["tradeoffs"] == "improve" and lv["metrics"] == "improve" and lv["visuals"] == "improve"
    assert r["checks"][0]["level"] == "fix"


def test_the_case_review_is_free_and_needs_no_account():
    r = client().post("/api/assist/case-check", json={"case": STRONG})
    assert r.status_code == 200 and r.json()["grade"] == "Ready to share" and r.json()["readMinutes"] >= 1


def test_a_case_study_is_built_from_project_links(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    read_urls, prompts = [], []

    def gather(urls, budget):
        read_urls.extend(urls)
        return ("=== https://github.com/ada/ledger\nGitHub repository: ada/ledger\nREADME:\nDouble-entry ledger for Nigerian SMEs.",
                [{"url": u, "platform": webread.platform(u), "read": True, "tip": None} for u in urls])

    def parse(schema, system, content, max_tokens=4000, effort="low"):
        prompts.append((system, content))
        assert schema is interview.CaseDraft
        return schema(title="Keeping every naira balanced", tagline="A ledger for small businesses", role="Creator", client="", timeline="2025",
                      team="", background="Small shops track sales on paper.", problem="Shop owners lose track of who owes what.", goals=["Balance daily"],
                      research="", process=[{"title": "Model", "desc": "Designed double-entry tables."}], contribution="I built it.", tradeoffs="",
                      solution="A Go service with a web app.", metrics=[{"value": "40", "label": "GitHub stars"}], learned="", next="",
                      skills=["Go", "PostgreSQL"]), None
    monkeypatch.setattr(webread, "gather", gather)
    monkeypatch.setattr(ai, "parse", parse)
    c = client(); h = sign_up(c, "case-links@example.com")
    admin_cli.main(["set-plan", "case-links@example.com", "pro"])
    body = {"urls": ["github.com/ada/ledger", "https://www.figma.com/design/AbC123/Ledger", "https://youtu.be/dQw4w9WgXcQ", "https://ledger.example.ng"],
            "notes": "I built this alone over three months."}
    r = c.post("/api/assist/case-from-links", json=body, headers=h)
    assert r.status_code == 200, r.text
    d = r.json()["draft"]
    assert d["title"] == "Keeping every naira balanced" and d["notes"] == "Small shops track sales on paper." and d["skills"] == "Go, PostgreSQL"
    assert [e["url"] for e in d["embeds"]] == ["https://www.figma.com/design/AbC123/Ledger", "https://youtu.be/dQw4w9WgXcQ"]
    assert d["link"] == "https://ledger.example.ng"                       # a live site beats the repository
    assert read_urls[0] == "https://github.com/ada/ledger"
    system, content = prompts[0]
    assert casestandard.STANDARD in system and "I built this alone" in content and "Double-entry ledger" in content
    # Needs something to go on.
    assert c.post("/api/assist/case-from-links", json={"urls": []}, headers=h).status_code == 400


@pytest.mark.parametrize("url,ok", [
    ("https://www.figma.com/proto/abc/x", True), ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", True), ("https://youtu.be/dQw4w9WgXcQ", True),
    ("https://www.loom.com/share/0123456789abcdef0123", True), ("https://vimeo.com/76979871", True),
    ("https://evil.example/figma.com/proto/x", False), ("javascript:alert(1)", False), ("https://github.com/a/b", False),
])
def test_only_known_players_are_embedded(url, ok):
    assert bool(assist.EMBEDDABLE.match(url)) is ok


def test_new_case_fields_are_cleaned_when_saved():
    dirty = {"embeds": [{"url": "javascript:alert(1)", "title": "x"}, {"url": "https://www.figma.com/proto/abc/x"}],
             "compare": {"before": {"src": "https://tracker.example/a.png"}, "after": {"src": "/uploads/" + "b" * 32 + ".png"}, "caption": "ok"}}
    c = safety.clean(dirty)
    assert c["embeds"][0]["url"] == "" and c["embeds"][1]["url"].startswith("https://www.figma.com/")
    assert c["compare"]["before"]["src"] == "" and c["compare"]["after"]["src"].startswith("/uploads/")
