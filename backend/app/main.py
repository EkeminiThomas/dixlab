"""Dixlab API. Run from the backend folder:  uvicorn app.main:app --reload"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import CORS_ORIGINS, UPLOAD_DIR
from .db import init_db
from .routers import auth, customize, interview, messages, projects, publish, uploads


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Dixlab API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(uploads.router)
app.include_router(customize.router)
app.include_router(interview.router)
app.include_router(publish.router)
app.include_router(messages.router)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

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


@app.get("/api/health", tags=["meta"])
def health():
    return {"ok": True}
