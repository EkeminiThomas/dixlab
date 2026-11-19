"""Dixlab API. Run from the backend folder:  uvicorn app.main:app --reload"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
import json
import os
from pathlib import Path

from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .config import API_DOCS, CORS_ORIGINS, LEGACY_ADMIN_EMAILS, PRODUCTION
from . import events
from .db import init_db
from .ratelimit import is_https
from .security import CSRF_HEADER, SESSION_COOKIE
from .admin import routes as admin
from .routers import account, analytics, assist, auth, billing, customize, interview, messages, projects, publish, twofactor, uploads

log = logging.getLogger("dixlab")


@asynccontextmanager
async def lifespan(_: FastAPI):
    from . import prodcheck, ratelimit
    prodcheck.run_on_startup()  # with DIXLAB_ENV=production, unsafe settings stop the server here
    init_db()
    from .admin.bootstrap import ensure_first_admin
    from .db import connect
    with connect() as db:
        ensure_first_admin(db)  # DIXLAB_FIRST_ADMIN: the first admin on hosts without a terminal
    events.prune()
    ratelimit.prune()
    from . import mailer
    if mailer.sendliberty():
        log.warning("Email: sending through SendLiberty as %s", mailer.SENDLIBERTY_FROM)
    elif mailer.placeholder_host():
        log.warning("SMTP_HOST is the example value (%s), not a real mail server, so it's ignored. "
                    "Set real SMTP_* values, or comment them out (DIXLAB_MAIL_TO_LOG=true prints emails locally).", mailer.SMTP_HOST)
    if LEGACY_ADMIN_EMAILS:
        log.warning("DIXLAB_ADMIN_EMAILS is no longer used and grants nothing. "
                    "Grant admin with: python -m app.admin grant you@example.com")
    yield


app = FastAPI(title="Dixlab API", version="1.0.0", lifespan=lifespan,
              docs_url="/docs" if API_DOCS else None, redoc_url="/redoc" if API_DOCS else None,
              openapi_url="/openapi.json" if API_DOCS else None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(account.router)
app.include_router(twofactor.router)
app.include_router(projects.router)
app.include_router(uploads.router)
app.include_router(customize.router)
app.include_router(interview.router)
app.include_router(assist.router)
app.include_router(analytics.router)
app.include_router(publish.router)
app.include_router(messages.router)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(uploads.files)

DOWNLOAD_ONLY = (".docx", ".pptx", ".xlsx")


@app.middleware("http")
async def upload_headers(request: Request, call_next):
    """Uploaded files are served as exactly what they are, and documents download."""
    response = await call_next(request)
    if request.url.path.startswith("/uploads/"):
        # Only verified images, videos and documents are stored; nosniff stops
        # browsers second-guessing the type. (A strict CSP here would break
        # Chrome's built-in PDF viewer.)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.url.path.endswith(DOWNLOAD_ONLY):
            response.headers["Content-Disposition"] = "attachment"
    return response


UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    """Changes made with the session cookie must carry X-Dixlab-Request. Other
    websites can't add that header (CORS blocks it), so they can't make a
    signed-in visitor's browser change anything. Bearer-token calls don't use
    the cookie and aren't affected; neither are logging in and signing up."""
    if (request.method in UNSAFE and request.url.path.startswith("/api/")
            and SESSION_COOKIE in request.cookies and "authorization" not in request.headers
            and request.url.path not in ("/api/auth/login", "/api/auth/signup")
            and request.headers.get(CSRF_HEADER) != "1"):
        return JSONResponse({"detail": "This request was blocked for your security. Refresh the page and try again."}, status_code=403)
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Browser protections on everything the API sends. The frontend's pages get
    their own headers from vite.config.js (and from the host in production)."""
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if request.url.path.startswith("/uploads/"):
        # Images and videos are embedded by Dixlab pages; nobody may frame them as pages.
        h.setdefault("X-Frame-Options", "SAMEORIGIN")
        h.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    else:
        h.setdefault("X-Frame-Options", "DENY")
        if request.url.path not in ("/docs", "/redoc", "/openapi.json"):
            # JSON only: nothing to run, render or frame.
            h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if PRODUCTION or is_https(request):
        h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.middleware("http")
async def record_errors(request: Request, call_next):
    """Server errors go into the activity log (path and status only) so the
    admin dashboard can show them. Visitors get a plain message."""
    try:
        response = await call_next(request)
    except Exception as e:  # noqa: BLE001 - last-resort handler
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        events.log_now("error", None, method=request.method, path=request.url.path, status=500, error=type(e).__name__)
        return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)
    # AI routes answer 503 when AI isn't configured or reachable; those are
    # tracked as AI events (ai.*) instead, so they don't count as errors here.
    ai_route = request.url.path.startswith(("/api/customize", "/api/interview/"))
    if response.status_code >= 500 and request.url.path.startswith("/api/") and not ai_route:
        events.log_now("error", None, method=request.method, path=request.url.path, status=response.status_code)
    return response


@app.get("/api/health", tags=["meta"])
def health():
    return {"ok": True}


# --- The built frontend (frontend/dist), served from the same domain as the API ---
# One service on hosts like Pxxl: `npm run build` in frontend/, then the API serves
# the site too, so the session cookie just works. Skipped when dist/ isn't there
# (local development uses the Vite dev server instead).
FRONTEND_DIST = Path(os.getenv("DIXLAB_FRONTEND_DIST", "") or Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()

if (FRONTEND_DIST / "index.html").is_file():
    try:
        PAGE_HEADERS = json.loads((FRONTEND_DIST / "headers.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        PAGE_HEADERS = {}

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith(("api/", "uploads/")) or path in ("api", "uploads"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        target = (FRONTEND_DIST / path).resolve()
        is_file = path and target.is_relative_to(FRONTEND_DIST) and target.is_file()
        if is_file and target.name not in ("headers.json", "_headers", "vercel.json"):
            cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "public, max-age=3600"
            return FileResponse(target, headers={**PAGE_HEADERS, "Cache-Control": cache})
        # Unknown paths (/p/..., /interview/..., /admin) are app routes: send the app.
        return FileResponse(FRONTEND_DIST / "index.html", headers={**PAGE_HEADERS, "Cache-Control": "no-cache"})
