"""Shared AI helpers: structured-output calls, a per-user rate limit, and
consistent error responses. Two providers are supported:

- Groq (GROQ_API_KEY), with an open model that supports strict JSON schemas.
- Anthropic (ANTHROPIC_API_KEY), with Claude.

Groq is used when its key is set (or DIXLAB_AI_PROVIDER=groq); otherwise Claude.
Keys are read from the environment on the server and never sent to the browser
or logged."""
import json
import logging
import os

import anthropic
import httpx
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import AI_REQUESTS_PER_MINUTE, PRODUCTION
from .ratelimit import Limiter

MODEL = "claude-opus-5-5"                  # Anthropic
FALLBACK_BETA = "server-side-fallback-2026-07-01"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"  # production model with strict structured outputs
# Groq's free tier allows about 8,000 tokens a minute (prompt + reply), so replies are capped.
GROQ_MAX_TOKENS = int(os.getenv("DIXLAB_GROQ_MAX_TOKENS", "4000"))

_client: anthropic.Anthropic | None = None
_recent = Limiter("ai_user", AI_REQUESTS_PER_MINUTE, 60)

log = logging.getLogger("dixlab")


def provider() -> str:
    chosen = os.getenv("DIXLAB_AI_PROVIDER", "").strip().lower()
    if chosen in ("groq", "anthropic"):
        return chosen
    return "groq" if os.getenv("GROQ_API_KEY") else "anthropic"


def configured() -> bool:
    return bool(os.getenv("GROQ_API_KEY" if provider() == "groq" else "ANTHROPIC_API_KEY"))


def model() -> str:
    return os.getenv("GROQ_MODEL", GROQ_DEFAULT_MODEL) if provider() == "groq" else MODEL


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def rate_limited(user_id: str) -> bool:
    return not _recent.hit(user_id)


def error(status: int, message: str, unavailable: bool = False, code: str | None = None, **extra) -> JSONResponse:
    body = {"error": message, **extra}
    if unavailable:
        body["unavailable"] = True
    if code:
        body["code"] = code
    return JSONResponse(body, status_code=status)


def guard(user_id: str, feature: str | None = None) -> JSONResponse | None:
    """Return an error response if AI can't run for this request. Plans come
    first: Free has no AI, Pro has a monthly allowance. These answer 402 with
    `unavailable`, so the frontend falls back to its built-in (non-AI) version."""
    if feature:
        from . import plans
        from .db import connect
        with connect() as db:
            blocked = plans.ai_block(db, user_id, feature)
        if blocked:
            code, message, needed = blocked
            return error(402, message, unavailable=True, code=code, needed=needed)
    if not configured():
        return error(503, "AI is not configured on this server.", unavailable=True)
    if rate_limited(user_id):
        return error(429, "Too many requests. Try again in a moment.")
    return None


def track(user_id: str, feature: str, err: JSONResponse | None, usage: str | None = None) -> None:
    """Log one AI request for the admin dashboard (feature, success, status), and
    count its cost (plans.AI_COSTS[usage or feature]) against the plan's allowance."""
    from . import events  # local import: events -> db -> config only
    events.log_now(f"ai.{feature}", user_id, ok=err is None, status=None if err is None else err.status_code)
    if err is None:  # only successful requests count against a plan's monthly allowance
        from . import plans
        from .db import connect
        with connect() as db:
            plans.record_ai(db, user_id, usage or feature)


def parse(schema, system: str, content: str, max_tokens: int = 4000, effort: str = "low"):
    """Structured output call. Returns (parsed, None) or (None, JSONResponse)."""
    if provider() == "groq":
        return _groq_parse(schema, system, content, max_tokens, effort)
    return _anthropic_parse(schema, system, content, max_tokens, effort)


# ---------------------------------------------------------------- Groq

def strict_schema(schema_model) -> dict:
    """A Pydantic model's JSON schema in the form Groq's strict mode needs: every
    object lists all its properties as required and allows no others."""
    s = schema_model.model_json_schema()

    def fix(node):
        if isinstance(node, list):
            for x in node:
                fix(x)
            return
        if not isinstance(node, dict):
            return
        if "$ref" in node:  # a reference may not carry other keywords
            for k in [k for k in node if k != "$ref"]:
                del node[k]
            return
        node.pop("title", None)
        node.pop("default", None)
        if node.get("type") == "object" or "properties" in node:
            props = node.get("properties", {})
            node["additionalProperties"] = False
            node["required"] = list(props)
            for sub in props.values():
                fix(sub)
        for key in ("items", "anyOf", "allOf", "oneOf", "prefixItems"):
            if key in node:
                fix(node[key])
        for sub in node.get("$defs", {}).values():
            fix(sub)

    fix(s)
    return s


def _groq_failure(r: httpx.Response) -> JSONResponse:
    try:
        detail = (r.json().get("error") or {}).get("message", "")
    except ValueError:
        detail = ""
    log.warning("Groq API error %s: %s", r.status_code, detail or r.text[:200])
    extra = {} if PRODUCTION else {"detail": detail[:300]}
    low = detail.lower()
    if r.status_code == 401:
        return error(503, "The AI key on this server was rejected. Check GROQ_API_KEY in the backend settings, then restart the backend.",
                     unavailable=True, **extra)
    if r.status_code == 429 or "rate limit" in low:
        wait = r.headers.get("retry-after")
        return error(429, f"The AI service is at its limit. Try again in {wait or 'a few'} seconds."
                     " (Groq’s free tier allows a few requests a minute.)", **extra)
    if r.status_code == 413 or "too large" in low or "context" in low:
        return error(413, "That’s too much text for the AI at once. Shorten what you pasted and try again.", **extra)
    if r.status_code == 404 or ("model" in low and ("not" in low or "decommission" in low)):
        return error(503, "The AI model isn’t available. Set GROQ_MODEL to a current Groq model.", unavailable=True, **extra)
    if r.status_code >= 500:
        return error(503, "The AI service is busy. Try again in a minute.", **extra)
    return error(502, f"The AI service returned an error ({r.status_code}).", **extra)


def _groq_parse(schema, system, content, max_tokens, effort):
    body = {
        "model": model(),
        "messages": [{"role": "system", "content": system + "\n\nReply with JSON only, matching the schema."},
                     {"role": "user", "content": content}],
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": schema.__name__, "strict": True, "schema": strict_schema(schema)}},
        "max_completion_tokens": min(max_tokens, GROQ_MAX_TOKENS),
        "reasoning_effort": "medium" if effort in ("medium", "high") else "low",
    }
    try:
        r = httpx.post(GROQ_URL, json=body, timeout=120,
                       headers={"Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}"})
    except httpx.HTTPError as e:
        log.warning("Couldn't reach Groq's API: %s", type(e).__name__)
        return None, error(503, "Could not reach the AI service.", unavailable=True)
    if r.status_code != 200:
        return None, _groq_failure(r)
    try:
        choice = r.json()["choices"][0]
        text = choice["message"].get("content") or ""
    except (ValueError, KeyError, IndexError):
        return None, error(502, "Could not understand the response.")
    if choice.get("finish_reason") == "length":
        return None, error(502, "The AI ran out of room before finishing. Try again with less text.")
    try:
        return schema.model_validate(json.loads(text)), None
    except (ValueError, ValidationError):
        log.warning("Groq reply didn't match the %s schema", schema.__name__)
        return None, error(502, "Could not understand the response.")


# ---------------------------------------------------------------- Anthropic

def _anthropic_failure(e: Exception) -> JSONResponse:
    if isinstance(e, anthropic.AuthenticationError):
        log.warning("Anthropic rejected the API key (401). Check ANTHROPIC_API_KEY and restart the server.")
        return error(503, "The AI key on this server was rejected. Check ANTHROPIC_API_KEY in the backend settings, then restart the backend.", unavailable=True)
    if isinstance(e, anthropic.RateLimitError):
        return error(429, "Too many requests. Try again in a moment.")
    if isinstance(e, anthropic.APIConnectionError):
        log.warning("Couldn't reach Anthropic's API: %s", type(e).__name__)
        return error(503, "Could not reach the AI service.", unavailable=True)
    status = getattr(e, "status_code", 0)
    body = getattr(e, "body", None)
    detail = (body.get("error") or {}).get("message", "") if isinstance(body, dict) else ""
    log.warning("Anthropic API error %s: %s", status, detail or e)
    low = detail.lower()
    extra = {} if PRODUCTION else {"detail": detail[:300]}
    if "credit balance" in low or "billing" in low:
        return error(503, "The Anthropic account behind this server has no credit. Add funds in Claude Console (Billing), then try again.",
                     unavailable=True, **extra)
    if status == 404 or ("model" in low and "not" in low):
        return error(503, "The AI model isn’t available to this Anthropic account.", unavailable=True, **extra)
    if status in (500, 529) or "overloaded" in low:
        return error(503, "The AI service is busy. Try again in a minute.", **extra)
    return error(502, f"The AI service returned an error ({status}).", **extra)


def _anthropic_parse(schema, system, content, max_tokens, effort):
    try:
        response = client().beta.messages.parse(
            model=MODEL,
            max_tokens=max_tokens,
            betas=[FALLBACK_BETA],
            fallbacks="default",
            output_config={"effort": effort},
            output_format=schema,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        return None, _anthropic_failure(e)
    if response.stop_reason == "refusal":
        return None, error(422, "The request could not be processed.")
    if response.parsed_output is None:
        return None, error(502, "Could not understand the response.")
    return response.parsed_output, None
