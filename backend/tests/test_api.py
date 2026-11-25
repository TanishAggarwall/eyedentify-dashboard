"""End-to-end tests of the HTTP API: detection, scanning, reading, AI fallback and input validation."""
import base64

import numpy as np
import pytest
import zxingcpp
from PIL import Image, ImageDraw

from conftest import bold_font, jpeg_bytes

JPEG = {"Content-Type": "image/jpeg"}


def text_image(text: str) -> Image.Image:
    img = Image.new("RGB", (640, 200), "white")
    ImageDraw.Draw(img).text((30, 60), text, fill="black", font=bold_font(64))
    return img


def test_health_reports_model_and_ai_state(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model"] == "yolo11n-320"
    assert body["classes"] == 80
    assert body["input_size"] == 320
    assert body["ai"]["enabled"] is False  # tests run without a Gemini key


def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert "camera=(self)" in r.headers["Permissions-Policy"]


def test_dashboard_is_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "EYEDENTIFY" in r.text


@pytest.mark.parametrize("path", ["/api/detect", "/api/read", "/api/scan"])
def test_image_endpoints_reject_empty_body(client, path):
    assert client.post(path, content=b"", headers=JPEG).status_code == 400


@pytest.mark.parametrize("path", ["/api/detect", "/api/read", "/api/scan"])
def test_image_endpoints_reject_non_images(client, path):
    assert client.post(path, content=b"definitely not a jpeg", headers=JPEG).status_code == 415


def test_image_endpoints_reject_huge_uploads(client):
    r = client.post("/api/detect", content=b"\xff" * (3 * 1024 * 1024 + 1), headers=JPEG)
    assert r.status_code == 413


def test_detect_returns_normalised_boxes(client):
    rng = np.random.default_rng(0)
    img = Image.fromarray(rng.integers(0, 255, (240, 320, 3), dtype=np.uint8))
    r = client.post("/api/detect", content=jpeg_bytes(img), headers=JPEG)
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "yolo11n-320"
    assert (body["width"], body["height"]) == (320, 240)
    assert isinstance(body["detections"], list)
    assert body["inference_ms"] > 0
    for det in body["detections"]:
        x, y, w, h = det["box"]
        assert 0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1
        assert 0 <= det["score"] <= 1


def test_scan_decodes_a_upi_qr_code(client):
    upi = "upi://pay?pa=sharmabakery@okaxis&pn=Sharma%20Bakery&am=120&cu=INR"
    code = zxingcpp.create_barcode(upi, zxingcpp.BarcodeFormat.QRCode)
    qr = Image.fromarray(np.array(zxingcpp.write_barcode_to_image(code, scale=8))).convert("RGB")
    canvas = Image.new("RGB", (qr.width + 80, qr.height + 80), "white")
    canvas.paste(qr, (40, 40))
    r = client.post("/api/scan", content=jpeg_bytes(canvas), headers=JPEG)
    assert r.status_code == 200
    assert any(c["text"] == upi for c in r.json()["codes"])


def test_read_finds_printed_text(client):
    r = client.post("/api/read", content=jpeg_bytes(text_image("EXIT GATE 3")), headers=JPEG)
    assert r.status_code == 200
    text = r.json()["text"].upper().replace(" ", "")
    assert "EXIT" in text and "GATE" in text


def test_talk_ai_uses_demo_answer_without_a_key(client):
    image = base64.b64encode(jpeg_bytes(Image.new("RGB", (32, 32), "grey"))).decode()
    r = client.post("/api/ai/ask", json={"image": image, "question": "Where did I put my keys?"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "demo"
    assert body["answer"]


def test_ai_read_falls_back_to_ocr_without_a_key(client):
    image = base64.b64encode(jpeg_bytes(text_image("OPEN"))).decode()
    r = client.post("/api/ai/read", json={"image": image})
    assert r.status_code == 200
    assert r.json()["source"] == "ocr"


def test_ai_rejects_bad_base64(client):
    r = client.post("/api/ai/ask", json={"image": "%%%not-base64%%%", "question": "hi"})
    assert r.status_code == 400


@pytest.mark.parametrize("query", [
    "/api/nav/reverse?lat=95&lon=10",
    "/api/nav/reverse?lat=10&lon=200",
    "/api/nav/route?flat=0&flon=0&tlat=-91&tlon=0",
])
def test_navigation_rejects_out_of_range_coordinates(client, query):
    assert client.get(query).status_code == 400


def test_navigation_refuses_routes_over_25_km(client):
    # Delhi to Agra: far beyond walking range, rejected before any network call.
    r = client.get("/api/nav/route?flat=28.6129&flon=77.2295&tlat=27.1751&tlon=78.0421")
    assert r.status_code == 400
    assert "25 km" in r.json()["detail"]
