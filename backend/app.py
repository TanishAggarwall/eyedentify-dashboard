"""EYEDENTIFY ONE cloud backend.

Serves the dashboard (public/) and the detection API from one HTTPS origin:
  GET  /api/health   model and server status
  POST /api/detect   body: a JPEG/PNG/WebP camera frame -> YOLO detections (normalised boxes)
  POST /api/read     body: an image -> recognised text, line by line (OCR)
  POST /api/scan     body: an image -> QR codes and barcodes found in it
  POST /api/ai/ask        JSON {image, question} -> spoken answer about the scene (Gemini)
  POST /api/ai/read       JSON {image}           -> text, line by line (Gemini; falls back to OCR)
  POST /api/ai/translate  JSON {text, target}    -> translation (Gemini)
  POST /api/ai/banknote   JSON {image}           -> banknotes seen and their total (Gemini)
Images in JSON are base64-encoded JPEG without a data: prefix.

Run locally:   cd backend && uvicorn app:app --port 8080
"""
from __future__ import annotations

import io
import os
from pathlib import Path

import asyncio
import base64
import binascii

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

HERE = Path(__file__).resolve().parent


def _load_dotenv(path: Path) -> None:
    """Read KEY=value lines from backend/.env for local runs; real env vars win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        k, sep, v = line.strip().partition("=")
        if sep and k and not k.startswith("#"):
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv(HERE / ".env")

import ai  # noqa: E402  (reads env vars, so it comes after the .env loader)
from detector import YoloDetector  # noqa: E402
from reader import read_text, scan_codes  # noqa: E402
# 320-pixel input: ~4x less work than 640, fast enough on a small shared CPU.
# Set MODEL_PATH=models/yolo11n.onnx for the 640 version on a bigger plan.
MODEL_PATH = Path(os.getenv("MODEL_PATH", HERE / "models" / "yolo11n-320.onnx"))
PUBLIC_DIR = Path(os.getenv("PUBLIC_DIR", HERE.parent / "public"))
MAX_BYTES = 3 * 1024 * 1024
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
THREADS = int(os.getenv("ORT_THREADS", "0")) or None

detector = YoloDetector(MODEL_PATH, threads=THREADS)
app = FastAPI(title="EYEDENTIFY ONE API", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=(self)"
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "model": detector.model_name, "classes": len(detector.names), "input_size": detector.size,
            "ai": {"enabled": ai.enabled(), "provider": "gemini", "model": ai.models()[0] if ai.enabled() else None}}


async def _image_from(request: Request, max_bytes: int = MAX_BYTES) -> Image.Image:
    body = await request.body()
    if not body:
        raise HTTPException(400, "Send an image as the request body (image/jpeg).")
    if len(body) > max_bytes:
        raise HTTPException(413, f"Image too large. Send one under {max_bytes // (1024 * 1024)} MB.")
    try:
        img = Image.open(io.BytesIO(body))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "The request body is not a readable image.")
    return img


def _no_store(result: dict) -> JSONResponse:
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


@app.post("/api/detect")
async def detect(request: Request, conf: float = 0.35):
    img = await _image_from(request)
    conf = min(max(conf, 0.05), 0.95)
    return _no_store(await run_in_threadpool(detector.detect, img, conf))


@app.post("/api/read")
async def read(request: Request):
    img = await _image_from(request, max_bytes=8 * 1024 * 1024)  # uploaded photos can be big
    return _no_store(await run_in_threadpool(read_text, img, THREADS))


@app.post("/api/scan")
async def scan(request: Request):
    img = await _image_from(request, max_bytes=8 * 1024 * 1024)
    return _no_store(await run_in_threadpool(scan_codes, img))


# ---------------------------------------------------------------- AI (Gemini)

class ImageBody(BaseModel):
    image: str = Field(..., description="base64 JPEG, no data: prefix")


class AskBody(ImageBody):
    question: str = ""


class TranslateBody(BaseModel):
    text: str
    target: str = "Hindi"


def _b64(data: str) -> str:
    data = data.split(",", 1)[-1] if data.startswith("data:") else data
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(413, "Image too large. Send one under about 4 MB.")
    try:
        base64.b64decode(data[:64] + "=" * (-len(data[:64]) % 4), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "The image must be base64-encoded.")
    return data


async def _ai(fn, *args):
    try:
        return _no_store(await run_in_threadpool(fn, *args))
    except ai.AIError as e:
        raise HTTPException(e.status, str(e))


@app.post("/api/ai/ask")
async def ai_ask(body: AskBody):
    image = _b64(body.image)
    if not ai.enabled():  # scripted demo answer so the page still works without a key
        return _no_store({"answer": ai.demo_answer(body.question), "source": "demo", "model": None, "ms": 0})
    return await _ai(ai.ask, image, body.question)


READ_AI_HEAD_START = 3.0   # seconds Gemini gets before on-server OCR starts as a backup
READ_AI_PATIENCE = 7.0     # seconds we wait for Gemini before answering with the OCR result


@app.post("/api/ai/read")
async def ai_read(body: ImageBody):
    """Read text with Gemini; if it's slow or busy, answer with on-server OCR instead."""
    image = _b64(body.image)
    img = Image.open(io.BytesIO(base64.b64decode(image)))
    img.load()
    loop_start = asyncio.get_running_loop().time()

    def elapsed() -> float:
        return asyncio.get_running_loop().time() - loop_start

    ai_task = asyncio.create_task(run_in_threadpool(ai.read, image)) if ai.enabled() else None
    ocr_task = None
    if ai_task:
        done, _ = await asyncio.wait({ai_task}, timeout=READ_AI_HEAD_START)
        if ai_task in done and not ai_task.exception():
            return _no_store(ai_task.result())
    ocr_task = asyncio.create_task(run_in_threadpool(read_text, img, THREADS))
    if ai_task and not ai_task.done():
        await asyncio.wait({ai_task}, timeout=max(0.0, READ_AI_PATIENCE - elapsed()))
        if ai_task.done() and not ai_task.exception():
            return _no_store(ai_task.result())
    result = await ocr_task
    return _no_store({**result, "source": "ocr"})


@app.post("/api/ai/translate")
async def ai_translate(body: TranslateBody):
    return await _ai(ai.translate, body.text, body.target[:40])


@app.post("/api/ai/banknote")
async def ai_banknote(body: ImageBody):
    return await _ai(ai.banknotes, _b64(body.image))


# The dashboard itself, served last so /api routes take priority.
if PUBLIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="dashboard")
