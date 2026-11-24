"""Text reading (OCR) and QR / barcode scanning for the cloud backend.

- OCR: RapidOCR (PaddleOCR PP-OCR models on ONNX Runtime). Loaded lazily on first use so
  the server starts fast and stays small until someone actually reads text.
- Codes: zxing-cpp, which reads QR codes (UPI, Bharat QR, links) and retail barcodes.
"""
from __future__ import annotations

import re
import threading
import time

import numpy as np
from PIL import Image, ImageOps

_ocr = None
_ocr_lock = threading.Lock()


def _engine(threads: int | None):
    global _ocr
    with _ocr_lock:
        if _ocr is None:
            from rapidocr_onnxruntime import RapidOCR  # heavy import, done once

            kwargs = {"det_limit_side_len": 960, "det_limit_type": "max"}
            if threads:
                kwargs.update(intra_op_num_threads=threads, inter_op_num_threads=1)
            _ocr = RapidOCR(**kwargs)
    return _ocr


# The recogniser sometimes drops the space between words ("Open8AM", "Rs40").
_SPACE_FIXES = [
    (re.compile(r"(?<=[a-z])(?=[A-Z])"), " "),   # freshBread -> fresh Bread
    (re.compile(r"(?<=[A-Za-z]{2})(?=\d)"), " "),  # Rs40 -> Rs 40, Open8AM -> Open 8AM
]


def _tidy(text: str) -> str:
    for pattern, repl in _SPACE_FIXES:
        text = pattern.sub(repl, text)
    return re.sub(r"\s{2,}", " ", text).strip()


def _prepare(img: Image.Image, max_side: int = 1280) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((max_side, max_side))
    return img


def read_text(img: Image.Image, threads: int | None = None, min_conf: float = 0.5) -> dict:
    img = _prepare(img)
    w, h = img.size
    t0 = time.perf_counter()
    result, _ = _engine(threads)(np.asarray(img)[:, :, ::-1])  # RGB -> BGR
    lines = []
    for box, text, conf in result or []:
        if float(conf) < min_conf or not text.strip():
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        lines.append({
            "text": _tidy(text),
            "confidence": round(float(conf), 3),
            "box": [round(min(xs) / w, 4), round(min(ys) / h, 4),
                    round((max(xs) - min(xs)) / w, 4), round((max(ys) - min(ys)) / h, 4)],
        })
    # Reading order: top to bottom, then left to right within a row.
    lines.sort(key=lambda l: (round((l["box"][1] + l["box"][3] / 2) * 20), l["box"][0]))
    return {
        "text": "\n".join(l["text"] for l in lines),
        "lines": lines,
        "width": w,
        "height": h,
        "ms": round((time.perf_counter() - t0) * 1000, 1),
        "engine": "rapidocr",
    }


def scan_codes(img: Image.Image) -> dict:
    import zxingcpp

    img = _prepare(img, max_side=1600)
    w, h = img.size
    t0 = time.perf_counter()
    codes = []
    for r in zxingcpp.read_barcodes(np.asarray(img.convert("L"))):
        p = r.position
        xs = [p.top_left.x, p.top_right.x, p.bottom_left.x, p.bottom_right.x]
        ys = [p.top_left.y, p.top_right.y, p.bottom_left.y, p.bottom_right.y]
        codes.append({
            "format": str(r.format).split(".")[-1],
            "text": r.text,
            "box": [round(min(xs) / w, 4), round(min(ys) / h, 4),
                    round((max(xs) - min(xs)) / w, 4), round((max(ys) - min(ys)) / h, 4)],
        })
    return {"codes": codes, "width": w, "height": h, "ms": round((time.perf_counter() - t0) * 1000, 1)}
