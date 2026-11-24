"""SQLite storage. One connection per request; the schema is created on startup."""
import sqlite3
from collections.abc import Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    type       TEXT NOT NULL,
    data       TEXT NOT NULL,           -- the full project as JSON
    updated_at INTEGER NOT NULL,        -- ms since epoch, set by the client
    PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS uploads (
    name         TEXT PRIMARY KEY,      -- file name on disk, e.g. 3f2a….jpg
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    size         INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS publications (
    slug       TEXT PRIMARY KEY,        -- the public link: /p/<slug>
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    data       TEXT NOT NULL,           -- published snapshot (public fields only)
    views      INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the portfolio owner
    project_id TEXT NOT NULL,
    slug       TEXT NOT NULL,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    body       TEXT NOT NULL,
    emailed    INTEGER NOT NULL DEFAULT 0,
    read_at    INTEGER,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,          -- e.g. user.signup, page.published, ai.customize, admin.suspend
    user_id    TEXT,                   -- who it was about (not a foreign key: kept after deletes)
    actor_id   TEXT,                   -- who did it, when that's someone else (admin actions)
    data       TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at);
CREATE TABLE IF NOT EXISTS page_views_daily (
    slug  TEXT NOT NULL,
    day   TEXT NOT NULL,               -- YYYY-MM-DD (UTC)
    views INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (slug, day)
);
CREATE INDEX IF NOT EXISTS idx_views_day ON page_views_daily(day);
-- What visitors do on a published page, counted per day (no cookies, IPs or personal data):
-- kind 'ref' (where they came from: linkedin, google, x, github, direct, other), 'open' (a project
-- they opened, by title), 'depth' (how far they scrolled: 25/50/75/100), 'action' (cv, book, contact).
CREATE TABLE IF NOT EXISTS page_events (
    slug  TEXT NOT NULL,
    day   TEXT NOT NULL,
    kind  TEXT NOT NULL,
    key   TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (slug, day, kind, key)
);
-- Links an owner shares so other people can help: 'testimonial' (write a
-- recommendation) or 'feedback' (comment on a draft). One live link per kind per project.
CREATE TABLE IF NOT EXISTS invites (
    token      TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_owner ON invites(user_id, project_id, kind);
-- Recommendations from colleagues and clients. Only 'approved' ones are ever shown.
CREATE TABLE IF NOT EXISTS testimonials (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT '',
    company    TEXT NOT NULL DEFAULT '',
    relation   TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | hidden
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_testimonials_project ON testimonials(user_id, project_id);
-- Comments on a draft from people the owner asked for feedback.
CREATE TABLE IF NOT EXISTS feedback (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    section     TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(user_id, project_id);
-- Domains for published pages: their own (free to connect; live once the DNS TXT record matches `token`)
-- or a Dixlab address like name.dixlab.click (the "Dixlab address" unlock; live straight away).
CREATE TABLE IF NOT EXISTS domains (
    domain      TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL,
    slug        TEXT NOT NULL,
    token       TEXT NOT NULL,
    vercel      TEXT,               -- 'added' once the website's Vercel project knows the domain
    kind        TEXT NOT NULL DEFAULT 'custom',   -- custom (their own, e.g. bought on pxxl.app) | sub (name.dixlab.click)
    verified_at INTEGER,
    created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domains_owner ON domains(user_id, project_id);
-- "Connect Figma": a person's Figma sign-in (OAuth), tokens encrypted (figma_auth.py).
CREATE TABLE IF NOT EXISTS figma_connections (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    INTEGER NOT NULL,     -- ms
    figma_user    TEXT NOT NULL DEFAULT '',
    handle        TEXT NOT NULL DEFAULT '',
    photo         TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL
);
-- One-time "state" values for the Figma sign-in round trip (stops another site linking its account to yours).
CREATE TABLE IF NOT EXISTS figma_oauth_states (
    state      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    return_to  TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Domains bought in Dixlab (through pxxl.app). Paid with Bachs first, then registered.
-- status: awaiting_payment -> paid -> registering -> active, or failed (refunded).
CREATE TABLE IF NOT EXISTS domain_orders (
    reference    TEXT PRIMARY KEY,      -- also the payment reference and pxxl's idempotency key
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id   TEXT NOT NULL,
    domain       TEXT NOT NULL,
    years        INTEGER NOT NULL DEFAULT 1,
    amount       INTEGER NOT NULL,      -- what the customer pays, smallest unit
    currency     TEXT NOT NULL,
    charge_minor INTEGER NOT NULL,      -- most pxxl may take from the wallet (US cents)
    contact      TEXT NOT NULL,         -- registrant details (JSON): the customer owns the domain
    status       TEXT NOT NULL,
    error        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domain_orders_user ON domain_orders(user_id, created_at);
CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,           -- sha256 of the token in the emailed link
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose    TEXT NOT NULL,              -- verify | reset
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
CREATE TABLE IF NOT EXISTS subscriptions (
    user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan                  TEXT NOT NULL,          -- starter | pro | premium
    interval              TEXT NOT NULL,          -- monthly | yearly
    currency              TEXT,                   -- NGN | USD
    status                TEXT NOT NULL,          -- active | past_due (renewing); non_renewing | prepaid | cancelled (ends at period end)
    current_period_end    INTEGER,                -- ms; access lasts until then
    customer_ref          TEXT,                   -- the payment provider's customer (Bachs cust_...)
    subscription_ref      TEXT,                   -- the provider's subscription (Bachs sub_...)
    created_at            INTEGER NOT NULL,
    updated_at            INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
    reference        TEXT PRIMARY KEY,            -- our reference (dx_...), or the provider's invoice id for renewals
    user_id          TEXT,                        -- not a foreign key: billing records outlive deleted accounts (tax)
    email            TEXT,
    plan             TEXT,
    interval         TEXT,
    amount           INTEGER NOT NULL DEFAULT 0,  -- cents
    currency         TEXT,
    status           TEXT NOT NULL,               -- pending | success | failed
    refund_status    TEXT,                        -- pending | processed | failed
    checkout_ref     TEXT,                        -- Bachs chk_...
    charge_ref       TEXT,                        -- Bachs charge id (what refunds need)
    invoice_ref      TEXT,                        -- Bachs inv_...
    subscription_ref TEXT,                        -- Bachs sub_...
    paid_at          INTEGER,
    created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);
CREATE TABLE IF NOT EXISTS billing_events (
    key        TEXT PRIMARY KEY,                  -- sha256 of the webhook body: each event is applied once
    type       TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month   TEXT NOT NULL,                        -- YYYY-MM (UTC)
    feature TEXT NOT NULL,                        -- draft | change
    count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, month, feature)
);
-- Credits: every change to a balance is a row (+ bought / welcome / admin, - AI / unlock).
-- The balance is the sum, so it never expires. `ref` makes a payment count only once.
CREATE TABLE IF NOT EXISTS credit_ledger (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,                     -- welcome | purchase | ai:<feature> | unlock:<feature> | admin | refund
    ref        TEXT UNIQUE,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id, created_at);
-- Features unlocked with credits, for good. `count` is for ones you can buy more than once (projects, storage).
CREATE TABLE IF NOT EXISTS unlocks (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature    TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, feature)
);
CREATE TABLE IF NOT EXISTS recovery_codes (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,              -- sha256 of a one-time two-step backup code
    used_at   INTEGER,
    PRIMARY KEY (user_id, code_hash)
);
"""


def using_turso() -> bool:
    from . import config  # read at call time, so tests can switch it
    return bool(config.TURSO_DATABASE_URL and config.TURSO_AUTH_TOKEN)


def connect() -> sqlite3.Connection:
    """The database: Turso when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set,
    otherwise the local SQLite file (DIXLAB_DB). Both behave like sqlite3."""
    if using_turso():
        from . import config, turso
        return turso.connect(config.TURSO_DATABASE_URL, config.TURSO_AUTH_TOKEN)  # type: ignore[return-value]
    # One connection per request, but FastAPI may open it in a worker thread and
    # use it in the event loop (async routes), so allow cross-thread use.
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


# Columns added after the first release, applied to existing databases on start-up.
MIGRATIONS = {
    "users": {
        "is_admin": "INTEGER NOT NULL DEFAULT 0",
        "suspended_at": "INTEGER",
        "suspend_reason": "TEXT",
        "last_seen_at": "INTEGER",
        "email_verified_at": "INTEGER",
        "totp_secret": "TEXT",          # two-step login: base32 secret, once turned on
        "totp_pending": "TEXT",         # a secret being set up, not yet confirmed
        "totp_enabled_at": "INTEGER",
        "totp_last_step": "INTEGER",    # last 30-second step used, so a code works only once
        "plan_override": "TEXT",        # a plan given by an admin (python -m app.admin set-plan)
        "trial_used_at": "INTEGER",     # ms; one free trial per account
        "trial_ends_at": "INTEGER",     # ms
    },
    "sessions": {
        "last_used_at": "INTEGER",      # seconds; sessions unused for SESSION_IDLE_DAYS end
    },
    # Billing tables from the first (Paystack) draft get the provider-neutral columns.
    "subscriptions": {"customer_ref": "TEXT", "subscription_ref": "TEXT", "currency": "TEXT"},
    "publications": {
        "password_hash": "TEXT",       # a page only people with the password can open
        "gallery": "TEXT",             # the public gallery: 'requested' by the owner, then 'featured' or 'declined' by an admin
        "featured_at": "INTEGER",
    },
    "domains": {"kind": "TEXT NOT NULL DEFAULT 'custom'"},
    "payments": {"checkout_ref": "TEXT", "charge_ref": "TEXT", "invoice_ref": "TEXT", "subscription_ref": "TEXT"},
}
# When a column first appears, fill it for existing rows.
BACKFILL = {
    # Accounts made before verification existed keep working as they did.
    ("users", "email_verified_at"): "UPDATE users SET email_verified_at = created_at",
    # Sessions from before idle timeouts count as used now, so nobody is logged out by the upgrade.
    ("sessions", "last_used_at"): "UPDATE sessions SET last_used_at = CAST(strftime('%s', 'now') AS INTEGER)",
}


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        for table, cols in MIGRATIONS.items():
            have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            for col, ddl in cols.items():
                if col not in have:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                    if (table, col) in BACKFILL:
                        conn.execute(BACKFILL[(table, col)])
        # Indexes on migrated columns, once they exist.
        conn.execute("CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments(checkout_ref)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_subscriptions_ref ON subscriptions(subscription_ref)")


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: a connection that commits on success."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
