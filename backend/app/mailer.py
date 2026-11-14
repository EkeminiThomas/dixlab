"""Sending email over SMTP. Configured with SMTP_* settings in backend/.env;
when SMTP_HOST is empty nothing is sent and callers keep the message instead."""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from .config import SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_STARTTLS, SMTP_USER

log = logging.getLogger("dixlab.mail")


def configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM)


def send(to: str, subject: str, body: str, reply_to: tuple[str, str] | None = None) -> bool:
    """Send a plain-text email. Returns True when the server accepted it."""
    if not configured():
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
