// Talking to the cloud backend, plus helpers for turning camera frames and photos into uploads.
// By default the dashboard is served by the backend itself (Northflank), so API calls go to the
// same origin. To host the page elsewhere, set
// <meta name="eyedentify-api" content="https://your-service.code.run"> in index.html.
import * as camera from './camera.js';

const configured = document.querySelector('meta[name="eyedentify-api"]')?.content?.trim() ?? '';
export const API_BASE = configured.replace(/\/+$/, '');
export const apiUrl = (path) => `${API_BASE}${path}`;

/** POST an image to the backend and return the JSON reply (with round-trip time `rtt`). */
export async function postImage(path, blob, { timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const t0 = performance.now();
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' }, signal: ctrl.signal, cache: 'no-store',
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).detail || detail; } catch { /* not JSON */ }
      throw new Error(detail);
    }
    return { ...(await res.json()), rtt: performance.now() - t0 };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The cloud server took too long to answer.');
    if (err instanceof TypeError) throw new Error('Couldn\'t reach the cloud server. Check the internet connection.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** POST JSON to the backend and return the JSON reply (with round-trip time `rtt`). */
export async function postJSON(path, body, { timeout = 30000 } = {}) {
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  return postImage(path, blob, { timeout });
}

/** Base64 (no data: prefix) of a JPEG blob, for the JSON AI endpoints. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',', 2)[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Server health, fetched once and shared (includes whether the AI is configured). */
let healthPromise = null;
export function getHealth({ refresh = false } = {}) {
  if (!healthPromise || refresh) {
    healthPromise = fetch(apiUrl('/api/health'), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return healthPromise;
}

const toBlob = (canvas, quality = 0.85) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** The current camera frame as a JPEG blob, plus a data URL of it for showing a still. */
export async function frameBlob(video, maxSide = 1280, quality = 0.85) {
  const canvas = camera.grabFrame(video, maxSide);
  if (!canvas) return null;
  return { blob: await toBlob(canvas, quality), canvas };
}

/** A user-picked photo, downscaled so uploads stay quick on mobile data. */
export async function fileBlob(file, maxSide = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { blob: await toBlob(canvas, quality), canvas };
}

/** Start the camera if needed and wait until the <video> has real frames. */
export async function ensureCamera(video, timeoutMs = 6000) {
  if (!camera.isLive()) await camera.start();
  const t0 = performance.now();
  while (!(video.readyState >= 2 && video.videoWidth)) {
    if (performance.now() - t0 > timeoutMs) throw new Error('The camera didn\'t start in time. Try again.');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Draw normalised boxes ([x, y, w, h] in 0–1) over an element that shows media of size mw × mh.
 * `fit` matches the element's CSS object-fit ('cover' for live video, 'contain' for stills).
 */
export function drawBoxes(canvas, boxes, mw, mh, { fit = 'cover', color = '#c3a6ff', labels = [] } = {}) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!mw || !mh) return;
  const scale = fit === 'cover' ? Math.max(rect.width / mw, rect.height / mh) : Math.min(rect.width / mw, rect.height / mh);
  const ox = (rect.width - mw * scale) / 2;
  const oy = (rect.height - mh * scale) / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.font = '600 12px "DM Sans", sans-serif';
  boxes.forEach((b, i) => {
    const x = b[0] * mw * scale + ox, y = b[1] * mh * scale + oy, w = b[2] * mw * scale, h = b[3] * mh * scale;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
    ctx.stroke();
    if (labels[i]) {
      const tw = ctx.measureText(labels[i]).width + 12;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - 20), tw, 20);
      ctx.fillStyle = '#0d0c11';
      ctx.fillText(labels[i], x + 6, Math.max(14, y - 6));
    }
  });
}

export function clearCanvas(canvas) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}
