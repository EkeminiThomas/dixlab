"""What makes a case study persuasive to a hiring manager or client, written once:
used in the AI prompts that write case studies, and by check(), which scores a
case study for free (no AI) and lists what to fix.

A strong case study answers, in order: what was the situation and the problem
(with a number if possible), what was *your* part, how you worked (3-5 steps),
what you decided against and why, what changed (results in numbers), what you
learned. It shows the work (cover, visuals, before/after, a live link or
prototype) and reads in a few minutes."""
import re

STANDARD = """CASE STUDY STANDARD (what hiring managers and clients look for):
- Title leads with the outcome or change (e.g. "Halving the time to book an appointment"), not the project name.
- Problem: specific and concrete, with the scale or a number when the sources give one.
- Their part: say plainly what THEY owned and did ("I led…", "I built…"), separate from the team's work. Never inflate it.
- Process: 3 to 5 steps in order, each a short title and one or two sentences of what they did and why.
- Trade-offs: what they cut or decided against and why. This is where judgement shows.
- Results: 1 to 3 numbers they actually have (%, time, users, revenue, ratings). Never invent or estimate numbers. If there are none, describe the concrete result.
- Lessons: one honest thing they learned or would do differently.
- First person, plain and specific. No filler or buzzwords. Readable in 3 to 8 minutes."""

_NUMBER = re.compile(r"\d")


def _text(v) -> str:
    return str(v or "").strip()


def _words(*parts) -> int:
    return sum(len(_text(p).split()) for p in parts)


def check(c: dict) -> dict:
    """Score a case study (the editor's fields) against STANDARD. Returns
    {score, grade, readMinutes, checks: [{id, level, title, detail}]}, level = fix | improve | ok."""
    checks: list[dict] = []

    def add(cid, level, title, detail=""):
        checks.append({"id": cid, "level": level, "title": title, "detail": detail})

    title = _text(c.get("title"))
    if not title:
        add("title", "fix", "Add a title", "Lead with the outcome, e.g. “Halving the time to book an appointment”.")
    elif len(title.split()) <= 3 and not _NUMBER.search(title):
        add("title", "improve", "Make the title about the outcome", f"“{title}” names the project. Say what changed because of it.")
    else:
        add("title", "ok", "Title leads with the story")

    problem = _text(c.get("problem"))
    if not problem:
        add("problem", "fix", "Describe the problem", "What was going wrong, for whom, and why it was worth fixing.")
    elif len(problem.split()) < 12:
        add("problem", "improve", "Make the problem more specific", "Add who was affected and how much, with a number if you have one.")
    else:
        add("problem", "ok", "The problem is clear")

    if not _text(c.get("role")):
        add("role", "fix", "Add your role", "Your title on this project, e.g. “Lead designer” or “Backend engineer”.")
    contribution = _text(c.get("contribution"))
    if not contribution:
        add("contribution", "improve", "Say what you personally did", "Readers want your part, separate from the team’s: “I led…, I built…”.")
    elif not re.search(r"\b(i|my|me)\b", contribution, re.I):
        add("contribution", "improve", "Write your part in the first person", "“I designed…” reads as yours; “the team designed…” doesn’t.")
    else:
        add("contribution", "ok", "Your part is clear")

    steps = [s for s in (c.get("process") or []) if isinstance(s, dict) and (_text(s.get("title")) or _text(s.get("desc")))]
    if not steps:
        add("process", "fix", "Add your process", "3–5 steps in order: what you did and why.")
    elif len(steps) < 3:
        add("process", "improve", f"Add {3 - len(steps)} more process step{'s' if 3 - len(steps) > 1 else ''}", "3–5 steps show how you think.")
    elif len(steps) > 6:
        add("process", "improve", "Combine your process into 3–5 steps", f"It has {len(steps)}. Fewer, clearer steps read better.")
    else:
        add("process", "ok", f"{len(steps)} clear process steps")

    if not _text(c.get("tradeoffs")):
        add("tradeoffs", "improve", "Say what you cut or decided against", "This is where your judgement shows, and most case studies skip it.")
    else:
        add("tradeoffs", "ok", "Trade-offs are explained")

    if not _text(c.get("solution")):
        add("solution", "fix", "Describe what you ended up with", "The final product, design or system, in a sentence or two.")

    metrics = [m for m in (c.get("metrics") or []) if isinstance(m, dict) and _text(m.get("value")) and _text(m.get("label"))]
    if not metrics:
        add("metrics", "improve", "Add 1–3 results in numbers", "Time saved, % change, users, revenue or ratings: only numbers you really have.")
    elif not any(_NUMBER.search(_text(m.get("value"))) for m in metrics):
        add("metrics", "improve", "Use numbers in your results", "“54s” or “+38%” lands harder than words.")
    else:
        add("metrics", "ok", f"{len(metrics)} result{'s' if len(metrics) > 1 else ''} in numbers")

    if not _text(c.get("learned")):
        add("learned", "improve", "Add one thing you learned", "An honest lesson or what you’d do differently.")

    has_cover = bool((c.get("cover") or {}).get("src")) if isinstance(c.get("cover"), dict) else False
    visuals = len([g for g in (c.get("gallery") or []) if isinstance(g, dict) and g.get("src")])
    compare = c.get("compare") if isinstance(c.get("compare"), dict) else {}
    has_compare = bool((compare.get("before") or {}).get("src") and (compare.get("after") or {}).get("src"))
    embeds = [e for e in (c.get("embeds") or []) if isinstance(e, dict) and _text(e.get("url"))]
    if not has_cover:
        add("cover", "improve", "Add a cover image", "Your strongest final screen or photo.")
    if not (visuals or has_compare or embeds):
        add("visuals", "improve", "Show the work", "Add visuals (screens from your Figma file, screenshots), a before/after comparison, or a video walkthrough.")
    else:
        add("visuals", "ok", "The work is shown")
    if not (_text(c.get("link")) or embeds):
        add("link", "improve", "Add a live link, repository or prototype", "Let people try it, not just read about it.")

    words = _words(c.get("notes"), problem, c.get("research"), contribution, c.get("tradeoffs"), c.get("solution"), c.get("learned"),
                   c.get("next"), *[f"{s.get('title', '')} {s.get('desc', '')}" for s in steps])
    minutes = max(1, round(words / 220))
    if words < 150:
        add("length", "improve", "Tell a little more of the story", "Under a minute to read: add context, your process and the result.")
    elif minutes > 10:
        add("length", "improve", f"Tighten it (about {minutes} minutes to read)", "Aim for 3–8 minutes: cut detail that doesn’t change the story.")

    fixes = sum(1 for x in checks if x["level"] == "fix")
    improves = sum(1 for x in checks if x["level"] == "improve")
    score = max(0, 100 - fixes * 12 - improves * 5)
    grade = "Ready to share" if score >= 85 and not fixes else "Nearly there" if score >= 65 else "Needs work"
    order = {"fix": 0, "improve": 1, "ok": 2}
    checks.sort(key=lambda x: order[x["level"]])
    return {"score": score, "grade": grade, "readMinutes": minutes, "fixes": fixes, "improvements": improves, "checks": checks}
