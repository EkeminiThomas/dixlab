"""The CV standard (Mercor-style screening): the free check, and the AI prompts using it."""
from test_api import client, sign_up  # sets up the test database and environment first

from app import ai, config as cfg, cvstandard
from app.admin import cli as admin_cli
from app.routers import assist

STRONG = {
    "name": "Ada Okafor", "email": "ada@example.com", "phone": "+234 801 234 5678", "location": "Lagos, Nigeria",
    "website": "linkedin.com/in/adaokafor", "template": "plain",
    "notes": "Backend engineer with 6 years building payment systems in Python and Go. I make high-traffic APIs fast and reliable.",
    "skills": "Python, Go, PostgreSQL, Kafka, AWS, Docker, Kubernetes, gRPC",
    "experience": [
        {"role": "Senior Backend Engineer", "company": "Paystack", "from": "2022", "to": "Present",
         "desc": "Cut checkout API latency by 40% for 200k merchants by redesigning the caching layer\n"
                 "Led a team of 4 to ship instant settlements, adding $2m in monthly volume\n"
                 "Built fraud rules that blocked 12,000 bad transactions a month"},
        {"role": "Backend Engineer", "company": "Andela", "from": "2019", "to": "2022",
         "desc": "Built a billing service handling 1m invoices a year\nMigrated 30 services to Kubernetes with zero downtime\nMentored 6 junior engineers"},
    ],
    "education": [{"degree": "BSc Computer Science", "school": "University of Lagos", "from": "2015", "to": "2019"}],
    "projects": [{"title": "pgqueue", "desc": "Open-source job queue on PostgreSQL, 1.2k stars", "link": "github.com/ada/pgqueue"}],
}

WEAK = {
    "name": "Bo", "template": "meridian", "notes": "Passionate, results-driven team player. " * 3,
    "skills": ", ".join(f"Skill{i}" for i in range(25)),
    "experience": [{"role": "Developer", "company": "", "from": "", "to": "",
                    "desc": "Responsible for the website\nI worked on many things\nHelped the team"}],
}


def _levels(result):
    return {c["id"].split(":")[0]: c["level"] for c in result["checks"]}


def test_a_strong_cv_is_ready_to_send():
    r = cvstandard.check(STRONG)
    assert r["fixes"] == 0 and r["score"] >= 85 and r["grade"] == "Ready to send", r
    levels = _levels(r)
    assert levels["contact"] == levels["linkedin"] == levels["metrics"] == levels["layout"] == "ok"


def test_a_weak_cv_gets_the_right_fixes():
    r = cvstandard.check(WEAK)
    levels = _levels(r)
    assert r["grade"] == "Needs work" and r["score"] < 65
    assert levels["contact"] == "fix"                       # no email, phone or location
    assert levels["linkedin"] == "improve"
    assert levels["role-name"] == "fix" and levels["role-dates"] == "fix"
    assert levels["verbs"] == "improve" and levels["first-person"] == "improve" and levels["metrics"] == "improve"
    assert levels["skills"] == "improve"                     # 25 skills: a keyword list
    assert levels["layout"] == "improve"                     # two-column template
    assert levels["summary"] == "improve"                    # too long / buzzwords
    assert r["checks"][0]["level"] == "fix"                  # fixes come first


def test_the_check_is_free_and_needs_no_account():
    c = client()
    r = c.post("/api/assist/cv-check", json={"cv": STRONG})
    assert r.status_code == 200 and r.json()["grade"] == "Ready to send"


def test_every_ai_cv_feature_writes_to_the_standard(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(cfg, "PLAN_LIMITS", True)
    seen = []

    def parse(schema, system, content, max_tokens=4000, effort="low"):
        seen.append(system)
        return None, ai.error(503, "stop here")
    monkeypatch.setattr(ai, "parse", parse)
    c = client(); h = sign_up(c, "standard@example.com")
    admin_cli.main(["set-plan", "standard@example.com", "premium"])
    c.post("/api/assist/tailor-cv", json={"job_text": "We need a backend engineer. " * 5, "cv": {"notes": "I build APIs.", "skills": "Python"}}, headers=h)
    c.post("/api/assist/tailor-cv", json={"job_text": "We need a backend engineer. " * 5, "cv": {},
                                          "background_text": "Backend engineer at Acme since 2020, building payment APIs."}, headers=h)
    c.post("/api/assist/profiles", json={"kind": "cv", "text": "Backend engineer at Acme since 2020, building payment APIs."}, headers=h)
    assert len(seen) == 3 and all(cvstandard.STANDARD in s for s in seen)
    # A portfolio isn't a CV: no CV rules there.
    c.post("/api/assist/profiles", json={"kind": "portfolio", "text": "Backend engineer at Acme since 2020, building payment APIs."}, headers=h)
    assert cvstandard.STANDARD not in seen[-1]
