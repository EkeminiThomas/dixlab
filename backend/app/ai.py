"""Shared Claude helpers: one client, a per-user rate limit, and consistent
error responses. The API key is read from the environment on the server and
is never sent to the browser or logged."""
import os

import anthropic
from fastapi.responses import JSONResponse

from .config import AI_REQUESTS_PER_MINUTE
from .ratelimit import Limiter

MODEL = "claude-opus-5-5"
FALLBACK_BETA = "server-side-fallback-2026-07-01"

_client: anthropic.Anthropic | None = None
_recent = Limiter("ai_user", AI_REQUESTS_PER_MINUTE, 60)


def configured() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def rate_limited(user_id: str) -> bool:
    return not _recent.hit(user_id)


def error(status: int, message: str, unavailable: bool = False) -> JSONResponse:
    body = {"error": message}
    if unavailable:
        body["unavailable"] = True
    return JSONResponse(body, status_code=status)


def guard(user_id: str) -> JSONResponse | None:
    """Return an error response if AI can't run for this request."""
    if not configured():
        return error(503, "AI is not configured on this server.", unavailable=True)
    if rate_limited(user_id):
        return error(429, "Too many requests. Try again in a moment.")
    return None


def track(user_id: str, feature: str, err: JSONResponse | None) -> None:
    """Log one AI request for the admin dashboard (feature, success, status)."""
    from . import events  # local import: events -> db -> config only
    events.log_now(f"ai.{feature}", user_id, ok=err is None, status=None if err is None else err.status_code)


def parse(schema, system: str, content: str, max_tokens: int = 4000, effort: str = "low"):
    """Structured output call. Returns (parsed, None) or (None, JSONResponse)."""
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
    except anthropic.AuthenticationError:
        return None, error(503, "AI is not configured on this server.", unavailable=True)
    except anthropic.RateLimitError:
        return None, error(429, "Too many requests. Try again in a moment.")
    except anthropic.APIConnectionError:
        return None, error(503, "Could not reach the AI service.", unavailable=True)
    except anthropic.APIStatusError:
        return None, error(502, "The AI service returned an error.")
    if response.stop_reason == "refusal":
        return None, error(422, "The request could not be processed.")
    if response.parsed_output is None:
        return None, error(502, "Could not understand the response.")
    return response.parsed_output, None
