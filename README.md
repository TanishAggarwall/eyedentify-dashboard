# EYEDENTIFY ONE dashboard

Companion dashboard for Team Percevia's EYEDENTIFY ONE smart glasses. The glasses hardware is offline, so the phone's camera and speaker stand in for it, and a cloud backend runs the AI. See `PLAN.md` for the feature plan and `DEPLOY.md` for Northflank deployment.

## Run locally

```text
python -m venv .venv
.venv\Scripts\pip install -r backend/requirements.txt
.venv\Scripts\pip install --no-deps -r backend/requirements-nodeps.txt
.venv\Scripts\python -m uvicorn app:app --app-dir backend --port 8080
```

Put `GEMINI_API_KEY=...` in `backend/.env` (git-ignored) to enable the AI features locally. Open http://localhost:8080 in Chrome. The same server serves the dashboard and the API. Localhost counts as a secure context, so the laptop webcam works there; a phone needs the HTTPS (Northflank) address.

## Structure

- `backend/app.py` — FastAPI: `/api/health`, `/api/detect`, `/api/read`, `/api/scan`, and serves `public/`
- `backend/detector.py` — pre-trained YOLO11n (COCO, 80 classes) via ONNX Runtime: letterbox, inference, NMS
- `backend/ai.py` — Google Gemini (REST): Talk AI, AI reading, translation, banknotes; hedged requests across models, scripted demo answers without a key
- `backend/reader.py` — text reading (RapidOCR, PP-OCR models on ONNX Runtime) and QR / barcode scanning (zxing-cpp)
- `backend/models/yolo11n-320.onnx` — the exported Ultralytics YOLO11n model used by default (`yolo11n.onnx` is the 640 px version)
- `Dockerfile` — container for Northflank
- `public/index.html` — all pages (Overview, five modes, Device, History)
- `public/styles.css` — dark theme; large-text and high-contrast variants
- `public/js/app.js` — navigation, modes, camera button, device status, settings, history
- `public/js/detection.js` — Mode 1: sends frames to the cloud YOLO, distance and direction estimates, spoken / panned / vibration alerts, demo hazard scenes
- `public/js/reading.js` — Mode 2: capture or upload, cloud OCR, read aloud at 1.0–3.5×
- `public/js/payment.js` — Mode 3: QR / UPI scanner that explains payee, app and amount aloud; change calculator
- `public/js/talk.js` — Mode 5: ask by voice (speech recognition) or text about the current camera frame
- `public/js/api.js` — API base URL, image upload helpers, box drawing
- `public/js/modes.js`, `store.js`, `speech.js`, `camera.js` — modes, saved data, speech and beeps, camera

## Keyboard (temple controls)

Space: next mode · 1–5: jump to a mode · R: repeat · Esc: stop speaking · C: camera on/off
