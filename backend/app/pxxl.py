"""Buying domains through pxxl.app's reseller API (docs.pxxl.app/tools/domain-reseller).

Dixlab takes the customer's payment (Bachs), then buys the domain on pxxl, which
charges Dixlab's pxxl wallet at the wholesale price. pxxl then runs the domain's
DNS, so Dixlab points it at the page by itself.

Needs PXXL_RESELLER_KEY (pxxl_rsl_..., from pxxl: Tools > Domain reseller > Keys),
a pxxl Pro plan, and money in the pxxl wallet. pxxl has no sandbox: every
registration is real and final.

Where the docs don't show a response field, this reads the likely names and logs
what came back, so a mismatch shows up in the logs rather than as a wrong charge."""
import logging

import httpx

from . import config

log = logging.getLogger("dixlab.pxxl")
TIMEOUT = 20


class PxxlError(Exception):
    def __init__(self, message: str, status: int = 0, code: str = ""):
        super().__init__(message)
        self.status, self.code = status, code

    @property
    def final(self) -> bool:
        """pxxl definitely won't buy it (retrying won't help)."""
        return self.code in ("NOT_AVAILABLE", "PRICE_CHANGED", "INSUFFICIENT_FUNDS", "PLAN_UPGRADE_REQUIRED", "NOT_FOUND") \
            or self.status in (400, 401, 403, 404, 422)


def demo() -> bool:
    return config.DOMAIN_SALES == "demo"


def configured() -> bool:
    """Domain sales are switched on (DIXLAB_DOMAIN_SALES): demo needs nothing else, live needs the reseller key."""
    return demo() or (config.DOMAIN_SALES == "live" and bool(config.PXXL_RESELLER_KEY))


def _demo_call(method: str, path: str, body: dict | None, params: dict | None):
    """Demo mode: pxxl answered by Dixlab itself. Nothing is bought and the wallet is never touched.
    Names containing "taken" are unavailable; everything registers and goes live at once."""
    if path == "/availability":
        d = params["domain"]
        cheap = d.endswith((".cv", ".com.ng"))
        return {"domain": d, "available": "taken" not in d, "customerPriceNgn": 6500 if cheap else 25000,
                "customerPriceUsd": 5 if cheap else 18.5, "chargeMinor": 420 if cheap else 1500}
    if method == "POST" and path == "/domains":
        if "fail" in body["domain"]:
            raise PxxlError("Demo: this name always fails, to test refunds.", 409, "NOT_AVAILABLE")
        return {"message": "Demo: registered (nothing was bought)", "balanceMinor": 0}
    if method == "GET" and path.startswith("/domains/"):
        return {"status": "active"}
    return {}


def _call(method: str, path: str, body: dict | None = None, params: dict | None = None, idempotency_key: str | None = None):
    if demo():
        return _demo_call(method, path, body, params)
    headers = {"Authorization": f"Bearer {config.PXXL_RESELLER_KEY}", "Accept": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        r = httpx.request(method, f"{config.PXXL_API}/domain-reseller{path}", json=body, params=params, headers=headers, timeout=TIMEOUT)
    except httpx.TimeoutException:
        raise PxxlError("pxxl is taking too long to answer. Please try again.", 504) from None
    except httpx.HTTPError:
        raise PxxlError("Can’t reach pxxl right now. Please try again.", 502) from None
    try:
        data = r.json()
    except ValueError:
        data = {}
    if isinstance(data, dict) and isinstance(data.get("data"), (dict, list)) and r.is_success:
        data = data["data"]
    if not r.is_success:
        d = data if isinstance(data, dict) else {}
        code = str(d.get("code") or d.get("error_code") or (d.get("error") if isinstance(d.get("error"), str) else "") or "")
        message = d.get("message") or (d.get("error") if isinstance(d.get("error"), str) else "") or f"pxxl answered {r.status_code}"
        log.warning("pxxl %s %s -> %s %s", method, path, r.status_code, code or message)
        raise PxxlError(str(message), r.status_code, code.upper())
    return data


def _num(d: dict, *keys) -> float | None:
    for k in keys:
        v = d.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v.replace(",", ""))
            except ValueError:
                continue
    return None


def quote(domain: str, years: int = 1) -> dict:
    """{domain, available, premium, priceNgn (kobo), priceUsd (cents), chargeMinor (US cents, what pxxl takes)}."""
    d = _call("GET", "/availability", params={"domain": domain, "years": years})
    d = d if isinstance(d, dict) else {}
    ngn = _num(d, "customerPriceNgn", "customer_price_ngn", "priceNgn")
    usd = _num(d, "customerPriceUsd", "customer_price_usd", "priceUsd")
    charge = _num(d, "chargeMinor", "charge_minor")
    available = bool(d.get("available", d.get("isAvailable", False)))
    if available and (ngn is None or usd is None or charge is None):
        log.warning("pxxl quote for %s is missing prices (fields: %s)", domain, ", ".join(sorted(d)))
        available = False
    return {
        "domain": domain, "available": available, "premium": bool(d.get("isPremium") or d.get("premium")),
        # Customer prices are in naira / dollars (with the markup set in your pxxl reseller settings).
        "priceNgn": int(round(ngn * 100)) if ngn is not None else None,
        "priceUsd": int(round(usd * 100)) if usd is not None else None,
        "chargeMinor": int(charge) if charge is not None else None,
    }


def register(domain: str, years: int, contact: dict, customer_ref: str, customer_email: str, max_charge_minor: int,
             idempotency_key: str) -> dict:
    """Buy the domain (charges Dixlab's pxxl wallet). A retry with the same key never buys twice."""
    body = {
        "domain": domain, "years": years, "maxChargeMinor": max_charge_minor,
        "customer": {"reference": customer_ref, "email": customer_email},
        # The registrant: the customer owns the domain, not Dixlab.
        "contact": {k: contact.get(k, "") for k in ("firstName", "lastName", "email", "phone", "organization")},
        "address": {k: contact.get(k, "") for k in ("address1", "address2", "city", "state", "postalCode", "country")},
    }
    return _call("POST", "/domains", body, idempotency_key=idempotency_key)


def status(domain: str) -> str:
    """'registering', 'active', ... (lower-case), or '' if pxxl didn't say."""
    d = _call("GET", f"/domains/{domain}")
    d = d if isinstance(d, dict) else {}
    inner = d.get("domain") if isinstance(d.get("domain"), dict) else {}
    return str(d.get("status") or inner.get("status") or "").lower()


def set_dns_record(domain: str, rtype: str, name: str, value: str, ttl: int = 300) -> None:
    _call("POST", f"/domains/{domain}/dns-records", {"type": rtype, "name": name, "value": value, "ttl": ttl})
