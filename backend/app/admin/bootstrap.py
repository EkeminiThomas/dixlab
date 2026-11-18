"""The first admin, for servers without a terminal (e.g. pxxl's free plan).

Set DIXLAB_FIRST_ADMIN=you@example.com in the host's secrets. That account
becomes an admin, but only when ALL of these hold:

- the site has no admin yet: once there is one, this setting does nothing;
- the account exists and has confirmed its email, which proves the person
  controls that inbox (so nobody can claim the address by signing up first);
- it's checked at start-up and the moment that account confirms its email.

Every grant is recorded in the activity log. Remove the setting afterwards
(it's then inert anyway), and add more admins from the dashboard."""
import logging
import os

from .. import events

log = logging.getLogger("dixlab")


def first_admin_email() -> str:
    return os.getenv("DIXLAB_FIRST_ADMIN", "").strip().lower()


def ensure_first_admin(db) -> bool:
    """Grant admin to DIXLAB_FIRST_ADMIN if the site has none yet. Returns whether it did."""
    email = first_admin_email()
    if not email:
        return False
    if db.execute("SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1").fetchone():
        return False  # there's already an admin: this setting never applies again
    row = db.execute("SELECT id, email_verified_at FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        log.warning("DIXLAB_FIRST_ADMIN is set, but no account uses %s yet. Sign up with it and confirm your email.", email)
        return False
    if not row["email_verified_at"]:
        log.warning("DIXLAB_FIRST_ADMIN: %s hasn't confirmed its email yet, so it isn't an admin yet.", email)
        return False
    db.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
    events.log(db, "admin.grant", row["id"], None, via="first_admin_setting")
    log.warning("DIXLAB_FIRST_ADMIN: %s is now the first admin. You can remove the setting now.", email)
    return True
