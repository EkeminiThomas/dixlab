"""Reading public profiles: each platform's reader against recorded answers (no internet)."""
import json

import pytest

import test_api  # noqa: F401  (sets up the environment first)
from app import profile_readers as pr, webread
from app.webread import Unreadable

ANSWERS = {
    "https://gitlab.com/api/v4/users?username=ada": [{"id": 7, "username": "ada", "name": "Ada Okafor"}],
    "https://gitlab.com/api/v4/users/7/projects?per_page=30&order_by=last_activity_at": [
        {"id": 70, "name": "ledger", "description": "Double-entry ledger in Go", "star_count": 40, "forks_count": 3,
         "web_url": "https://gitlab.com/ada/ledger", "topics": ["go", "fintech"], "default_branch": "main", "last_activity_at": "2026-10-01"},
        {"id": 71, "name": "someone-elses", "forked_from_project": {"id": 1}, "star_count": 999}],
    "https://gitlab.com/api/v4/projects/70/repository/files/README.md/raw?ref=main": "# ledger\nKeeps every naira balanced.",
    "https://api.stackexchange.com/2.3/users/123?site=stackoverflow": {"items": [
        {"display_name": "Ada &amp; Co", "reputation": 15420, "badge_counts": {"gold": 3, "silver": 20, "bronze": 40}, "location": "Lagos"}]},
    "https://api.stackexchange.com/2.3/users/123/top-tags?site=stackoverflow&pagesize=12": {"items": [
        {"tag_name": "python", "answer_count": 210, "answer_score": 900}, {"tag_name": "postgresql", "answer_count": 50, "answer_score": 200}]},
    "https://api.stackexchange.com/2.3/users/123/answers?site=stackoverflow&sort=votes&order=desc&pagesize=8": {"items": [
        {"question_id": 9, "score": 120, "is_accepted": True}]},
    "https://api.stackexchange.com/2.3/questions/9?site=stackoverflow": {"items": [
        {"question_id": 9, "title": "Why is my Postgres query slow?", "tags": ["postgresql", "performance"]}]},
    "https://huggingface.co/api/users/ada/overview": {"fullname": "Ada Okafor", "numModels": 2, "numFollowers": 31},
    "https://huggingface.co/api/models?author=ada&sort=downloads&direction=-1&limit=8": [
        {"id": "ada/yoruba-ner", "pipeline_tag": "token-classification", "downloads": 51234, "likes": 12}],
    "https://huggingface.co/api/datasets?author=ada&sort=downloads&direction=-1&limit=8": [],
    "https://huggingface.co/api/spaces?author=ada&sort=likes&direction=-1&limit=8": [],
    "https://pub.orcid.org/v3.0/0000-0002-1825-0097/record": {
        "person": {"name": {"given-names": {"value": "Ada"}, "family-name": {"value": "Okafor"}},
                   "biography": {"content": "Public health researcher."}, "keywords": {"keyword": [{"content": "epidemiology"}]}},
        "activities-summary": {
            "employments": {"affiliation-group": [{"summaries": [{"employment-summary": {
                "role-title": "Research Fellow", "organization": {"name": "University of Ibadan", "address": {"city": "Ibadan", "country": "NG"}},
                "start-date": {"year": {"value": "2021"}}, "end-date": None}}]}]},
            "educations": {"affiliation-group": [{"summaries": [{"education-summary": {
                "role-title": "PhD Epidemiology", "organization": {"name": "University of Lagos"}, "start-date": {"year": {"value": "2016"}},
                "end-date": {"year": {"value": "2020"}}}}]}]},
            "works": {"group": [{"work-summary": [{"title": {"title": {"value": "Malaria trends in West Africa"}},
                                                   "journal-title": {"value": "The Lancet"}, "type": "journal-article",
                                                   "publication-date": {"year": {"value": "2024"}}}]}]}}},
    "https://www.credly.com/users/ada-okafor/badges.json": {"data": [
        {"badge_template": {"name": "AWS Certified Solutions Architect – Associate", "skills": [{"name": "Cloud Architecture"}]},
         "issuer": {"summary": "issued by Amazon Web Services Training and Certification"}, "issued_at_date": "2025-03-02",
         "expires_at_date": "2028-03-02"}]},
    "https://medium.com/feed/@ada": ("<rss><channel><title>Stories by Ada on Medium</title><item><title><![CDATA[Scaling payments in Lagos]]></title>"
                                     "<pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate><category><![CDATA[fintech]]></category></item></channel></rss>"),
    "https://dev.to/api/users/by_username?url=ada": {"name": "Ada Okafor", "summary": "Backend dev", "location": "Lagos"},
    "https://dev.to/api/articles?username=ada&per_page=20": [
        {"title": "Idempotent webhooks", "description": "Never charge twice", "public_reactions_count": 88,
         "published_at": "2026-05-01T00:00:00Z", "tag_list": ["api", "payments"]}],
    "https://ada.hashnode.dev/rss.xml": "<rss><channel><title>Ada's blog</title><item><title>Notes on Kafka</title></item></channel></rss>",
}


@pytest.fixture(autouse=True)
def recorded(monkeypatch):
    fetched = []

    def fetch(url, accept="text/html"):
        fetched.append(url)
        if url not in ANSWERS:
            raise Unreadable("The site answered 404.")
        body = ANSWERS[url]
        return (body if isinstance(body, str) else json.dumps(body)), "application/json"
    monkeypatch.setattr(webread, "fetch", fetch)
    return fetched


def test_gitlab_reads_original_projects_and_readmes():
    t = pr.read("https://gitlab.com/ada", 4000)
    assert "Ada Okafor" in t and "ledger · Double-entry ledger in Go · 40 stars" in t and "Keeps every naira balanced" in t
    assert "someone-elses" not in t                     # forks are left out


def test_stackoverflow_reads_tags_and_solved_questions():
    t = pr.read("https://stackoverflow.com/users/123/ada", 4000)
    assert "Ada & Co" in t and "15,420" in t and "python (210 / 900)" in t
    assert "Why is my Postgres query slow? · answer score 120 · accepted" in t
    with pytest.raises(Unreadable, match="profile link"):
        pr.read("https://stackoverflow.com/questions/1", 4000)


def test_huggingface_orcid_credly():
    hf = pr.read("https://huggingface.co/ada", 4000)
    assert "Ada Okafor" in hf and "ada/yoruba-ner · token-classification · 51,234 downloads" in hf
    o = pr.read("https://orcid.org/0000-0002-1825-0097", 4000)
    assert "Ada Okafor" in o and "Research Fellow · University of Ibadan · Ibadan, NG · 2021–Present" in o
    assert "PhD Epidemiology · University of Lagos · 2016–2020" in o and "Malaria trends in West Africa · The Lancet" in o
    c = pr.read("https://www.credly.com/users/ada-okafor", 4000)
    assert "AWS Certified Solutions Architect – Associate · Amazon Web Services" in c and "issued 2025-03-02" in c


def test_writing_platforms():
    assert "Scaling payments in Lagos" in pr.read("https://medium.com/@ada", 4000)
    d = pr.read("https://dev.to/ada", 4000)
    assert "Idempotent webhooks" in d and "88 reactions" in d and "Backend dev" in d
    assert "Notes on Kafka" in pr.read("https://ada.hashnode.dev", 4000)
    with pytest.raises(Unreadable, match="blog"):
        pr.read("https://hashnode.com/@ada", 4000)       # a profile page doesn't say where the blog is


def test_linkedin_and_x_are_never_fetched(recorded):
    for url in ("https://www.linkedin.com/in/ada", "https://x.com/ada", "https://twitter.com/ada"):
        with pytest.raises(Unreadable):
            pr.read(url, 4000)
    assert recorded == []
    text, sources = webread.gather(["https://www.linkedin.com/in/ada", "https://gitlab.com/ada"], 6000)
    assert [s["read"] for s in sources] == [False, True] and "text box" in sources[0]["tip"] and "ledger" in text


def test_platforms_are_recognised():
    cases = {"https://github.com/ada": "github", "https://gitlab.com/ada": "gitlab", "https://stackoverflow.com/users/1/a": "stackoverflow",
             "https://huggingface.co/ada": "huggingface", "https://orcid.org/0000-0002-1825-0097": "orcid",
             "https://www.credly.com/users/ada": "credly", "https://medium.com/@ada": "medium", "https://ada.medium.com": "medium",
             "https://dev.to/ada": "devto", "https://ada.hashnode.dev": "hashnode", "https://ada.dev": "web"}
    assert {u: pr.platform(u) for u in cases} == cases
