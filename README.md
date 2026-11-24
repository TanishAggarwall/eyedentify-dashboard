# EYEDENTIFY ONE dashboard

Companion dashboard for Team Percevia's EYEDENTIFY ONE smart glasses. The glasses hardware is offline, so the phone's camera and speaker stand in for it, and a cloud backend runs the AI. See `PLAN.md` for the feature plan and `DEPLOY.md` for Northflank deployment.

## Run locally

```text
pip install -r backend/requirements.txt
python -m uvicorn app:app --app-dir backend --port 8080
```

Open http://localhost:8080 in Chrome. The same server serves the dashboard and the API. Localhost counts as a secure context, so the laptop webcam works there; a phone needs the HTTPS (Northflank) address.

## Structure

- `backend/app.py` — FastAPI: `/api/health`, `/api/detect`, and serves `public/`
- `backend/detector.py` — pre-trained YOLO11n (COCO, 80 classes) via ONNX Runtime: letterbox, inference, NMS
- `backend/models/yolo11n.onnx` — the exported Ultralytics YOLO11n model
- `Dockerfile` — container for Northflank
- `public/index.html` — all pages (Overview, five modes, Device, History)
- `public/styles.css` — dark theme; large-text and high-contrast variants
- `public/js/app.js` — navigation, modes, camera button, device status, settings, history
- `public/js/detection.js` — Mode 1: sends frames to the cloud YOLO, distance and direction estimates, spoken / panned / vibration alerts, demo hazard scenes
- `public/js/api.js` — API base URL (same origin by default)
- `public/js/modes.js`, `store.js`, `speech.js`, `camera.js` — modes, saved data, speech and beeps, camera

## Keyboard (temple controls)

Space: next mode · 1–5: jump to a mode · R: repeat · Esc: stop speaking · C: camera on/off
