"""The CV standard Dixlab writes to and checks against.

Based on what Mercor (work.mercor.com), which hires domain experts through AI
screening, publishes for applicants (talent.docs.mercor.com: profile setup and
résumé guidelines), plus widely shared screening practice:

- Experience: 3-5 bullets per role, each leading with the outcome (what was
  delivered, for whom, the impact) with scale metrics where possible.
- Projects: 2-4, each with the problem, your role, the stack and the outcome,
  with a link where allowed.
- Skills: core skills first; no long keyword lists.
- Avoid vague descriptions, outdated tech, inflated titles, broken links and
  text copied from job listings.
- Format: a text-based PDF of 1-2 pages, a simple single-column layout (no
  tables, images or complex designs), standard headings (Education, Experience,
  Skills, Certifications), and contact details incl. LinkedIn and city/country.

STANDARD is added to every AI prompt that writes a CV; check() scores a CV
against the same rules, with no AI involved (instant and free)."""
import re

STANDARD = """CV STANDARD (what expert-hiring platforms such as Mercor screen for):
- Concise and professional. No filler, no buzzwords ("passionate", "hard-working", "results-driven", "synergy"), no first person in bullets.
- Each role: 3 to 5 bullets. Each bullet starts with a strong past-tense verb (current role: present tense) and leads with the OUTCOME: what was delivered, for whom, and the impact.
  Include the scale or a number whenever the sources give one (users, revenue, %, time saved, team size). Never invent a number: if none is given, describe the concrete result instead.
  Keep bullets to one or two lines (under about 30 words).
- Titles exactly as held: never inflate a job title or seniority.
- Projects: 2 to 4 of the strongest, each saying the problem, the person's role, the stack used and the outcome, with the link if one exists.
- Skills: the core skills used daily first; at most about 12-15, grouped by relevance. No long keyword lists, no outdated tools unless the job asks for them.
- Summary: 2 to 3 sentences on who they are, their specialism and the value they bring to this kind of role.
- Use the job's own terms where they truthfully apply, but never copy sentences from the job advert.
- Keep it to what fits on 1 to 2 pages."""

SEP = "\n\n"  # between a prompt and STANDARD

# Mercor asks for "a simple, standardized layout: avoid images, tables, or complex designs".
SAFE_TEMPLATES = {"plain", "classic"}
WEAK_STARTS = ("responsible for", "worked on", "helped", "duties included", "tasked with", "in charge of",
               "assisted with", "involved in", "participated in", "worked with")
BUZZWORDS = ("passionate", "hard-working", "hardworking", "results-driven", "team player", "go-getter", "synergy",
             "self-starter", "detail-oriented", "dynamic", "rockstar", "ninja", "guru")
_NUMBER = re.compile(r"\d|%|\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b", re.I)
_FIRST_PERSON = re.compile(r"\b(i|me|my|mine)\b", re.I)
_YEAR = re.compile(r"(19|20)\d{2}|present|current|now", re.I)


def _list(v) -> list[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [x.strip() for x in str(v or "").split(",") if x.strip()]


def _bullets(desc: str) -> list[str]:
    return [re.sub(r"^[-•*]\s*", "", b).strip() for b in str(desc or "").split("\n") if b.strip()]


def check(cv: dict) -> dict:
    """Score a CV (the editor's fields) against STANDARD. No AI: instant and free.
    Returns {score, grade, summary, checks: [{id, level, title, detail}]}, level = fix | improve | ok."""
    checks: list[dict] = []

    def add(cid, level, title, detail=""):
        checks.append({"id": cid, "level": level, "title": title, "detail": detail})

    # ---- contact details
    missing = [label for key, label in (("name", "full name"), ("email", "email"), ("phone", "phone number"), ("location", "city and country"))
               if not str(cv.get(key) or "").strip()]
    if missing:
        add("contact", "fix", "Add your " + ", ".join(missing), "Expert-hiring platforms require these to screen and contact you.")
    else:
        add("contact", "ok", "Contact details are complete")
    links = " ".join(str(cv.get(k) or "") for k in ("website", "linkedin"))
    if "linkedin.com" not in links.lower():
        add("linkedin", "improve", "Add your LinkedIn profile",
            "Mercor asks for LinkedIn and checks that it matches your CV. Put it in “Website or LinkedIn”.")
    else:
        add("linkedin", "ok", "LinkedIn is linked")

    # ---- summary
    summary = str(cv.get("notes") or cv.get("summary") or "").strip()
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", summary) if s.strip()]
    if not summary:
        add("summary", "improve", "Add a 2–3 sentence summary", "Who you are, your specialism, and the value you bring.")
    elif len(sentences) > 4 or len(summary) > 600:
        add("summary", "improve", "Shorten your summary to 2–3 sentences", "Screeners skim. Keep only your specialism and strongest proof.")
    elif any(w in summary.lower() for w in BUZZWORDS):
        add("summary", "improve", "Replace buzzwords in your summary with specifics",
            "Words like “passionate” or “results-driven” say nothing a screener can check. Name your field, years and a result.")
    else:
        add("summary", "ok", "Summary is concise")

    # ---- experience
    roles = [r for r in (cv.get("experience") or []) if isinstance(r, dict) and (str(r.get("role") or "").strip() or str(r.get("company") or "").strip())]
    all_bullets: list[str] = []
    if not roles:
        add("experience", "fix", "Add your work experience", "Each role: title, organisation, dates and 3–5 outcome-led bullets.")
    for r in roles:
        name = " · ".join(x for x in (str(r.get("role") or "").strip(), str(r.get("company") or "").strip()) if x) or "A role"
        bl = _bullets(r.get("desc"))
        all_bullets += bl
        if not (str(r.get("role") or "").strip() and str(r.get("company") or "").strip()):
            add(f"role-name:{name}", "fix", f"{name}: add both the job title and the organisation")
        if not _YEAR.search(f"{r.get('from') or ''} {r.get('to') or ''}"):
            add(f"role-dates:{name}", "fix", f"{name}: add dates", "Start and end years (or “Present”).")
        if not bl:
            add(f"role-bullets:{name}", "fix", f"{name}: add 3–5 bullets", "Lead each with what you delivered, for whom, and the impact.")
        elif len(bl) < 3:
            add(f"role-bullets:{name}", "improve", f"{name}: add {3 - len(bl)} more bullet{'s' if 3 - len(bl) > 1 else ''}", "Aim for 3–5 per role.")
        elif len(bl) > 5:
            add(f"role-bullets:{name}", "improve", f"{name}: cut to your 5 strongest bullets", f"It has {len(bl)}. Mercor recommends 3–5 per role.")
    if all_bullets:
        with_numbers = sum(1 for b in all_bullets if _NUMBER.search(b))
        share = with_numbers / len(all_bullets)
        if share < 0.4:
            add("metrics", "improve", f"Add numbers to more bullets ({with_numbers} of {len(all_bullets)} have one)",
                "Scale and results (users, revenue, %, time saved, team size) are what screeners look for, e.g. “reduced latency by 40%”.")
        else:
            add("metrics", "ok", f"{with_numbers} of {len(all_bullets)} bullets show a number or scale")
        weak = [b for b in all_bullets if b.lower().startswith(WEAK_STARTS)]
        if weak:
            add("verbs", "improve", f"Start {len(weak)} bullet{'s' if len(weak) > 1 else ''} with what you did, not your duties",
                f"For example, rewrite “{weak[0][:60]}…” to start with a verb like Built, Led, Cut, Grew or Shipped.")
        long = [b for b in all_bullets if len(b.split()) > 32]
        if long:
            add("long-bullets", "improve", f"Shorten {len(long)} long bullet{'s' if len(long) > 1 else ''}", "Keep bullets under about 30 words: one line or two.")
        if any(_FIRST_PERSON.search(b) for b in all_bullets):
            add("first-person", "improve", "Remove “I/my” from bullets", "CV bullets start with the verb: “Built…”, not “I built…”.")
        if not (weak or long) and share >= 0.4:
            add("bullets", "ok", "Bullets are outcome-led and concise")

    # ---- skills
    skills = _list(cv.get("skills"))
    if not skills:
        add("skills", "fix", "Add your core skills", "The tools and methods you use daily, most important first.")
    elif len(skills) > 18:
        add("skills", "improve", f"Trim your skills to the 12–15 you use most (you list {len(skills)})",
            "Mercor warns against long keyword lists: lead with your core skills.")
    else:
        add("skills", "ok", f"{len(skills)} focused skills")

    # ---- projects
    projects = [p for p in (cv.get("projects") or []) if isinstance(p, dict) and (str(p.get("title") or "").strip() or str(p.get("desc") or "").strip())]
    if projects:
        if len(projects) > 4:
            add("projects", "improve", f"Keep your 2–4 strongest projects (you have {len(projects)})")
        no_link = [p for p in projects if not str(p.get("link") or "").strip()]
        if no_link:
            add("project-links", "improve", f"Add links to {len(no_link)} project{'s' if len(no_link) > 1 else ''}",
                "A repository, live site or case study, where you're allowed to share it.")
        if not no_link and len(projects) <= 4:
            add("projects", "ok", "Projects are focused and linked")

    # ---- education
    edu = [e for e in (cv.get("education") or []) if isinstance(e, dict) and (str(e.get("degree") or "").strip() or str(e.get("school") or "").strip())]
    if not edu:
        add("education", "improve", "Add your education", "Many expert roles ask for a degree in the field; list your highest qualification.")

    # ---- length and layout
    words = len(" ".join([summary, *all_bullets, *[str(p.get("desc") or "") for p in projects],
                          *[str(e.get("desc") or "") for e in edu]]).split()) + len(skills) * 2
    if words > 900:
        add("length", "fix", "Cut it to fit 2 pages", f"About {words} words: likely over 2 pages. Remove older or weaker bullets first.")
    elif words > 650:
        add("length", "improve", "Close to the 2-page limit", "Use the Compact text size, or trim older roles.")
    template = str(cv.get("template") or "")
    if template and template not in SAFE_TEMPLATES:
        add("layout", "improve", "Use a single-column template for applications",
            "Mercor and most screening systems ask for a simple layout without sidebars or tables. Plain or Classic parse cleanly.")
    elif template:
        add("layout", "ok", "Template parses cleanly (single column)")

    fixes = sum(1 for c in checks if c["level"] == "fix")
    improves = sum(1 for c in checks if c["level"] == "improve")
    score = max(0, 100 - fixes * 12 - improves * 5)
    grade = "Ready to send" if score >= 85 and not fixes else "Nearly there" if score >= 65 else "Needs work"
    order = {"fix": 0, "improve": 1, "ok": 2}
    checks.sort(key=lambda c: order[c["level"]])
    return {"score": score, "grade": grade, "fixes": fixes, "improvements": improves, "checks": checks}
