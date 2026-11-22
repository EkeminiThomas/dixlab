"""AI assist: tailoring (or building) a CV for a job, and drafting from public
profiles; the safe page reader; and the Groq request format. The AI and the web
are replaced by fakes: these check the plumbing, plan rules and safety."""
import json
import sqlite3

import httpx
import pytest
from pydantic import BaseModel, Field

from test_api import client, sign_up  # sets up the test database and environment first

from app.admin import cli as admin_cli
from app import ai, config as cfg, plans as plans_mod, webread
from app.config import DB_PATH
from app.routers import assist

CV = {"role": "Developer", "notes": "I build web apps.", "skills": "React, Python",
      "experience": [{"role": "Developer", "company": "Acme", "from": "2022", "to": "Present", "desc": "Built things"}]}
JOB_HTML = ("<html><head><title>Frontend engineer at Globex</title><script>steal()</script></head><body>"
            "<h1>Frontend engineer</h1><p>We need React, TypeScript and GraphQL. You will build our design system "
            "and work with product teams.</p></body></html>")
PAGES = {
    "https://jobs.example.com/123": (JOB_HTML, "text/html"),
    "https://jobs.example.com/7": (JOB_HTML, "text/html"),
    "https://api.github.com/users/ada": (json.dumps({"name": "Ada", "bio": "I build developer tools", "public_repos": 2, "followers": 9}), "application/json"),
    "https://api.github.com/users/ada/repos?sort=pushed&per_page=30": (json.dumps([
        {"name": "linty", "description": "A fast linter", "language": "Python", "stargazers_count": 2000, "forks_count": 40, "pushed_at": "2026-10-01T00:00:00Z", "fork": False},
        {"name": "someone-elses", "description": "forked", "fork": True, "stargazers_count": 5000},
    ]), "application/json"),
    "https://api.github.com/repos/ada/linty/readme": ("# linty\nCatches bugs before review. I chose a rule engine over regexes so rules compose.", "text/plain"),
}


def _fake_web(monkeypatch):
    fetched = []

    def fetch(url, accept="text/html"):
        fetched.append(url)
        if url not in PAGES:
            raise webread.Unreadable("The site answered 500.")
        return PAGES[url]

    monkeypatch.setattr(webread, "fetch", fetch)
    return fetched


def _ai_on(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setenv("GROQ_API_KEY", "")
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    calls = {"parse": [], "fetched": _fake_web(monkeypatch)}

    def parse(schema, system, content, max_tokens=4000, effort="low"):
        calls["parse"].append(content)
        if schema is assist.TailoredCv:
            return schema(job_title="Frontend engineer", company="Globex", role="Frontend developer", summary="New summary.",
                          skills=["React", "Python"], experience=[{"index": 0, "bullets": ["Built React apps", " "]}, {"index": 7, "bullets": ["x"]}],
                          matched=["React"], gaps=["GraphQL: add it if you've used it"]), None
        if schema is assist.JobCvDraft:
            return schema(job_title="Frontend engineer", company="Globex", name="Ada", role="Frontend developer", summary="Built for the job.",
                          skills=["React"], experience=[{"role": "Developer", "company": "Acme", "start": "2022", "end": "Present",
                                                          "location": "", "bullets": ["Shipped React apps"]}],
                          education=[], projects=[], certs=[], languages=[], website="", matched=["React"], gaps=["GraphQL"]), None
        return schema(name="Ada", role="Full-stack developer", tagline="I build tools", summary="I build developer tools.",
                      skills=["Python", "TypeScript"], experience=[], education=[],
                      projects=[{"title": "Linty", "desc": "A linter with 2k stars.", "link": "https://github.com/ada/linty", "role": "Creator",
                                 "year": "2025", "tools": ["Python"], "details": ""}],
                      certs=[], languages=[], website="https://github.com/ada", insights=["Strong open-source track record."]), None

    monkeypatch.setattr(ai, "parse", parse)
    return calls


def _units(uid):
    db = sqlite3.connect(DB_PATH)
    try:
        row = db.execute("SELECT -SUM(delta) FROM credit_ledger WHERE user_id = ? AND reason LIKE 'ai:%'", (uid,)).fetchone()
    finally:
        db.close()
    return row[0] or 0  # credits spent on AI


def _uid(c, h):
    return c.get("/api/auth/me", headers=h).json()["user"]["id"]


# ---------------------------------------------------------------- routes

def test_tailoring_a_cv_costs_credits_and_keeps_to_the_cv(monkeypatch):
    calls = _ai_on(monkeypatch)
    c = client(); h = sign_up(c, "tailor@example.com")
    body = {"job_url": "jobs.example.com/123", "cv": CV}
    assert admin_cli.main(["credits", "tailor@example.com", "-25"]) == 0  # 30 welcome credits - 25 = 5, and tailoring costs 20
    r = c.post("/api/assist/tailor-cv", json=body, headers=h)
    assert r.status_code == 402 and r.json()["code"] == "ai_credits" and r.json()["unavailable"] is True
    assert calls["fetched"] == []                                     # nothing read before the credit check
    assert admin_cli.main(["credits", "tailor@example.com", "100"]) == 0
    r = c.post("/api/assist/tailor-cv", json=body, headers=h)
    assert r.status_code == 200, r.text
    t = r.json()["tailored"]
    assert t["summary"] == "New summary." and t["experience"] == [{"index": 0, "desc": "Built React apps"}]  # out-of-range role dropped
    assert r.json()["sources"] == [{"url": "https://jobs.example.com/123", "platform": "web", "read": True, "tip": None}]
    prompt = calls["parse"][0]
    assert "We need React, TypeScript and GraphQL" in prompt and "steal()" not in prompt and "[0] Developer at Acme" in prompt
    assert _units(_uid(c, h)) == plans_mod.AI_COSTS["assist_tailor_cv"]


def test_unreadable_job_link_is_not_charged(monkeypatch):
    calls = _ai_on(monkeypatch)
    c = client(); h = sign_up(c, "tailor2@example.com")
    admin_cli.main(["set-plan", "tailor2@example.com", "premium"])
    r = c.post("/api/assist/tailor-cv", json={"job_url": "https://jobs.example.com/9", "cv": CV}, headers=h)
    assert r.status_code == 422 and r.json()["sources"][0]["read"] is False and "500" in r.json()["sources"][0]["tip"]
    assert _units(_uid(c, h)) == 0 and calls["parse"] == []
    r = c.post("/api/assist/tailor-cv", json={"job_text": "We need a frontend engineer. " * 5, "cv": CV}, headers=h)
    assert r.status_code == 200
    assert c.post("/api/assist/tailor-cv", json={"job_url": "javascript:alert(1)", "cv": CV}, headers=h).status_code == 422


def test_profiles_draft_a_portfolio_and_explain_unreadable_links(monkeypatch):
    calls = _ai_on(monkeypatch)
    c = client(); h = sign_up(c, "profiles@example.com")
    admin_cli.main(["set-plan", "profiles@example.com", "starter"])
    admin_cli.main(["credits", "profiles@example.com", "100"])  # Starter pays for AI in credits
    r = c.post("/api/assist/profiles", json={"kind": "portfolio", "urls": ["github.com/ada", "https://www.linkedin.com/in/ada"]}, headers=h)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["draft"]["projects"][0]["link"] == "https://github.com/ada/linty" and j["draft"]["tagline"] == "I build tools"
    gh, li = j["sources"]
    assert gh["read"] is True and gh["platform"] == "github"
    assert li["read"] is False and li["platform"] == "linkedin" and "copy" in li["tip"].lower()
    assert not any("linkedin" in u for u in calls["fetched"])        # login walls aren't even tried
    prompt = calls["parse"][0]
    assert "linty · A fast linter · Python · 2000 stars" in prompt and "rule engine over regexes" in prompt
    assert "someone-elses" not in prompt                              # forks are left out
    r = c.post("/api/assist/profiles", json={"kind": "cv", "text": "Ada Lovelace. Developer at Analytical Engines since 2020. " * 2}, headers=h)
    assert r.status_code == 200 and r.json()["draft"]["notes"] == "I build developer tools." and r.json()["draft"]["projects"][0]["title"] == "Linty"
    # Only unreadable links and no text: nothing to go on, nothing charged.
    before = _units(_uid(c, h))
    r = c.post("/api/assist/profiles", json={"kind": "cv", "urls": ["https://x.com/ada"]}, headers=h)
    assert r.status_code == 422 and _units(_uid(c, h)) == before
    # Out of credits: reading profiles (15) is refused, nothing is read.
    h2 = sign_up(c, "profiles-free@example.com")
    admin_cli.main(["credits", "profiles-free@example.com", "-20"])
    r = c.post("/api/assist/profiles", json={"kind": "cv", "urls": ["github.com/ada"]}, headers=h2)
    assert r.status_code == 402 and r.json()["code"] == "ai_credits"
    assert c.post("/api/assist/profiles", json={"kind": "cv", "urls": []}, headers=h).status_code == 400


def test_an_empty_cv_is_built_for_the_job_from_the_persons_background(monkeypatch):
    calls = _ai_on(monkeypatch)
    c = client(); h = sign_up(c, "build@example.com")
    admin_cli.main(["set-plan", "build@example.com", "premium"])
    empty = {"experience": [{"role": "", "company": "", "desc": ""}]}
    r = c.post("/api/assist/tailor-cv", json={"job_url": "https://jobs.example.com/7", "cv": empty}, headers=h)
    assert r.status_code == 400 and r.json()["code"] == "need_background"
    r = c.post("/api/assist/tailor-cv", json={"job_url": "https://jobs.example.com/7", "cv": empty,
                                               "background_text": "I was a developer at Acme from 2022, building React apps for retail clients."}, headers=h)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["built"]["notes"] == "Built for the job." and j["built"]["experience"][0]["desc"] == "Shipped React apps"
    assert j["gaps"] == ["GraphQL"] and "tailored" not in j
    assert "ABOUT THE PERSON" in calls["parse"][-1] and "developer at Acme" in calls["parse"][-1]
    assert _units(_uid(c, h)) == 0                                    # an older Premium plan includes AI


# ---------------------------------------------------------------- the page reader

@pytest.mark.parametrize("url", [
    "http://localhost/", "http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/",
    "http://192.168.1.1/", "http://[::1]/", "file:///etc/passwd", "ftp://example.com/", "http://example.com:22/",
    "http://user:pass@example.com/", "http://0.0.0.0/",
])
def test_the_reader_refuses_private_and_odd_addresses(url):
    with pytest.raises(webread.Unreadable):
        webread.check_url(url)


def test_the_reader_checks_every_redirect(monkeypatch):
    monkeypatch.setattr(webread, "_public", lambda host, port: host == "public.example")
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})

    real = httpx.Client
    monkeypatch.setattr(webread.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    with pytest.raises(webread.Unreadable):
        webread.fetch("http://public.example/job")
    assert seen == ["http://public.example/job"]                       # the metadata address was never requested


def test_html_becomes_text():
    text = webread.html_to_text(JOB_HTML)
    assert text.startswith("Frontend engineer at Globex") and "GraphQL" in text and "steal" not in text
    assert webread.platform("https://uk.linkedin.com/in/ada") == "linkedin" and webread.platform("https://twitter.com/a") == "x"


# ---------------------------------------------------------------- Groq

class _Item(BaseModel):
    title: str = Field(description="A field called title must survive.")
    tags: list[str]


class _Out(BaseModel):
    title: str
    items: list[_Item]
    note: str | None


def test_strict_schema_for_groq():
    s = ai.strict_schema(_Out)
    assert s["additionalProperties"] is False and s["required"] == ["title", "items", "note"]
    item = s["$defs"]["_Item"]
    assert item["additionalProperties"] is False and item["required"] == ["title", "tags"] and "title" in item["properties"]
    assert "title" not in s                                            # schema titles go, property names stay


def test_groq_is_used_when_its_key_is_set(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    monkeypatch.delenv("DIXLAB_AI_PROVIDER", raising=False)
    assert ai.provider() == "groq" and ai.configured() and ai.model() == "openai/gpt-oss-120b"
    sent = {}

    def post(url, json=None, headers=None, timeout=None):
        sent.update(url=url, body=json, auth=headers["Authorization"])
        out = {"title": "Hi", "items": [{"title": "a", "tags": ["x"]}], "note": None}
        return httpx.Response(200, json={"choices": [{"message": {"content": __import__("json").dumps(out)}, "finish_reason": "stop"}]})

    monkeypatch.setattr(ai.httpx, "post", post)
    out, err = ai.parse(_Out, "Be helpful.", "Hello", max_tokens=9000, effort="medium")
    assert err is None and out.items[0].title == "a"
    assert sent["url"] == ai.GROQ_URL and sent["auth"] == "Bearer gsk_test"
    b = sent["body"]
    assert b["response_format"]["json_schema"]["strict"] is True and b["max_completion_tokens"] == ai.GROQ_MAX_TOKENS
    assert b["reasoning_effort"] == "medium" and b["messages"][0]["role"] == "system"
    # Errors come back clear.
    monkeypatch.setattr(ai.httpx, "post", lambda *a, **k: httpx.Response(401, json={"error": {"message": "Invalid API Key"}}))
    out, err = ai.parse(_Out, "s", "c")
    assert out is None and err.status_code == 503 and b"GROQ_API_KEY" in err.body
    monkeypatch.setattr(ai.httpx, "post", lambda *a, **k: httpx.Response(429, headers={"retry-after": "7"}, json={"error": {"message": "Rate limit reached"}}))
    assert b"7 seconds" in ai.parse(_Out, "s", "c")[1].body
