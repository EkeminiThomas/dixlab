"""Pages in more than one language.

A translation is stored on the project as a small overlay, {"path.to.field": "text"},
under project["translations"][lang]. The public page swaps those strings in when
a visitor picks the language. Only words people read are translated: links,
media, names, dates, colours, template settings and numbers stay as they are."""
import re

LANGS = {
    "en": "English", "fr": "French", "es": "Spanish", "pt": "Portuguese", "de": "German", "it": "Italian",
    "nl": "Dutch", "pl": "Polish", "tr": "Turkish", "ar": "Arabic", "sw": "Swahili", "yo": "Yoruba",
    "ha": "Hausa", "ig": "Igbo", "zh": "Chinese (Simplified)", "ja": "Japanese", "ko": "Korean", "hi": "Hindi",
}

# Never translated: identifiers, addresses, people's and organisations' names, dates and settings.
SKIP_KEYS = {
    "id", "type", "template", "status", "sample", "updatedat", "userid", "interview", "draftbackup", "translations", "lang",
    "src", "poster", "photo", "image", "avatar", "thumbnail", "bgimage", "cover", "files", "embeds",
    "link", "href", "url", "website", "linkedin", "github", "portfolio", "behance", "dribbble", "twitter", "instagram",
    "bookingurl", "email", "phone", "name", "company", "school", "client", "from", "to", "start", "end", "year", "date",
    "timezone", "rate", "custom", "customize", "theme", "font", "fonts", "color", "colour", "accent", "motion",
    "livestats", "cvprojectid", "availability", "stackoverflow", "location", "value", "design", "brand",
}
SKIP_VALUE = re.compile(r"^(?:https?://|mailto:|/|data:|#[0-9a-f]{3,8}$|[\d\s.,:%+\-–/()$€£₦]+$)", re.I)
MAX_CHARS = 14000   # per project, across all batches
BATCH_CHARS = 4500  # per AI call, to suit Groq's free tier


def strings(project: dict) -> list[tuple[str, str]]:
    """(path, text) for every string worth translating, in page order."""
    out: list[tuple[str, str]] = []
    total = 0

    def walk(obj, path: str, key: str):
        nonlocal total
        if key.lower() in SKIP_KEYS:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, f"{path}.{k}" if path else k, k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{path}.{i}", key)
        elif isinstance(obj, str):
            text = obj.strip()
            if len(text) < 2 or SKIP_VALUE.match(text) or total + len(text) > MAX_CHARS:
                return
            out.append((path, obj))
            total += len(text)

    walk(project, "", "")
    return out


def batches(items: list[tuple[str, str]]) -> list[list[tuple[str, str]]]:
    groups, cur, size = [], [], 0
    for item in items:
        if cur and size + len(item[1]) > BATCH_CHARS:
            groups.append(cur); cur, size = [], 0
        cur.append(item); size += len(item[1])
    if cur:
        groups.append(cur)
    return groups


def apply(project: dict, overlay: dict) -> dict:
    """The project with an overlay swapped in (used by tests; the browser does the same)."""
    import copy
    out = copy.deepcopy(project)
    for path, text in overlay.items():
        parts = path.split(".")
        node = out
        try:
            for p in parts[:-1]:
                node = node[int(p)] if isinstance(node, list) else node[p]
            last = parts[-1]
            if isinstance(node, list):
                node[int(last)] = text
            elif isinstance(node, dict) and isinstance(node.get(last), str):
                node[last] = text
        except (KeyError, IndexError, ValueError, TypeError):
            continue
    return out


SYSTEM = """You translate a person's professional portfolio, CV or case study.
You get a numbered list of text fragments from one page. Return exactly the same number of items, in the same order,
each one translated into {lang}.
Rules:
- Keep meaning, tone and confidence. Write like a native professional in {lang}, not word for word.
- Keep line breaks, bullet characters and blank lines inside an item exactly where they are.
- Do not translate product names, company names, technologies, programming languages, frameworks, file names or acronyms (React, Figma, AWS, SQL, KPI).
- Keep numbers, currencies, percentages and units; adapt only number formatting if {lang} needs it.
- If an item is already in {lang}, or is a proper name, return it unchanged.
- Never add commentary, quotes or numbering."""
