"""EYEDENTIFY ONE cloud backend.

Serves the dashboard (public/) and the detection API from one HTTPS origin:
  GET  /api/health   model and server status
  POST /api/detect   body: a JPEG/PNG/WebP camera frame -> YOLO detections (normalised boxes)

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

HERE = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("MODEL_PATH", HERE / "models" / "yolo11n.onnx"))
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


@app.post("/api/detect")
async def detect(request: Request, conf: float = 0.35):
    body = await request.body()
    if not body:
        raise HTTPException(400, "Send a camera frame as the request body (image/jpeg).")
    if len(body) > MAX_BYTES:
        raise HTTPException(413, "Frame too large. Send a JPEG under 3 MB.")
    try:
        img = Image.open(io.BytesIO(body))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "The frame is not a readable image.")
    conf = min(max(conf, 0.05), 0.95)
    result = await run_in_threadpool(detector.detect, img, conf)
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


# The dashboard itself, served last so /api routes take priority.
if PUBLIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="dashboard")
