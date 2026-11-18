"""Who counts as an admin, and the check every admin route uses.

Admins are flagged in the database by the terminal command (app/admin/cli.py);
there is no way to become one from the website."""
from fastapi import Depends, HTTPException, status

from .. import config
from ..security import current_user

ADMIN_NEEDS_2FA = "Admins need two-step login. Turn it on in your profile, then come back."


def is_admin(row) -> bool:
    """Whether this account (a database row or the current-user dict) is an admin."""
    return bool(row["is_admin"])


def require_admin(user: dict = Depends(current_user)) -> dict:
    """Dependency: the signed-in user, who must be an admin (else 403), and, when
    DIXLAB_ADMIN_REQUIRE_2FA is on, must have two-step login turned on."""
    if not user["is_admin"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only.")
    if config.ADMIN_REQUIRE_2FA and not user["two_factor"]:
        # A code, so the dashboard can link straight to where it's turned on.
        raise HTTPException(status.HTTP_403_FORBIDDEN, {"code": "admin_needs_2fa", "message": ADMIN_NEEDS_2FA})
    return user
