"""Settings, read from environment variables (and backend/.env if present)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
load_dotenv(BASE_DIR / ".env")

DB_PATH = Path(os.getenv("DIXLAB_DB", BASE_DIR / "data" / "dixlab.db"))
UPLOAD_DIR = Path(os.getenv("DIXLAB_UPLOADS", BASE_DIR / "uploads"))
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "DIXLAB_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
).split(",") if o.strip()]

SESSION_DAYS = int(os.getenv("DIXLAB_SESSION_DAYS", "30"))
MAX_PROJECT_BYTES = 8 * 1024 * 1024   # a saved project's JSON
MAX_UPLOAD_BYTES = 15 * 1024 * 1024   # one image (GIFs and large screenshots)
MAX_VIDEO_BYTES = 50 * 1024 * 1024    # one video
MAX_FILE_BYTES = 20 * 1024 * 1024     # one document (PDF, Word, PowerPoint, Excel)
AI_REQUESTS_PER_MINUTE = int(os.getenv("DIXLAB_AI_PER_MINUTE", "20"))

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
