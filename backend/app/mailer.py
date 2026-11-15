"""Sending email over SMTP. Configured with SMTP_* settings in backend/.env;
when SMTP_HOST is empty nothing is sent and callers keep the message instead."""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from .config import MAIL_TO_LOG, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_STARTTLS, SMTP_USER

log = logging.getLogger("dixlab.mail")


# The example values from .env.example aren't a real mail server.
_PLACEHOLDER = ("example.com", "example.org", "example.net", ".example", ".test", ".invalid", "localhost.localdomain")


def placeholder_host() -> bool:
    return bool(SMTP_HOST) and SMTP_HOST.lower().endswith(_PLACEHOLDER)


def configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM) and not placeholder_host()


def can_send() -> bool:
    """Whether account emails (verification, password reset) can go out."""
    return configured() or MAIL_TO_LOG


def safe_name(name: str | None) -> str:
    """The first name to greet someone with in an email. Names are chosen by
    whoever signs up (who may not own the address), so anything that isn't a
    plain name, such as a link, becomes "there"."""
    first = (name or "").strip().split()[0] if (name or "").strip() else ""
    if not first or len(first) > 30 or not all(ch.isalpha() or ch in "-'’." for ch in first) or "." in first.strip("."):
        return "there"
    return first


def send(to: str, subject: str, body: str, reply_to: tuple[str, str] | None = None) -> bool:
    """Send a plain-text email. Returns True when the server accepted it."""
    if not configured():
        if MAIL_TO_LOG:  # local testing only (DIXLAB_MAIL_TO_LOG)
            log.warning("\n--- EMAIL (not sent: DIXLAB_MAIL_TO_LOG is on) ---\nTo: %s\nSubject: %s\n\n%s\n--- END EMAIL ---", to, subject, body)
            return True
        return False
    msg = EmailMessage()  # refuses header values with line breaks (no header injection)
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = formataddr(reply_to)
    msg.set_content(body)
    try:
        context = ssl.create_default_context()
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20, context=context)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
            if SMTP_STARTTLS:
                server.starttls(context=context)
        with server:
            if SMTP_USER:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as e:
        # Log the kind of failure only: never credentials or message contents.
        log.warning("Couldn't send email via %s:%s (%s)", SMTP_HOST, SMTP_PORT, type(e).__name__)
        return False
