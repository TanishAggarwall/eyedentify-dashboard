"""Shared test setup: run the API with AI turned off so no test ever calls Gemini or spends quota."""
import io
import os
import sys
from pathlib import Path

import pytest
from PIL import ImageFont

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

# Set before app.py loads backend/.env (its loader never overrides existing variables).
os.environ["GEMINI_API_KEY"] = ""
os.environ.setdefault("ORT_THREADS", "1")


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    import app as app_module

    with TestClient(app_module.app) as c:
        yield c


def jpeg_bytes(img) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=92)
    return buf.getvalue()


def bold_font(size: int = 64):
    """A bold TrueType font on Windows or Linux CI, else Pillow's built-in one."""
    for name in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)
