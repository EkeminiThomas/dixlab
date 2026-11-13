"""Prompt-to-customisation: turn "make it dark purple with serif headings" into
validated changes to a portfolio, CV or case study, using Claude with
structured outputs. The API key stays on the server."""
import json
import re
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, create_model

from .. import ai
from ..catalog import (CASE_TEMPLATES, CV_SIZES, CV_TEMPLATES, FONT_PAIRS, MOTIONS, SITE_TEMPLATES, SPEEDS,
                       font_lines, template_lines)
from ..security import current_user

router = APIRouter(prefix="/api", tags=["customize"])

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _lit(values: list[str]):
    return Literal[tuple(values + ["keep"])]


def _site_changes(name: str, keys: list[str]):
    """Portfolios and case studies share a shape; only the template list differs."""
    return create_model(
        name,
        template=(_lit(keys), Field(description='Template key, or "keep".')),
        font=(_lit(list(FONT_PAIRS)), Field(description='Font pair key, or "keep".')),
        accent=(str, Field(description='A 6-digit hex colour like "#7b5cff", "default" for the template colour, or "keep".')),
        motion=(_lit(MOTIONS), Field(description='Animation direction, or "keep".')),
        speed=(_lit(SPEEDS), Field(description='Animation speed, or "keep".')),
        role=(str, Field(description='New role/job title, or "" to keep the current one.')),
        tagline=(str, Field(description='New tagline (may contain one \\n line break), or "" to keep the current one.')),
        summary=(str, Field(description="One short, friendly sentence describing what you changed, addressed to the user.")),
    )


SiteChanges = _site_changes("SiteChanges", list(SITE_TEMPLATES))
CaseChanges = _site_changes("CaseChanges", list(CASE_TEMPLATES))
CvChanges = create_model(
    "CvChanges",
    template=(_lit(list(CV_TEMPLATES)), Field(description='Template key, or "keep".')),
    font=(_lit(list(FONT_PAIRS)), Field(description='Font pair key, or "keep".')),
    accent=(str, Field(description='A 6-digit hex colour like "#1e3a8a", "default" for the template colour, or "keep".')),
    size=(_lit(CV_SIZES), Field(description='Text size, or "keep".')),
    headline=(str, Field(description='New headline/job title under the name, or "" to keep the current one.')),
    profile=(str, Field(description='Rewritten professional summary, or "" to keep the current one.')),
    summary=(str, Field(description="One short, friendly sentence describing what you changed, addressed to the user.")),
)


def _site_system(what: str, catalog: dict[str, str]) -> str:
    return f"""You customise {what} built with Dixlab. The user describes, in plain language, how they want it to look or read. Translate their request into changes.

Rules:
- Change only what the request asks for or clearly implies. Use "keep" (or "" for text fields) for everything else.
- Only switch template if the user asks for a different layout, style family or field (e.g. "make it look like a terminal", "I'm a filmmaker, make it cinematic"). Colour or font requests alone never switch template.
- Accent: pick a tasteful hex that matches the description (e.g. "dark purple" -> "#5b21b6", "forest green" -> "#166534"). Use "default" if they ask to go back to the original colour.
- Only rewrite role or tagline when the user asks to change the wording. Keep their voice; never invent facts, employers, numbers or awards.
- If the request is unrelated to the page's look or wording, change nothing and say so in the summary.

Templates:
{template_lines(catalog)}

Font pairs:
{font_lines()}

Animation directions (sections animate in as they appear): {", ".join(MOTIONS)}.
Animation speeds: {", ".join(SPEEDS)}."""


CV_SYSTEM = f"""You customise a CV (résumé) built with Dixlab. It is a printed A4 document, so there is no animation. The user describes, in plain language, how they want it to look or read. Translate their request into changes.

Rules:
- Change only what the request asks for or clearly implies. Use "keep" (or "" for text fields) for everything else.
- Only switch template if the user asks for a different layout or style, or names a field or seniority it suits (e.g. "make it ATS-friendly", "I'm a graduate", "two columns"). Colour or font requests alone never switch template.
- Accent: pick a professional hex that matches the description. Use "default" to go back to the template colour.
- Size: "compact" helps a long CV fit on fewer pages; "roomy" is easier to read.
- Only rewrite the headline or the profile summary when asked. A rewritten summary must use only facts already in the current summary; never invent employers, numbers, qualifications or achievements. Keep it to 2–4 sentences in the user's voice.
- If the request is unrelated to the CV's look or wording, change nothing and say so in the summary.

Templates:
{template_lines(CV_TEMPLATES)}

Font pairs:
{font_lines()}

Text sizes: {", ".join(CV_SIZES)}."""

KINDS = {
    "site": (SiteChanges, _site_system("a portfolio website", SITE_TEMPLATES), SITE_TEMPLATES),
    "case": (CaseChanges, _site_system('a case study page (the "tagline" is its one-line summary)', CASE_TEMPLATES), CASE_TEMPLATES),
    "cv": (CvChanges, CV_SYSTEM, CV_TEMPLATES),
}


class CustomizeIn(BaseModel):
    prompt: str = Field(max_length=1500)
    current: dict[str, Any] = Field(default_factory=dict)
    kind: Literal["site", "cv", "case"] = "site"


def _normalise(kind: str, out, catalog: dict[str, str]) -> dict:
    """Only include fields that change, in the shape the frontend applies."""
    changes: dict[str, Any] = {}
    brand: dict[str, Any] = {}
    if out.template != "keep" and out.template in catalog:
        changes["template"] = out.template
    if out.font != "keep":
        brand["font"] = out.font
    if out.accent == "default":
        brand["accent"] = None
    elif HEX.match(out.accent):
        brand["accent"] = out.accent.lower()
    if kind == "cv":
        if out.size != "keep":
            brand["size"] = out.size
        if out.headline.strip():
            changes["role"] = out.headline.strip()
        if out.profile.strip():
            changes["notes"] = out.profile.strip()
    else:
        if out.motion != "keep":
            brand["motion"] = out.motion
        if out.speed != "keep":
            brand["speed"] = out.speed
        if out.role.strip():
            changes["role"] = out.role.strip()
        if out.tagline.strip():
            changes["tagline"] = out.tagline.strip()
    if brand:
        changes["brand"] = brand
    return changes


@router.post("/customize")
def customize(body: CustomizeIn, user=Depends(current_user)):
    prompt = body.prompt.strip()
    if not prompt:
        return ai.error(400, "Describe the change you want.")
    blocked = ai.guard(user["id"])
    if blocked:
        return blocked
    schema, system, catalog = KINDS[body.kind]
    content = f"Current settings:\n{json.dumps(body.current, ensure_ascii=False, indent=2)}\n\nRequest:\n{prompt}"
    out, err = ai.parse(schema, system, content)
    if err:
        return err
    return {"changes": _normalise(body.kind, out, catalog), "summary": out.summary}
