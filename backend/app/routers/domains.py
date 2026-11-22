"""Addresses for published pages.

* A Dixlab address, like ada.dixlab.click: the "Dixlab address" unlock (credits).
  Live straight away; *.dixlab.click already points at the website.
* Their own domain, like alexmorgan.com, bought from a provider such as pxxl.app.
  Connecting it is free:

1. The owner adds the domain. We save it unverified and, when
   Vercel is configured (DIXLAB_VERCEL_TOKEN + DIXLAB_VERCEL_PROJECT_ID), add it
   to the website's Vercel project so it can serve and get an HTTPS certificate.
2. They add two DNS records at their registrar: a TXT record that proves they own
   the domain, and a CNAME (or A record for a root domain) that points it at us.
3. "Check" looks both up over DNS-over-HTTPS. Once the TXT matches, the domain is
   live: the website asks /api/domains/resolve which page to show for that host."""
import json
import logging
import re
import secrets
import sqlite3

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from .. import config, events, plans
from ..db import get_db
from ..security import current_user, now_ms

router = APIRouter(tags=["domains"])

HOST = re.compile(r"^(?=.{4,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$")
CNAME_TARGET = "cname.vercel-dns.com"
A_TARGET = "76.76.21.21"
DOH = "https://cloudflare-dns.com/dns-query"
RESERVED = ("dixlab", "vercel.app", "vercel.com", "pxxl.click", "pxxl.app", "localhost")
SUB_NAME = re.compile(r"^(?!-)[a-z0-9-]{3,30}(?<!-)$")
SUB_RESERVED = {"www", "api", "app", "admin", "mail", "email", "smtp", "ftp", "blog", "help", "support", "status", "docs", "dev",
                "staging", "test", "beta", "dixlab", "pricing", "gallery", "login", "signup", "account", "billing", "cdn", "static",
                "assets", "uploads", "ns1", "ns2", "root", "official", "team", "security"}


def clean_domain(value: str) -> str:
    d = str(value or "").strip().lower()
    d = re.sub(r"^https?://", "", d).split("/")[0].split("?")[0].rstrip(".")
    return d


def _apex(domain: str) -> bool:
    return domain.count(".") == 1  # "alex.com" (good enough for common TLDs; "alex.co.uk" shows both options)


def _records(domain: str, token: str) -> list[dict]:
    point = ({"type": "A", "name": "@", "value": A_TARGET} if _apex(domain)
             else {"type": "CNAME", "name": domain.split(".")[0], "value": CNAME_TARGET})
    return [{"type": "TXT", "name": f"_dixlab.{domain}", "value": f"dixlab-verify={token}", "purpose": "Proves the domain is yours"},
            {**point, "purpose": "Points the domain at your page"}]


def _out(row) -> dict:
    if not row:
        return {"domain": None}
    return {"domain": row["domain"], "verified": bool(row["verified_at"]), "records": _records(row["domain"], row["token"]),
            "connected": row["vercel"] == "added" or not vercel_configured(), "url": f"https://{row['domain']}"}


# ---------------------------------------------------------------- outside services

def vercel_configured() -> bool:
    return bool(config.VERCEL_TOKEN and config.VERCEL_PROJECT_ID)


def _vercel(method: str, path: str, body: dict | None = None) -> bool:
    if not vercel_configured():
        return False
    team = f"?teamId={config.VERCEL_TEAM_ID}" if config.VERCEL_TEAM_ID else ""
    try:
        r = httpx.request(method, f"https://api.vercel.com{path}{team}", json=body, timeout=10,
                          headers={"Authorization": f"Bearer {config.VERCEL_TOKEN}"})
        # 409: already on this project, which is fine.
        return r.status_code < 300 or r.status_code == 409
    except httpx.HTTPError:
        return False


def dns(name: str, kind: str) -> list[str]:
    """Answers for a DNS lookup, via Cloudflare's DNS-over-HTTPS. Empty on any failure."""
    try:
        r = httpx.get(DOH, params={"name": name, "type": kind}, headers={"accept": "application/dns-json"}, timeout=6)
        return [str(a.get("data", "")).strip('"').rstrip(".").lower() for a in r.json().get("Answer") or []]
    except (httpx.HTTPError, ValueError):
        return []


# ---------------------------------------------------------------- owner

def _publication(db, user_id: str, project_id: str):
    pub = db.execute("SELECT slug FROM publications WHERE user_id = ? AND project_id = ?", (user_id, project_id)).fetchone()
    if not pub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Publish the page first.")
    return pub


@router.get("/api/projects/{project_id}/domain")
def get_domain(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'custom'", (user["id"], project_id)).fetchone()
    sub = db.execute("SELECT domain FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'sub'", (user["id"], project_id)).fetchone()
    return {**_out(row), "sub": _sub_out(sub), "subBase": config.SUBDOMAIN_BASE, "sales": config.DOMAIN_SALES if pxxl_ready() else "off"}


def pxxl_ready() -> bool:
    from .. import pxxl
    return pxxl.configured()


class DomainIn(BaseModel):
    domain: str = Field(max_length=260)


@router.put("/api/projects/{project_id}/domain")
def set_domain(project_id: str, body: DomainIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    pub = _publication(db, user["id"], project_id)
    domain = clean_domain(body.domain)
    own = clean_domain(config.PUBLIC_URL)
    if not HOST.match(domain) or domain == own or any(r in domain for r in RESERVED):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Enter a domain you own, like alexmorgan.com or work.alexmorgan.com. "
                            f"For a free {config.SUBDOMAIN_BASE} address, use “Your Dixlab address”.")
    taken = db.execute("SELECT user_id, project_id FROM domains WHERE domain = ?", (domain,)).fetchone()
    if taken and (taken["user_id"], taken["project_id"]) != (user["id"], project_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "That domain is already connected to another Dixlab page.")
    old = db.execute("SELECT * FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'custom'", (user["id"], project_id)).fetchone()
    if old and old["domain"] == domain:
        return _out(old)
    if old:
        db.execute("DELETE FROM domains WHERE domain = ?", (old["domain"],))
        _vercel("DELETE", f"/v9/projects/{config.VERCEL_PROJECT_ID}/domains/{old['domain']}")
    added = _vercel("POST", f"/v10/projects/{config.VERCEL_PROJECT_ID}/domains", {"name": domain})
    db.execute("INSERT INTO domains (domain, user_id, project_id, slug, token, vercel, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
               (domain, user["id"], project_id, pub["slug"], secrets.token_hex(12), "added" if added else None, now_ms()))
    events.log(db, "domain.added", user["id"], domain=domain)
    return _out(db.execute("SELECT * FROM domains WHERE domain = ?", (domain,)).fetchone())


@router.post("/api/projects/{project_id}/domain/check")
def check_domain(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'custom'", (user["id"], project_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Add a domain first.")
    domain = row["domain"]
    owned = f"dixlab-verify={row['token']}" in dns(f"_dixlab.{domain}", "TXT")
    pointed = CNAME_TARGET in dns(domain, "CNAME") or A_TARGET in dns(domain, "A")
    if owned and not row["verified_at"]:
        db.execute("UPDATE domains SET verified_at = ? WHERE domain = ?", (now_ms(), domain))
        events.log(db, "domain.verified", user["id"], domain=domain)
    if row["vercel"] != "added" and _vercel("POST", f"/v10/projects/{config.VERCEL_PROJECT_ID}/domains", {"name": domain}):
        db.execute("UPDATE domains SET vercel = 'added' WHERE domain = ?", (domain,))
    out = _out(db.execute("SELECT * FROM domains WHERE domain = ?", (domain,)).fetchone())
    return {**out, "owned": owned, "pointed": pointed}


@router.delete("/api/projects/{project_id}/domain", status_code=204)
def remove_domain(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT domain FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'custom'", (user["id"], project_id)).fetchone()
    if row:
        db.execute("DELETE FROM domains WHERE domain = ?", (row["domain"],))
        _vercel("DELETE", f"/v9/projects/{config.VERCEL_PROJECT_ID}/domains/{row['domain']}")
        events.log(db, "domain.removed", user["id"], domain=row["domain"])
    return Response(status_code=204)


# ---------------------------------------------------------------- Dixlab addresses (name.dixlab.click)

def _sub_out(row) -> dict | None:
    return {"domain": row["domain"], "url": f"https://{row['domain']}"} if row else None


class SubIn(BaseModel):
    name: str = Field(max_length=40)


@router.put("/api/projects/{project_id}/subdomain")
def set_subdomain(project_id: str, body: SubIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Give the page a Dixlab address (the "Dixlab address" unlock). Changing it frees the old name."""
    plans.require(db, user["id"], "subdomain")
    pub = _publication(db, user["id"], project_id)
    name = body.name.strip().lower()
    if not SUB_NAME.match(name) or name in SUB_RESERVED:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Use 3 to 30 letters, numbers or hyphens, like ada-obi.")
    domain = f"{name}.{config.SUBDOMAIN_BASE}"
    taken = db.execute("SELECT user_id, project_id FROM domains WHERE domain = ?", (domain,)).fetchone()
    if taken and (taken["user_id"], taken["project_id"]) != (user["id"], project_id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{domain} is taken. Try another name.")
    db.execute("DELETE FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'sub'", (user["id"], project_id))
    # The wildcard *.dixlab.click already serves it; attaching it on Vercel too is harmless when that's set up.
    added = _vercel("POST", f"/v10/projects/{config.VERCEL_PROJECT_ID}/domains", {"name": domain})
    db.execute("INSERT INTO domains (domain, user_id, project_id, slug, token, vercel, kind, verified_at, created_at) "
               "VALUES (?, ?, ?, ?, ?, ?, 'sub', ?, ?)",
               (domain, user["id"], project_id, pub["slug"], secrets.token_hex(12), "added" if added else None, now_ms(), now_ms()))
    events.log(db, "domain.sub", user["id"], domain=domain)
    return _sub_out(db.execute("SELECT domain FROM domains WHERE domain = ?", (domain,)).fetchone())


@router.delete("/api/projects/{project_id}/subdomain", status_code=204)
def remove_subdomain(project_id: str, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'sub'", (user["id"], project_id))
    return Response(status_code=204)


# ---------------------------------------------------------------- the website

@router.get("/api/domains/resolve")
def resolve(host: str, db: sqlite3.Connection = Depends(get_db)):
    """Which published page a custom domain shows. {"slug": null} for Dixlab's own hosts and unknown ones."""
    domain = clean_domain(host).removeprefix("www.")
    row = db.execute(
        "SELECT d.project_id, d.user_id FROM domains d JOIN users u ON u.id = d.user_id "
        "WHERE d.domain IN (?, ?) AND d.verified_at IS NOT NULL AND u.suspended_at IS NULL", (domain, f"www.{domain}")).fetchone()
    if not row:
        return {"slug": None}
    # Looked up now, so the domain follows the page even if it was republished at a new link.
    pub = db.execute("SELECT slug FROM publications WHERE user_id = ? AND project_id = ?", (row["user_id"], row["project_id"])).fetchone()
    return {"slug": pub["slug"] if pub else None}



# ---------------------------------------------------------------- buying a domain (through pxxl.app)

log = logging.getLogger("dixlab.domains")
_search_ip = None


def _price(quote: dict) -> dict:
    """What the customer pays: pxxl's customer price, plus Dixlab's optional extra margin."""
    k = 1 + max(0.0, config.DOMAIN_MARKUP_PERCENT) / 100
    return {"NGN": int(round(quote["priceNgn"] * k / 100) * 100), "USD": int(round(quote["priceUsd"] * k))}


@router.get("/api/domains/search")
def search_domains(q: str, user=Depends(current_user)):
    """Is this name free? A bare name ("adaobi") is checked across popular endings."""
    from .. import pxxl
    from ..ratelimit import Limiter
    global _search_ip
    _search_ip = _search_ip or Limiter("domain_search", 30, 10 * 60)
    if not pxxl.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Buying domains isn’t set up on this server yet.")
    if not _search_ip.hit(user["id"]):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "That’s a lot of searches. Try again in a few minutes.")
    term = clean_domain(q).removeprefix("www.")
    if "." in term:
        names = [term]
    else:
        base = re.sub(r"[^a-z0-9-]", "", term)[:63].strip("-")
        names = [f"{base}.{t}" for t in config.DOMAIN_TLDS] if base else []
    names = [n for n in names if HOST.match(n) and not any(r in n for r in RESERVED)][:8]
    if not names:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Type a name, like adaobi or adaobi.com.")
    from concurrent.futures import ThreadPoolExecutor

    def one(name):
        try:
            qt = pxxl.quote(name)
        except pxxl.PxxlError:
            return {"domain": name, "available": False, "error": True}
        out = {"domain": name, "available": qt["available"], "premium": qt["premium"]}
        if qt["available"]:
            out["prices"] = _price(qt)
        return out
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, names))
    return {"results": results}


class ContactIn(BaseModel):
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    email: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=6, max_length=30)
    organization: str = Field(default="", max_length=100)
    address1: str = Field(min_length=2, max_length=200)
    address2: str = Field(default="", max_length=200)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    postalCode: str = Field(min_length=1, max_length=20)
    country: str = Field(min_length=2, max_length=2)  # ISO code, e.g. NG


class BuyIn(BaseModel):
    domain: str = Field(max_length=260)
    years: int = Field(default=1, ge=1, le=5)
    currency: str = Field(default="USD", pattern="^(NGN|USD)$")
    contact: ContactIn


@router.post("/api/projects/{project_id}/domain/buy")
def buy_domain(project_id: str, body: BuyIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Start buying a domain for this page: price it fresh, then send the customer to pay (Bachs)."""
    from .. import bachs, pxxl
    if not pxxl.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Buying domains isn’t set up on this server yet.")
    fake_payment = pxxl.demo() and not bachs.configured(body.currency)  # demo without Bachs: payment simulated too
    if not bachs.configured(body.currency) and not fake_payment:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payments aren’t set up on this server yet.")
    if not user.get("email_verified", True):
        from .account import unverified_response
        return unverified_response()
    _publication(db, user["id"], project_id)
    domain = clean_domain(body.domain).removeprefix("www.")
    if not HOST.match(domain) or any(r in domain for r in RESERVED):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That isn’t a domain we can buy.")
    if db.execute("SELECT 1 FROM domain_orders WHERE domain = ? AND status IN ('paid', 'registering', 'active')", (domain,)).fetchone():
        raise HTTPException(status.HTTP_409_CONFLICT, "Someone has just bought that domain.")
    try:
        qt = pxxl.quote(domain, body.years)  # always a fresh price: they change
    except pxxl.PxxlError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e)) from None
    if not qt["available"]:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{domain} isn’t available. Try another name or ending.")
    amount = _price(qt)[body.currency]
    reference = f"dm_{secrets.token_hex(12)}"
    now = now_ms()
    db.execute("INSERT INTO domain_orders (reference, user_id, project_id, domain, years, amount, currency, charge_minor, contact, status, "
               "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?)",
               (reference, user["id"], project_id, domain, body.years, amount, body.currency, qt["chargeMinor"],
                json.dumps(body.contact.model_dump()), now, now))
    db.execute("INSERT INTO payments (reference, user_id, email, plan, interval, amount, currency, status, created_at) "
               "VALUES (?, ?, ?, 'domain', ?, ?, ?, 'pending', ?)", (reference, user["id"], user["email"], domain, amount, body.currency, now))
    if fake_payment:
        db.execute("UPDATE payments SET status = 'success', paid_at = ? WHERE reference = ?", (now, reference))
        db.execute("UPDATE domain_orders SET status = 'paid' WHERE reference = ?", (reference,))
        finish_order(db, reference)
        events.log(db, "domain.demo", user["id"], domain=domain)
        return {"demo": True, "reference": reference,
                "order": order_out(db.execute("SELECT * FROM domain_orders WHERE reference = ?", (reference,)).fetchone())}
    try:
        data = bachs.create_checkout(
            currency=body.currency, amount_cents=amount, customer={"email": user["email"], "name": user["name"]}, reference=reference,
            success_url=f"{config.PUBLIC_URL}/billing/callback/{reference}", cancel_url=f"{config.PUBLIC_URL}/editor/{project_id}?domain=cancelled",
            metadata={"user_id": user["id"], "plan": "domain", "interval": domain, "currency": body.currency},
        )
    except bachs.BachsError as e:
        db.execute("UPDATE payments SET status = 'failed' WHERE reference = ?", (reference,))
        db.execute("UPDATE domain_orders SET status = 'failed', error = 'checkout', updated_at = ? WHERE reference = ?", (now_ms(), reference))
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e)) from None
    checkout_id = data.get("checkout_id") or data.get("id")
    db.execute("UPDATE payments SET checkout_ref = ? WHERE reference = ?", (checkout_id, reference))
    events.log(db, "domain.checkout", user["id"], domain=domain, amount=amount, currency=body.currency)
    return {"url": data.get("checkout_url") or data.get("url"), "checkoutId": checkout_id, "reference": reference}


def order_out(row) -> dict | None:
    if not row:
        return None
    return {"reference": row["reference"], "domain": row["domain"], "years": row["years"], "amount": row["amount"],
            "demo": config.DOMAIN_SALES == "demo",
            "currency": row["currency"], "status": row["status"], "projectId": row["project_id"], "createdAt": row["created_at"],
            "error": {"refunded": "We couldn’t register it, so your payment is being refunded.",
                      "refund_failed": "We couldn’t register it. We’ll refund you by hand: no need to do anything."}.get(row["error"] or "")}


@router.get("/api/domain-orders")
def my_domain_orders(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    """Your domain purchases. Ones still in progress are moved along while you watch."""
    rows = db.execute("SELECT reference FROM domain_orders WHERE user_id = ? AND status IN ('paid', 'registering')", (user["id"],)).fetchall()
    for r in rows:
        finish_order(db, r["reference"])
    return {"orders": [order_out(r) for r in db.execute(
        "SELECT * FROM domain_orders WHERE user_id = ? AND status != 'awaiting_payment' ORDER BY created_at DESC LIMIT 20", (user["id"],))]}


def _refund(db, order) -> None:
    """pxxl won't register it: give the money back through Bachs."""
    from .. import bachs
    pay = db.execute("SELECT charge_ref FROM payments WHERE reference = ?", (order["reference"],)).fetchone()
    try:
        if not (pay and pay["charge_ref"]):
            raise bachs.BachsError("no charge id")
        bachs.refund(pay["charge_ref"], reference=f"rf_{order['reference']}"[:128], reason="The domain couldn’t be registered")
        db.execute("UPDATE payments SET refund_status = 'pending' WHERE reference = ?", (order["reference"],))
        error = "refunded"
    except bachs.BachsError as e:
        log.error("Domain order %s failed and couldn't be refunded automatically: %s", order["reference"], e)
        error = "refund_failed"
    db.execute("UPDATE domain_orders SET status = 'failed', error = ?, updated_at = ? WHERE reference = ?", (error, now_ms(), order["reference"]))
    events.log(db, "domain.failed", order["user_id"], domain=order["domain"], refund=error)


def finish_order(db, reference: str) -> None:
    """Move a paid order along: register it on pxxl, then (once pxxl says it's active) point it at the page."""
    from .. import pxxl
    order = db.execute("SELECT * FROM domain_orders WHERE reference = ?", (reference,)).fetchone()
    if not order or order["status"] not in ("paid", "registering") or not pxxl.configured():
        return
    domain = order["domain"]
    if order["status"] == "paid":
        contact = json.loads(order["contact"])
        try:
            pxxl.register(domain, order["years"], contact, customer_ref=order["user_id"], customer_email=contact.get("email", ""),
                          max_charge_minor=order["charge_minor"], idempotency_key=order["reference"])
        except pxxl.PxxlError as e:
            if e.final:
                _refund(db, order)
            return  # otherwise try again next time (same key: never bought twice)
        db.execute("UPDATE domain_orders SET status = 'registering', updated_at = ? WHERE reference = ?", (now_ms(), reference))
        events.log(db, "domain.registered", order["user_id"], domain=domain)
    try:
        state = pxxl.status(domain)
    except pxxl.PxxlError:
        return
    if state and state != "active":
        return
    # Ours to configure: point it at the website and prove ownership in one go.
    token = secrets.token_hex(12)
    try:
        pxxl.set_dns_record(domain, "A", "@", A_TARGET)
        pxxl.set_dns_record(domain, "CNAME", "www", CNAME_TARGET)
        pxxl.set_dns_record(domain, "TXT", "_dixlab", f"dixlab-verify={token}")
    except pxxl.PxxlError as e:
        if e.code == "NOT_REGISTERED" or not e.final:
            return  # pxxl isn't ready yet
        log.warning("Couldn't set DNS for %s: %s", domain, e)
    pub = db.execute("SELECT slug FROM publications WHERE user_id = ? AND project_id = ?", (order["user_id"], order["project_id"])).fetchone()
    db.execute("DELETE FROM domains WHERE user_id = ? AND project_id = ? AND kind = 'custom'", (order["user_id"], order["project_id"]))
    db.execute("DELETE FROM domains WHERE domain = ?", (domain,))
    added = False
    if not pxxl.demo():  # demo domains aren't real: keep them off the website's Vercel project
        added = _vercel("POST", f"/v10/projects/{config.VERCEL_PROJECT_ID}/domains", {"name": domain})
        _vercel("POST", f"/v10/projects/{config.VERCEL_PROJECT_ID}/domains", {"name": f"www.{domain}"})
    db.execute("INSERT INTO domains (domain, user_id, project_id, slug, token, vercel, kind, verified_at, created_at) "
               "VALUES (?, ?, ?, ?, ?, ?, 'custom', ?, ?)",
               (domain, order["user_id"], order["project_id"], pub["slug"] if pub else "", token, "added" if added else None, now_ms(), now_ms()))
    db.execute("UPDATE domain_orders SET status = 'active', updated_at = ? WHERE reference = ?", (now_ms(), reference))
    events.log(db, "domain.live", order["user_id"], domain=domain)
