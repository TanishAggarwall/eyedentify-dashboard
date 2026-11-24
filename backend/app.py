"""EYEDENTIFY ONE cloud backend.

Serves the dashboard (public/) and the detection API from one HTTPS origin:
  GET  /api/health   model and server status
  POST /api/detect   body: a JPEG/PNG/WebP camera frame -> YOLO detections (normalised boxes)
  POST /api/read     body: an image -> recognised text, line by line (OCR)
  POST /api/scan     body: an image -> QR codes and barcodes found in it

Run locally:   cd backend && uvicorn app:app --port 8080
"""
from __future__ import annotations

import io
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from detector import YoloDetector
from reader import read_text, scan_codes

HERE = Path(__file__).resolve().parent
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
    return {"status": "ok", "model": detector.model_name, "classes": len(detector.names), "input_size": detector.size}


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


# The dashboard itself, served last so /api routes take priority.
if PUBLIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="dashboard")
