"""The few Bachs (bachs.io) API calls Dixlab makes. The API key stays on the server.

Bachs money is a decimal string ("12.00") with a currency; Dixlab keeps cents.
Every API call goes through _call(), so tests replace that one function."""
import hashlib
import hmac
import time
from decimal import Decimal, InvalidOperation

import logging

import httpx

from . import config

SIGNATURE_TOLERANCE = 300  # seconds; older webhook deliveries are refused (replay protection)


class BachsError(Exception):
    """Bachs couldn't do it (bad request, declined, or unreachable)."""


log = logging.getLogger("dixlab")

def recurring(currency: str) -> bool:
    """Whether this currency is billed as a renewing subscription (USD) or as one-off
    payments that each cover a period (NGN, until Bachs enables NGN recurring)."""
    return currency == "USD" or (currency == "NGN" and config.NGN_RECURRING)


def configured(currency: str | None = None) -> bool:
    """An API key, and a product for every plan and period that's billed as a subscription."""
    if not config.BACHS_API_KEY:
        return False
    for cur in ([currency] if currency else config.CURRENCIES):
        if recurring(cur) and not all(v for (_, _, c), v in config.BACHS_PRODUCTS.items() if c == cur):
            return False
    return True


def money(amount_cents: int) -> str:
    """Cents (or kobo) to Bachs's decimal string, e.g. 300000 -> "3000.00"."""
    return f"{Decimal(amount_cents) / 100:.2f}"


def cents(amount) -> int:
    try:
        return int((Decimal(str(amount)) * 100).quantize(Decimal(1)))
    except (InvalidOperation, ValueError, TypeError):
        return 0


def _call(method: str, path: str, body: dict | None = None, idempotency_key: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {config.BACHS_API_KEY}", "Content-Type": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        # 15 s: Bachs (its sandbox especially) can be slow, and the website's proxies give up at about 25-30 s.
        # Giving up first means people get a clear message instead of a dropped connection.
        res = httpx.request(method, f"{config.BACHS_BASE_URL}{path}", json=body, headers=headers,
                            timeout=httpx.Timeout(15.0, connect=8.0))
    except httpx.TimeoutException as e:
        log.warning("Bachs didn't answer in time: %s %s", method, path)
        raise BachsError("The payment page is taking too long to open. Please try again in a moment.") from e
    except httpx.HTTPError as e:
        log.warning("Couldn't reach Bachs: %s %s (%s)", method, path, type(e).__name__)
        raise BachsError("Couldn’t reach Bachs. Please try again in a moment.") from e
    try:
        data = res.json() if res.content else {}
    except ValueError:
        data = {}
    if res.status_code >= 400:
        log.warning("Bachs refused %s %s: %s %s", method, path, res.status_code, str(data.get("detail") or data.get("message") or "")[:200])
        raise BachsError(data.get("detail") if isinstance(data.get("detail"), str) else f"Bachs returned an error ({res.status_code}).")
    if isinstance(data, dict) and isinstance(data.get("data"), dict) and not ({"checkout_id", "id", "status"} & set(data)):
        data = data["data"]  # some replies wrap the object: {"data": {...}}
    return data if isinstance(data, dict) else {}


def create_checkout(*, currency: str, customer: dict, reference: str, success_url: str, cancel_url: str, metadata: dict,
                    product_id: str | None = None, amount_cents: int | None = None) -> dict:
    """A hosted checkout. With product_id it starts a subscription (a recurring product);
    with amount_cents it's a one-off payment of that amount (NGN periods).
    Returns {checkout_id, checkout_url, ...}."""
    body = {
        "customer": customer,
        "billing_currency": currency,
        "customer_creation": "always",
        "reference": reference,
        "metadata": metadata,
        "success_url": success_url,            # Bachs adds ?checkout_id=...
        "cancel_url": cancel_url,
    }
    if product_id:
        body["product_cart"] = [{"product_id": product_id, "quantity": 1}]
    else:
        body["pricing"] = {"currency": currency, "amount": money(amount_cents or 0)}
    return _call("POST", "/v1/checkout-sessions", body, idempotency_key=reference)


def get_checkout(checkout_id: str) -> dict:
    return _call("GET", f"/v1/checkout-sessions/{checkout_id}")


def get_subscription(subscription_id: str) -> dict:
    return _call("GET", f"/v1/subscriptions/{subscription_id}")


def cancel_subscription(subscription_id: str, at_period_end: bool = True, reason: str | None = None) -> dict:
    body = {"cancel_at_period_end": at_period_end}
    if reason:
        body["reason"] = reason[:255]
    return _call("DELETE", f"/v1/subscriptions/{subscription_id}", body)


def change_plan(subscription_id: str, product_id: str, now: bool) -> dict:
    """Move a subscription to another product. now=True charges the difference straight
    away (same billing period); now=False switches at the next renewal (Bachs stages
    monthly <-> yearly changes until then)."""
    return _call("PATCH", f"/v1/subscriptions/{subscription_id}",
                 {"product_id": product_id, "proration_behavior": "invoice_now" if now else "next_cycle"})


def portal_url(customer_id: str) -> str:
    """A short-lived Bachs page where the customer can update their card and see invoices."""
    return _call("POST", f"/v1/customers/{customer_id}/portal-sessions").get("url", "")


def refund(charge_id: str, reference: str, reason: str) -> dict:
    """Full refund of a charge (Bachs allows one refund per charge)."""
    return _call("POST", "/v1/refunds", {"charge_id": charge_id, "reference": reference, "reason": reason[:500],
                                         "idempotency_key": reference}, idempotency_key=reference)


def signature_ok(body: bytes, headers, now: float | None = None) -> bool:
    """Bachs signs each delivery: HMAC-SHA256 (hex) of "{timestamp}.{raw body}", keyed with
    the endpoint's signing secret. X-Bachs-Signature-V2 is "t=<ts>,v1=<sig>[,v1=<sig>]"
    (several v1 while a secret is being rotated); older senders use X-Bachs-Signature
    with X-Bachs-Timestamp. Deliveries more than 5 minutes old are refused."""
    secret = config.BACHS_WEBHOOK_SECRET
    if not secret:
        return False
    ts, sigs = None, []
    v2 = headers.get("x-bachs-signature-v2")
    if v2:
        for part in v2.split(","):
            key, _, value = part.strip().partition("=")
            if key == "t":
                ts = value
            elif key == "v1" and value:
                sigs.append(value)
    else:
        ts, legacy = headers.get("x-bachs-timestamp"), headers.get("x-bachs-signature")
        if legacy:
            sigs.append(legacy.strip())
    try:
        age = abs((now or time.time()) - int(ts))
    except (TypeError, ValueError):
        return False
    if age > SIGNATURE_TOLERANCE or not sigs:
        return False
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in sigs)
