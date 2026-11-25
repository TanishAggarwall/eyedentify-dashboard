"""Phone-as-camera pairing: sessions, WebRTC signalling, frame relay and the QR helper."""
import io

import numpy as np
import pytest
import zxingcpp
from PIL import Image

import remote
from conftest import jpeg_bytes

OFFER = {"type": "offer", "sdp": "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n"}
ANSWER = {"type": "answer", "sdp": "v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\n"}
JPEG = {"Content-Type": "image/jpeg"}


@pytest.fixture
def code(client):
    r = client.post("/api/remote/session")
    assert r.status_code == 200
    body = r.json()
    assert body["expires_in"] == remote.IDLE_TTL
    return body["code"]


def test_session_code_format(code):
    assert len(code) == remote.CODE_LENGTH
    assert set(code) <= set(remote.CODE_ALPHABET)


def test_codes_are_unique(client):
    codes = {client.post("/api/remote/session").json()["code"] for _ in range(30)}
    assert len(codes) == 30


def test_unknown_code_is_404(client):
    assert client.get("/api/remote/NOPE99/status").status_code == 404
    assert client.get("/api/remote/NOPE99/offer").status_code == 404
    assert client.post("/api/remote/NOPE99/frame", content=jpeg_bytes(Image.new("RGB", (8, 8))), headers=JPEG).status_code == 404


def test_codes_are_case_and_space_insensitive(client, code):
    assert client.get(f"/api/remote/{code.lower()}/status").status_code == 200


def test_webrtc_handshake(client, code):
    # Laptop polls before the phone has joined.
    assert client.get(f"/api/remote/{code}/offer").status_code == 204
    status = client.get(f"/api/remote/{code}/status").json()
    assert status["phone_connected"] is False and status["has_offer"] is False

    # An answer before any offer is refused.
    assert client.post(f"/api/remote/{code}/answer", json=ANSWER).status_code == 409

    # Phone sends its offer.
    r = client.post(f"/api/remote/{code}/offer", json=OFFER)
    assert r.status_code == 200 and r.json()["phone_connected"] is True
    assert client.get(f"/api/remote/{code}/offer").json() == OFFER
    assert client.get(f"/api/remote/{code}/answer").status_code == 204

    # Laptop answers; phone picks it up.
    assert client.post(f"/api/remote/{code}/answer", json=ANSWER).status_code == 200
    assert client.get(f"/api/remote/{code}/answer").json() == ANSWER

    # A new offer (phone page reloaded) clears the old answer for a fresh handshake.
    client.post(f"/api/remote/{code}/offer", json=OFFER)
    assert client.get(f"/api/remote/{code}/answer").status_code == 204


@pytest.mark.parametrize("desc", [
    {"type": "answer", "sdp": "v=0\r\n"},          # wrong type for an offer
    {"type": "offer", "sdp": "not sdp"},           # not SDP
    {"type": "offer", "sdp": "v=0" + "x" * 30000},  # too long
], ids=["wrong-type", "not-sdp", "too-long"])
def test_bad_offers_are_rejected(client, code, desc):
    assert client.post(f"/api/remote/{code}/offer", json=desc).status_code == 400


def test_frame_relay_delivers_newest_frame(client, code):
    first = jpeg_bytes(Image.new("RGB", (64, 48), "red"))
    second = jpeg_bytes(Image.new("RGB", (64, 48), "blue"))
    assert client.post(f"/api/remote/{code}/frame", content=first, headers=JPEG).json() == {"seq": 1}
    assert client.post(f"/api/remote/{code}/frame", content=second, headers=JPEG).json() == {"seq": 2}

    r = client.get(f"/api/remote/{code}/frame?after=0")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpeg"
    assert r.headers["x-frame-seq"] == "2"
    assert r.content == second  # only the latest frame is kept

    status = client.get(f"/api/remote/{code}/status").json()
    assert status["transport"] == "relay" and status["seq"] == 2


def test_frame_poll_with_nothing_new_returns_204(client, code, monkeypatch):
    client.post(f"/api/remote/{code}/frame", content=jpeg_bytes(Image.new("RGB", (8, 8))), headers=JPEG)

    async def quick(code_, after, timeout=2.0):  # skip the 2 s long-poll wait in tests
        return await original(code_, after, timeout=0.05)

    original = remote.wait_frame
    monkeypatch.setattr(remote, "wait_frame", quick)
    assert client.get(f"/api/remote/{code}/frame?after=1").status_code == 204


@pytest.mark.parametrize("body,status", [
    (b"", 400),
    (b"GIF89a not a jpeg", 415),
    (b"\xff\xd8" + b"\x00" * (remote.MAX_FRAME + 1), 413),
], ids=["empty", "not-jpeg", "too-large"])
def test_bad_frames_are_rejected(client, code, body, status):
    assert client.post(f"/api/remote/{code}/frame", content=body, headers=JPEG).status_code == status


def test_ping_records_transport(client, code):
    r = client.post(f"/api/remote/{code}/ping", json={"transport": "webrtc"})
    assert r.status_code == 200
    assert r.json()["transport"] == "webrtc" and r.json()["phone_connected"] is True


def test_ending_a_session(client, code):
    assert client.delete(f"/api/remote/{code}").status_code == 204
    assert client.get(f"/api/remote/{code}/status").status_code == 404


def test_idle_sessions_expire(client, code, monkeypatch):
    monkeypatch.setattr(remote, "IDLE_TTL", -1)
    assert client.get(f"/api/remote/{code}/status").status_code == 404


def test_qr_encodes_the_pairing_link(client):
    url = "https://eyedentify-dashboard.vercel.app/phone.html?c=ABC234"
    r = client.get("/api/qr", params={"text": url})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(r.content))
    assert zxingcpp.read_barcodes(np.asarray(img.convert("L")))[0].text == url


@pytest.mark.parametrize("text", ["", "x" * 513], ids=["empty", "too-long"])
def test_qr_rejects_bad_text(client, text):
    assert client.get("/api/qr", params={"text": text}).status_code in (400, 422)


def test_phone_page_is_served(client):
    r = client.get("/phone.html")
    assert r.status_code == 200
    assert "Use this phone as the camera" in r.text
