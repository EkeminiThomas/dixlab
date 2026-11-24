"""Fixes from the November 2026 security review: translated links are cleaned like the
originals, and outside requests connect only to the address that was checked."""
import socket

import httpx
import pytest

from test_api import client, sign_up  # sets up the test database and environment first

from app import safety, webread


def test_translated_links_and_images_are_cleaned_like_the_originals():
    project = {"title": "Ledger", "projects": [{"link": "https://ledger.app", "title": "Ledger"}],
               "translations": {"fr": {"projects.0.link": "javascript:alert(document.cookie)", "projects.0.title": "Grand livre",
                                       "cover.src": "https://tracker.example/pixel.png", "availability.bookingUrl": "https://cal.example/ada",
                                       "tagline": "java\tscript:alert(1)", "bad": {"nested": "x"}},
                                "x" * 20: {"title": "ignored"}}}
    out = safety.clean(project)["translations"]
    assert out["fr"]["projects.0.link"] == ""                        # a javascript: link is removed
    assert out["fr"]["projects.0.title"] == "Grand livre"
    assert "cover.src" not in out["fr"]                                # images aren't translated
    assert out["fr"]["availability.bookingUrl"] == "https://cal.example/ada"
    assert out["fr"]["tagline"] == "" and "bad" not in out["fr"] and list(out) == ["fr"]


def test_a_saved_translation_cant_carry_a_script_link():
    c = client(); h = sign_up(c, "tr-xss@example.com")
    body = {"id": "p-tr", "type": "portfolio", "template": "folio", "title": "x", "updatedAt": 1,
            "projects": [{"title": "Ledger", "link": "https://ledger.app"}],
            "translations": {"fr": {"projects.0.link": "javascript:fetch('/api/account')"}}}
    assert c.put("/api/projects/p-tr", json=body, headers=h).status_code in (200, 201)
    saved = c.get("/api/projects/p-tr", headers=h).json()["project"]
    assert saved["translations"]["fr"]["projects.0.link"] == ""


class Record(httpx.BaseTransport):
    def __init__(self):
        self.sent = []

    def handle_request(self, request):
        self.sent.append(request)
        return httpx.Response(200, text="ok")


def test_requests_go_to_the_checked_address_not_a_second_lookup(monkeypatch):
    """DNS rebinding: the check sees a public address, a second lookup would see 127.0.0.1."""
    answers = iter(["93.184.215.14", "127.0.0.1", "127.0.0.1"])
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *a, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (next(answers), port))])
    rec = Record()
    with webread.client() as c:
        c._transport._t = rec  # what the pinned transport would have connected to
        assert c.get("https://rebind.example/page").status_code == 200
    sent = rec.sent[0]
    assert sent.url.host == "93.184.215.14"                            # the address that was checked
    assert sent.headers["host"] == "rebind.example" and sent.extensions["sni_hostname"] == "rebind.example"


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "::ffff:10.0.0.1", "fd00::1", "0.0.0.0"])
def test_private_addresses_are_never_connected_to(monkeypatch, ip):
    fam = socket.AF_INET6 if ":" in ip else socket.AF_INET
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *a, **k: [(fam, socket.SOCK_STREAM, 6, "", (ip, port))])
    rec = Record()
    with webread.client() as c:
        c._transport._t = rec
        with pytest.raises(httpx.ConnectError):
            c.get("http://inside.example/")
    assert rec.sent == []


def test_one_private_address_among_public_ones_is_refused(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *a, **k: [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", port)), (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))])
    assert webread.public_addresses("mixed.example", 443) == []
