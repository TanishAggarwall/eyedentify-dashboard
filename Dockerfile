# EYEDENTIFY ONE — cloud backend + dashboard, for Northflank (or any container host).
# One container serves the dashboard and the YOLO11n detection API on $PORT (default 8080).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080 \
    ORT_THREADS=1

WORKDIR /app

COPY backend/requirements.txt backend/requirements-nodeps.txt backend/
RUN pip install -r backend/requirements.txt \
 && pip install --no-deps -r backend/requirements-nodeps.txt \
 && python -c "import cv2, zxingcpp; from rapidocr_onnxruntime import RapidOCR"

COPY backend backend
COPY public public

RUN useradd --create-home appuser
USER appuser

WORKDIR /app/backend
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
