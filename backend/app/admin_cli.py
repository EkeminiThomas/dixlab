"""Manage Dixlab admins from the server's terminal.

    python -m app.admin_cli grant you@example.com
    python -m app.admin_cli revoke someone@example.com
    python -m app.admin_cli list
    python -m app.admin_cli reset-2fa someone@example.com   (lost phone and recovery codes)

Admin rights only come from here (or from an existing admin in the dashboard),
never from signing up with a particular email: Dixlab doesn't verify email
addresses, so anyone could otherwise sign up first with an admin's address.
The account must already exist (sign up in the app first)."""
import sys

from . import events
from .db import connect, init_db


def main(argv: list[str]) -> int:
    if len(argv) < 1 or argv[0] not in ("grant", "revoke", "list", "reset-2fa") or (argv[0] != "list" and len(argv) != 2):
        print(__doc__.strip())
        return 2
    init_db()
    with connect() as db:
        if argv[0] == "list":
            rows = db.execute("SELECT name, email FROM users WHERE is_admin = 1 ORDER BY email").fetchall()
            print("\n".join(f"{r['email']}  ({r['name']})" for r in rows) or "No admins yet.")
            return 0
        email = argv[1].strip().lower()
        row = db.execute("SELECT id, is_admin FROM users WHERE email = ?", (email,)).fetchone()
        if not row:
            print(f"No account with the email {email}. Sign up in the app first, then run this again.")
            return 1
        if argv[0] == "reset-2fa":
            # Only do this after confirming who's asking (e.g. a reply from the account's email).
            db.execute("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, "
                       "totp_last_step = NULL WHERE id = ?", (row["id"],))
            db.execute("DELETE FROM recovery_codes WHERE user_id = ?", (row["id"],))
            db.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            events.log(db, "admin.2fa_reset", row["id"], None, via="terminal")
            print(f"Two-step login is off for {email}, and they've been logged out everywhere. "
                  "They can log in with their password and turn it on again.")
            return 0
        grant = argv[0] == "grant"
        if not grant and db.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1").fetchone()[0] <= 1 and row["is_admin"]:
            print("That's the last admin. Grant admin to someone else first.")
            return 1
        db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1 if grant else 0, row["id"]))
        events.log(db, "admin.grant" if grant else "admin.revoke", row["id"], None, via="terminal")
        print(f"{email} is {'now an admin' if grant else 'no longer an admin'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
