"""Checks of the server's settings before it goes live.

With DIXLAB_ENV=production the API runs these on start-up: problems that would
make the live site unsafe stop it from starting, and riskier choices are logged
as warnings. Run them yourself before deploying, with the same environment:

    python -m app.prodcheck"""
import logging
import sys
from urllib.parse import urlparse

from . import bachs, config, mailer

log = logging.getLogger("dixlab")


def findings() -> tuple[list[str], list[str]]:
    """(errors, warnings) for running in production."""
    errors, warnings = [], []
    if config.MAIL_TO_LOG:
        errors.append("DIXLAB_MAIL_TO_LOG is on: login and password-reset links would be printed in the logs. Turn it off.")
    if urlparse(config.PUBLIC_URL).scheme != "https":
        errors.append(f"DIXLAB_PUBLIC_URL must be the site's https:// address (it's {config.PUBLIC_URL}).")
    local = [o for o in config.CORS_ORIGINS if urlparse(o).scheme != "https" or urlparse(o).hostname in ("localhost", "127.0.0.1")]
    if local:
        errors.append("DIXLAB_CORS_ORIGINS must list only the live https:// site, not " + ", ".join(local) + ".")
    if config.API_DOCS:
        warnings.append("DIXLAB_API_DOCS is on: the interactive API docs at /docs are public.")
    if not config.TRUST_PROXY_SET:
        warnings.append("DIXLAB_TRUST_PROXY_HOPS isn't set. Behind a proxy or load balancer (most hosts), set it to 1, "
                        "or every visitor will share one rate limit. Set it to 0 to confirm there's no proxy.")
    if not mailer.can_send():
        warnings.append("Email isn't set up (SMTP_*): new accounts can't confirm their address or reset a password.")
    if not config.ADMIN_REQUIRE_2FA:
        warnings.append("DIXLAB_ADMIN_REQUIRE_2FA is off: admins can use the dashboard without two-step login.")
    if not config.CLAMAV:
        warnings.append("DIXLAB_CLAMAV isn't set: uploads are checked for type and active content, but not virus-scanned.")
    if config.BACHS_API_KEY.startswith("sk_sandbox_"):
        errors.append("BACHS_API_KEY is a sandbox key: nobody could really pay. Use your live key (sk_live_...).")
    if config.PLAN_LIMITS and not bachs.configured():
        missing = [f"BACHS_PRODUCT_{p}_{i}{'' if c == 'USD' else '_NGN'}".upper()
                   for (p, i, c), code in config.BACHS_PRODUCTS.items() if not code and bachs.recurring(c)]
        warnings.append("Payments aren't set up (" + ", ".join((["BACHS_API_KEY"] if not config.BACHS_API_KEY else []) + missing)
                        + "): people can't upgrade from Free, except with the free trial.")
    if bachs.configured() and not config.BACHS_WEBHOOK_SECRET:
        warnings.append("BACHS_WEBHOOK_SECRET isn't set: renewals, cancellations and refunds from Bachs won't reach Dixlab.")
    if config.SESSION_IDLE_DAYS > 30 or config.SESSION_DAYS > 90:
        warnings.append("Sessions last a long time (DIXLAB_SESSION_DAYS / DIXLAB_SESSION_IDLE_DAYS); consider shorter.")
    return errors, warnings


def run_on_startup() -> None:
    if not config.PRODUCTION:
        return
    errors, warnings = findings()
    for w in warnings:
        log.warning("Production check: %s", w)
    if errors:
        raise RuntimeError("Unsafe production settings:\n  - " + "\n  - ".join(errors))


def main() -> int:
    errors, warnings = findings()
    for e in errors:
        print("ERROR  ", e)
    for w in warnings:
        print("warning", w)
    if not errors and not warnings:
        print("All production checks pass.")
    if not config.PRODUCTION:
        print("\n(DIXLAB_ENV isn't 'production' here, so the server itself won't enforce these.)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
