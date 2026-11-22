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
# Turso (hosted SQLite): when both are set, the database lives on Turso instead of
# the file above, so it survives restarts and redeploys on hosts without a disk.
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL", "").strip()   # libsql://<db>-<org>.turso.io
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()
# Optional GitHub token (no scopes needed: public data only). Without it GitHub allows this
# server 60 requests an hour, and reading one profile or repository takes 5-8.
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
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
# Or send through SendLiberty (sendliberty.com): its HTTP API sends from a connected Gmail / Google Workspace account.
SENDLIBERTY_API_KEY = os.getenv("SENDLIBERTY_API_KEY", "").strip()
SENDLIBERTY_FROM = os.getenv("SENDLIBERTY_FROM", "").strip()      # the connected Gmail address, e.g. Dixlab <you@gmail.com>
SENDLIBERTY_URL = os.getenv("SENDLIBERTY_URL", "https://sendliberty.com/api/send").strip()
CONTACT_PER_10_MIN = int(os.getenv("DIXLAB_CONTACT_PER_10_MIN", "5"))  # per visitor, per page

# Admins are granted from the terminal (python -m app.admin grant <email>)
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
# Custom domains: with these set, domains people add are attached to the website's Vercel project automatically.
# Without them, add each domain in Vercel → Project → Settings → Domains yourself.
VERCEL_TOKEN = os.getenv("DIXLAB_VERCEL_TOKEN", "").strip()
# Buying domains in Dixlab, through pxxl.app's reseller API (pxxl Pro plan, money in the pxxl wallet).
PXXL_RESELLER_KEY = os.getenv("PXXL_RESELLER_KEY", "").strip()
# off: hidden (people can still connect a domain they own) · demo: the whole flow with pxxl simulated,
# nothing real is bought (payment is simulated too if Bachs isn't set up) · live: real purchases.
DOMAIN_SALES = os.getenv("DIXLAB_DOMAIN_SALES", "off").strip().lower()
if DOMAIN_SALES not in ("off", "demo", "live"):
    DOMAIN_SALES = "off"
PXXL_API = os.getenv("PXXL_API", "https://server.pxxl.app/api/v3").strip().rstrip("/")
# Extra margin on top of pxxl's customer price (set your main markup in pxxl's reseller settings).
DOMAIN_MARKUP_PERCENT = float(os.getenv("DIXLAB_DOMAIN_MARKUP_PERCENT", "0"))
DOMAIN_TLDS = tuple(t.strip().lstrip(".") for t in os.getenv("DIXLAB_DOMAIN_TLDS", "com,com.ng,dev,me,co,io,cv").split(",") if t.strip())
# Dixlab addresses (yourname.dixlab.click), unlocked with credits. Needs a wildcard
# *.dixlab.click pointing at the website (see docs).
SUBDOMAIN_BASE = os.getenv("DIXLAB_SUBDOMAIN_BASE", "dixlab.click").strip().lower().strip(".")
VERCEL_PROJECT_ID = os.getenv("DIXLAB_VERCEL_PROJECT_ID", "").strip()
VERCEL_TEAM_ID = os.getenv("DIXLAB_VERCEL_TEAM_ID", "").strip()
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
# Credits and unlocks (see app/plans.py). Turn off to give every
# account everything, e.g. for a private test server.
PLAN_LIMITS = _flag("DIXLAB_PLAN_LIMITS", True)
_trial = os.getenv("DIXLAB_TRIAL_DAYS", "0").strip().lower()  # retired: new accounts get free credits instead
# Free Pro trial, once per account, no card. 0 / false / off turns the trial off.
TRIAL_DAYS = 0 if _trial in ("", "0", "false", "off", "no") else max(0, int(_trial))
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
# Credits: people buy packs once; credits never expire. AI actions spend them
# (plans.AI_COSTS) and paid features are unlocked with them for good (plans.UNLOCKS).
# Prices are in kobo / cents; each can be overridden, e.g. DIXLAB_PACK_M_NGN=800000.
WELCOME_CREDITS = int(os.getenv("DIXLAB_WELCOME_CREDITS", "30"))
_PACK_DEFAULTS = {  # id: (credits, NGN kobo, USD cents)
    "s": (150, 250000, 300),
    "m": (500, 750000, 900),
    "l": (1500, 2000000, 2400),
    "xl": (5000, 5800000, 7000),
}
CREDIT_PACKS = {
    pid: {"credits": int(os.getenv(f"DIXLAB_PACK_{pid.upper()}_CREDITS", str(n))),
          "prices": {"NGN": int(os.getenv(f"DIXLAB_PACK_{pid.upper()}_NGN", str(ngn))),
                     "USD": int(os.getenv(f"DIXLAB_PACK_{pid.upper()}_USD", str(usd)))}}
    for pid, (n, ngn, usd) in _PACK_DEFAULTS.items()
}
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
# Lets a production server run with a sandbox key on purpose, to test payments before launch.
BACHS_TEST_MODE = _flag("DIXLAB_BACHS_TEST_MODE", False)
BACHS_PRODUCTS = {
    (plan, interval, cur): os.getenv(f"BACHS_PRODUCT_{plan}_{interval}{'' if cur == 'USD' else '_NGN'}".upper(), "").strip()
    for plan in ("starter", "pro", "premium") for interval in ("monthly", "yearly") for cur in ("USD", "NGN")
}

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
