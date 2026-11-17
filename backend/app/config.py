"""Settings, read from environment variables (and backend/.env if present)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
# The test suite sets DIXLAB_SKIP_DOTENV so the real settings (keys, SMTP, production mode) never apply to it.
if not os.getenv("DIXLAB_SKIP_DOTENV"):
    load_dotenv(BASE_DIR / ".env")

def _path(env: str, default: Path) -> Path:
    """Relative paths in .env are relative to backend/, wherever the server is started from."""
    p = Path(os.getenv(env, "") or default)
    return p if p.is_absolute() else BASE_DIR / p


DB_PATH = _path("DIXLAB_DB", BASE_DIR / "data" / "dixlab.db")
UPLOAD_DIR = _path("DIXLAB_UPLOADS", BASE_DIR / "uploads")
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "DIXLAB_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
).split(",") if o.strip()]

def _flag(env: str, default: bool) -> bool:
    raw = os.getenv(env, "").strip().lower()
    return default if not raw else raw in ("1", "true", "yes", "on")


# DIXLAB_ENV=production switches on the strict defaults below and makes the
# server refuse to start with settings that are only safe on your own computer
# (see app.prodcheck).
ENV = os.getenv("DIXLAB_ENV", "development").strip().lower()
PRODUCTION = ENV in ("production", "prod")

SESSION_DAYS = int(os.getenv("DIXLAB_SESSION_DAYS", "30"))           # longest a login lasts
SESSION_IDLE_DAYS = int(os.getenv("DIXLAB_SESSION_IDLE_DAYS", "7"))  # unused this long, it ends
MAX_PROJECT_BYTES = 8 * 1024 * 1024   # a saved project's JSON
MAX_UPLOAD_BYTES = 15 * 1024 * 1024   # one image (GIFs and large screenshots)
MAX_VIDEO_BYTES = 50 * 1024 * 1024    # one video
MAX_FILE_BYTES = 20 * 1024 * 1024     # one document (PDF, Word, PowerPoint, Excel)
AI_REQUESTS_PER_MINUTE = int(os.getenv("DIXLAB_AI_PER_MINUTE", "20"))

# Email for "Get in touch" messages. Leave SMTP_HOST empty to only keep
# messages in the owner's Dixlab inbox (nothing is emailed).
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER).strip()
SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "true").lower() not in ("0", "false", "no")
CONTACT_PER_10_MIN = int(os.getenv("DIXLAB_CONTACT_PER_10_MIN", "5"))  # per visitor, per page

# Admins are granted from the terminal (python -m app.admin_cli grant <email>)
# or by another admin. DIXLAB_ADMIN_EMAILS is no longer used: emails aren't
# verified, so anyone could have signed up first with a listed address.
LEGACY_ADMIN_EMAILS = bool(os.getenv("DIXLAB_ADMIN_EMAILS", "").strip())

# Brute-force and bot protection.
LOGIN_FAILS_PER_EMAIL = int(os.getenv("DIXLAB_LOGIN_FAILS_PER_EMAIL", "8"))   # per 15 minutes
LOGIN_ATTEMPTS_PER_IP = int(os.getenv("DIXLAB_LOGIN_ATTEMPTS_PER_IP", "40"))  # per 15 minutes
SIGNUPS_PER_IP = int(os.getenv("DIXLAB_SIGNUPS_PER_IP", "5"))                 # per hour

# Per-account limits, so one account can't fill the server.
MAX_STORAGE_BYTES_PER_USER = int(float(os.getenv("DIXLAB_STORAGE_MB_PER_USER", "1024")) * 1024 * 1024)
MAX_PROJECTS_PER_USER = int(os.getenv("DIXLAB_MAX_PROJECTS_PER_USER", "100"))

# Behind a reverse proxy (most hosts), set this to how many proxies sit in front
# of the app (usually 1), so rate limits see visitors' real IP addresses from
# X-Forwarded-For. Leave 0 when the app is reached directly: the header can be faked.
TRUST_PROXY_HOPS = int(os.getenv("DIXLAB_TRUST_PROXY_HOPS", "0"))
TRUST_PROXY_SET = bool(os.getenv("DIXLAB_TRUST_PROXY_HOPS", "").strip())

# Account emails (verify address, reset password). PUBLIC_URL is where the
# frontend lives, for the links in those emails.
PUBLIC_URL = os.getenv("DIXLAB_PUBLIC_URL", "http://localhost:5173").rstrip("/")
VERIFY_LINK_HOURS = int(os.getenv("DIXLAB_VERIFY_LINK_HOURS", "48"))
VERIFY_CODE_MINUTES = int(os.getenv("DIXLAB_VERIFY_CODE_MINUTES", "15"))
# New accounts must confirm their email before using the app (enforced only when email can be sent).
REQUIRE_VERIFIED_EMAIL = _flag("DIXLAB_REQUIRE_VERIFIED_EMAIL", True)
RESET_LINK_MINUTES = int(os.getenv("DIXLAB_RESET_LINK_MINUTES", "60"))
# Local testing without an email server: print account emails (with their
# links) in the backend's terminal. Never on a real server: anyone who can
# read the logs could use the links.
MAIL_TO_LOG = _flag("DIXLAB_MAIL_TO_LOG", False)

# Interactive API docs at /docs. Handy locally; off by default in production.
API_DOCS = _flag("DIXLAB_API_DOCS", not PRODUCTION)
EVENT_RETENTION_DAYS = int(os.getenv("DIXLAB_EVENT_RETENTION_DAYS", "180"))

# Two-step login. Admins must turn it on before they can use the dashboard
# (on by default in production).
ADMIN_REQUIRE_2FA = _flag("DIXLAB_ADMIN_REQUIRE_2FA", PRODUCTION)

# Optional check of new passwords against the Have I Been Pwned list of leaked
# passwords. Only the first 5 characters of the password's SHA-1 hash leave
# the server (k-anonymity), never the password or the email. If the service
# can't be reached, the password is accepted.
PWNED_PASSWORD_CHECK = _flag("DIXLAB_PWNED_PASSWORD_CHECK", False)

# Optional virus scanning of uploads with ClamAV: "host:port" of a clamd
# daemon (e.g. 127.0.0.1:3310). When set, a file is only stored once clamd
# says it's clean; if clamd can't be reached the upload is refused.
CLAMAV = os.getenv("DIXLAB_CLAMAV", "").strip()

# ---------- Plans and billing (Bachs) ----------
# Free, Starter, Pro and Premium limits (see app/plans.py). Turn off to give every
# account everything, e.g. for a private test server.
PLAN_LIMITS = _flag("DIXLAB_PLAN_LIMITS", True)
TRIAL_DAYS = int(os.getenv("DIXLAB_TRIAL_DAYS", "14"))   # free Pro trial, once per account, no card
REFUND_DAYS = int(os.getenv("DIXLAB_REFUND_DAYS", "14"))  # full refund on request within this many days of a charge

# Localised prices: Nigeria pays in naira, everyone else in US dollars. Each price
# is set on its own (not converted), in the currency's smallest unit (kobo, cents).
# Yearly is about 20% less than twelve months. USD prices must match your Bachs products.
CURRENCIES = ("NGN", "USD")
_PRICE_DEFAULTS = {
    ("starter", "monthly", "NGN"): 300000, ("starter", "yearly", "NGN"): 2880000,
    ("pro", "monthly", "NGN"): 600000, ("pro", "yearly", "NGN"): 5760000,
    ("premium", "monthly", "NGN"): 1200000, ("premium", "yearly", "NGN"): 11520000,
    ("starter", "monthly", "USD"): 399, ("starter", "yearly", "USD"): 3830,
    ("pro", "monthly", "USD"): 799, ("pro", "yearly", "USD"): 7670,
    ("premium", "monthly", "USD"): 1499, ("premium", "yearly", "USD"): 14390,
}
PRICES = {key: int(os.getenv(f"DIXLAB_PRICE_{key[0]}_{key[1]}_{key[2]}".upper(), str(value)))
          for key, value in _PRICE_DEFAULTS.items()}
# Bachs bills recurring subscriptions on USD cards today. Until NGN recurring is
# enabled on your Bachs account, NGN payments are one-off: each pays for one month
# or one year, and renewing is manual. Set to true once Bachs enables it (and add
# the NGN products below).
NGN_RECURRING = _flag("DIXLAB_NGN_RECURRING", False)
# Bachs (bachs.io): the secret API key (server only, never the browser): sk_sandbox_...
# while testing, sk_live_... on the real server. The API address follows the key.
BACHS_API_KEY = os.getenv("BACHS_API_KEY", "").strip()
BACHS_BASE_URL = (os.getenv("BACHS_BASE_URL", "").strip().rstrip("/")
                  or ("https://sandbox-api.bachs.io" if BACHS_API_KEY.startswith("sk_sandbox_") else "https://api.bachs.io"))
# The signing secret of the webhook endpoint you add in the Bachs Developer Portal.
BACHS_WEBHOOK_SECRET = os.getenv("BACHS_WEBHOOK_SECRET", "").strip()
# The product id (prod_...) of each plan and billing period, created in Bachs as
# recurring USD products (Bachs fixes a product's interval, so one per period).
# NGN products are only used once DIXLAB_NGN_RECURRING is on.
BACHS_PRODUCTS = {
    (plan, interval, cur): os.getenv(f"BACHS_PRODUCT_{plan}_{interval}{'' if cur == 'USD' else '_NGN'}".upper(), "").strip()
    for plan in ("starter", "pro", "premium") for interval in ("monthly", "yearly") for cur in ("USD", "NGN")
}

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
