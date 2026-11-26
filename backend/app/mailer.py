"""Sending email, two ways:

- SendLiberty (SENDLIBERTY_API_KEY + SENDLIBERTY_FROM): its HTTP API sends from
  a Gmail / Google Workspace account connected in the SendLiberty dashboard.
- SMTP (SMTP_* settings), for any other provider.

SendLiberty is used when its key is set. With neither configured nothing is
sent and callers keep the message instead (DIXLAB_MAIL_TO_LOG prints it, for
local testing)."""
import html
import logging
import re
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr

import httpx

from .config import (CONTACT_EMAIL, MAIL_TO_LOG, SENDLIBERTY_API_KEY, SENDLIBERTY_FROM, SENDLIBERTY_URL,
                     SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_STARTTLS, SMTP_USER)

log = logging.getLogger("dixlab.mail")


# The example values from .env.example aren't a real mail server.
_PLACEHOLDER = ("example.com", "example.org", "example.net", ".example", ".test", ".invalid", "localhost.localdomain")


def placeholder_host() -> bool:
    return bool(SMTP_HOST) and SMTP_HOST.lower().endswith(_PLACEHOLDER)


def sendliberty() -> bool:
    return bool(SENDLIBERTY_API_KEY and SENDLIBERTY_FROM)


def configured() -> bool:
    return sendliberty() or (bool(SMTP_HOST and SMTP_FROM) and not placeholder_host())


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
    """Send a plain-text email. Returns True when the provider accepted it."""
    if not configured():
        if MAIL_TO_LOG:  # local testing only (DIXLAB_MAIL_TO_LOG)
            log.warning("\n--- EMAIL (not sent: DIXLAB_MAIL_TO_LOG is on) ---\nTo: %s\nSubject: %s\n\n%s\n--- END EMAIL ---", to, subject, body)
            return True
        return False
    if any(ch in s for s in (to, subject) for ch in "\r\n"):  # no header injection
        log.warning("Refused an email with a line break in its address or subject")
        return False
    if reply_to is None and CONTACT_EMAIL:  # Dixlab's own emails: a reply reaches the team, even from a no-reply sender
        reply_to = ("Dixlab", CONTACT_EMAIL)
    if sendliberty():
        return _send_sendliberty(to, subject, body, reply_to)
    return _send_smtp(to, subject, body, reply_to)


# ---------------------------------------------------------------- SendLiberty

_URL = re.compile(r"https?://[^\s<>\"]+")


def _as_html(body: str) -> str:
    """The plain-text body as simple HTML: escaped, links clickable, line breaks kept."""
    escaped = html.escape(body)
    linked = _URL.sub(lambda m: f'<a href="{m.group(0)}">{m.group(0)}</a>', escaped)
    return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">' + linked.replace("\n", "<br>") + "</div>"


def _send_sendliberty(to: str, subject: str, body: str, reply_to: tuple[str, str] | None) -> bool:
    payload = {"from": SENDLIBERTY_FROM, "to": to, "subject": subject, "text": body, "html": _as_html(body)}
    if reply_to:
        payload["replyTo"] = formataddr(reply_to)
    headers = {"Authorization": f"Bearer {SENDLIBERTY_API_KEY}"}
    for attempt in range(2):  # Gmail allows about one send a second: on 429, wait briefly and try once more
        try:
            r = httpx.post(SENDLIBERTY_URL, json=payload, headers=headers, timeout=20)
        except httpx.HTTPError as e:
            log.warning("Couldn't reach SendLiberty (%s)", type(e).__name__)
            return False
        if r.status_code < 300:
            return True
        if r.status_code == 429 and attempt == 0:
            time.sleep(min(5.0, float(r.headers.get("retry-after", "2") or 2)))
            continue
        # Log the status and SendLiberty's reason only: never the key or the message.
        try:
            reason = r.json().get("error") or r.json().get("message") or ""
        except ValueError:
            reason = ""
        hint = {401: "check SENDLIBERTY_API_KEY", 403: "the key may be limited to a different sender than SENDLIBERTY_FROM"}.get(r.status_code, "")
        log.warning("SendLiberty refused the email (%s %s) %s", r.status_code, str(reason)[:200], hint)
        return False
    return False


# ---------------------------------------------------------------- SMTP

def _send_smtp(to: str, subject: str, body: str, reply_to: tuple[str, str] | None) -> bool:
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
