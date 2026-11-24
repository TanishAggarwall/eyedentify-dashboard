// Mode 1 — Real-time detection.
// Sends camera frames to the EYEDENTIFY cloud backend, which runs a pre-trained YOLO11n
// model (COCO classes). The page estimates distance from box height and gives spoken,
// panned and haptic alerts.
import { getSettings, updateSettings, logEvent, getEvents, subscribe } from './store.js';
import { speak, vibrate, cue, unlockAudio } from './speech.js';
import * as camera from './camera.js';
import { apiUrl } from './api.js';

const FRAME_GAP_MS = 120;         // at most ~8 frames a second; one request in flight at a time
const FRAME_SIDE = 640;           // YOLO input size; frames are downscaled before upload
const JPEG_QUALITY = 0.7;
const REQUEST_TIMEOUT_MS = 5000;
const MIN_SCORE = 0.4;

// Typical real-world heights (metres) used for the distance estimate.
const HEIGHT = {
  person: 1.7, bicycle: 1.0, car: 1.5, motorcycle: 1.1, bus: 3.0, truck: 3.0, train: 3.8,
  'traffic light': 0.9, 'fire hydrant': 0.8, 'stop sign': 0.75, 'parking meter': 1.2, bench: 0.85,
  dog: 0.55, cat: 0.3, horse: 1.6, cow: 1.4, backpack: 0.45, umbrella: 0.9, handbag: 0.3, suitcase: 0.65,
  chair: 0.9, couch: 0.85, 'potted plant': 0.6, bed: 0.6, 'dining table': 0.75, toilet: 0.75, tv: 0.6,
  laptop: 0.25, refrigerator: 1.7, bottle: 0.25, cup: 0.1, 'cell phone': 0.15, book: 0.22, 'sports ball': 0.22,
};
// Things worth warning about when walking.
const OBSTACLES = new Set(['person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck', 'train', 'fire hydrant', 'stop sign',
  'parking meter', 'bench', 'dog', 'cat', 'horse', 'cow', 'suitcase', 'chair', 'couch', 'potted plant', 'bed',
  'dining table', 'toilet', 'refrigerator']);
const VEHICLES = new Set(['bicycle', 'car', 'motorcycle', 'bus', 'truck', 'train']);
const NAMES = { 'cell phone': 'phone', 'dining table': 'table', 'potted plant': 'plant', tv: 'screen', 'sports ball': 'ball' };
const friendly = (c) => NAMES[c] ?? c;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const DEMOS = [
  { id: 'stairs', title: 'Stairs going down', note: 'Depth drop ahead', text: 'Stairs going down, 3 metres ahead. Handrail on your right.', pan: 0, level: 'high' },
  { id: 'curb', title: 'Curb drop-off', note: 'Kerb edge, slightly left', text: 'Curb drop-off, 1 metre ahead, slightly left.', pan: -0.4, level: 'high' },
  { id: 'branch', title: 'Overhead branch', note: 'Obstacle at head height', text: 'Low branch at head height, 2 metres ahead. Duck slightly.', pan: 0.1, level: 'mid' },
  { id: 'barrier', title: 'Construction barrier', note: 'Path blocked, clear on the right', text: 'Construction barrier, 4 metres ahead. The path is clear on your right.', pan: 0, level: 'mid' },
  { id: 'platform', title: 'Platform edge', note: 'Metro platform, right side', text: 'Platform edge, 1 metre to your right. Step left.', pan: 0.9, level: 'high' },
  { id: 'vehicle', title: 'Fast vehicle', note: 'Approaching from the left', text: 'Vehicle approaching fast from your left. Stop and wait.', pan: -1, level: 'high' },
];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

let modelName = '';
let wanted = false;       // user asked for detection to run
let running = false;      // loop currently active
let inFlight = false;
let loopTimer = 0;
let failures = 0;
let lastAlertAt = 0;
const cooldown = new Map();
const timings = [];
let latencyTick = 0;
let alertCount = 0;
let bannerTimer = 0;
let objects = [];

/* ------------------------------------------------------------------ Model */
function setModelStatus(text, state) {
  $('#det-model').innerHTML = `${icon('i-chip')}${esc(text)}`;
  window.dispatchEvent(new CustomEvent('eyedentify:vision', { detail: { state, text } }));
}
/** Ask the cloud backend which model it runs (also wakes a sleeping server). */
async function connectModel() {
  setModelStatus('Connecting to cloud detector…', 'loading');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(apiUrl('/api/health'), { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    modelName = (info.model || 'yolo').toUpperCase();
    setModelStatus(`Cloud ${modelName} ready`, 'ready');
    return info;
  } catch (err) {
    setModelStatus('Cloud detector unreachable', 'error');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Downscale the current frame, upload it, and return YOLO detections. */
async function detectFrame(video) {
  const frame = camera.grabFrame(video, FRAME_SIDE);
  if (!frame) return null;
  const blob = await new Promise((resolve) => frame.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const res = await fetch(apiUrl(`/api/detect?conf=${MIN_SCORE}`), {
      method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' }, signal: ctrl.signal, cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ...data, rtt: performance.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ Geometry */
function isMirrored() {
  const info = camera.getInfo();
  if (info.facing === 'environment') return false;
  if (info.facing === 'user') return true;
  return !/back|rear|environment/i.test(info.label); // laptop webcams face the user
}
function describe(det, vw, vh, mirrored) {
  const name = det.label;
  const [nx, ny, nw, nh] = det.box;   // normalised by the backend
  const b = { originX: nx * vw, originY: ny * vh, width: nw * vw, height: nh * vh };
  const cat = { score: det.score };
  let cx = (b.originX + b.width / 2) / vw;
  if (mirrored) cx = 1 - cx;
  const hFrac = b.height / vh;
  const vfov = (vh > vw ? 63 : 43) * Math.PI / 180;
  const real = HEIGHT[name] ?? 0.5;
  let dist = real / (2 * Math.tan(vfov / 2) * Math.max(hFrac, 0.01));
  const touchesTop = b.originY < vh * 0.02;
  const touchesBottom = b.originY + b.height > vh * 0.98;
  if (touchesTop && touchesBottom) dist = Math.min(dist, 1);   // fills the frame: very close
  dist = Math.max(0.3, Math.min(dist, 15));
  const band = dist <= 1.2 ? 'very-close' : dist <= 2.5 ? 'close' : dist <= 5 ? 'near' : 'far';
  const dir = cx < 0.2 ? 'to your left' : cx < 0.4 ? 'slightly left' : cx <= 0.6 ? 'ahead' : cx <= 0.8 ? 'slightly right' : 'to your right';
  return { name, label: friendly(name), score: cat.score, box: b, cx, dist, band, dir, pan: (cx - 0.5) * 2, obstacle: OBSTACLES.has(name) };
}
const metres = (d) => (d < 1 ? 'under 1 metre' : `about ${Math.round(d)} metre${Math.round(d) === 1 ? '' : 's'}`);
const shortDist = (d) => (d < 1 ? '<1 m' : `≈${d < 3 ? d.toFixed(1) : Math.round(d)} m`);

/* ------------------------------------------------------------------ Drawing */
function draw(list, vw, vh, mirrored) {
  const canvas = $('#det-canvas');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  // Map video pixels to the element, matching object-fit: cover.
  const scale = Math.max(rect.width / vw, rect.height / vh);
  const ox = (rect.width - vw * scale) / 2;
  const oy = (rect.height - vh * scale) / 2;
  const range = getSettings().detectRange;
  ctx.font = '600 12px "DM Sans", sans-serif';
  for (const o of list) {
    let x = o.box.originX * scale + ox;
    const y = o.box.originY * scale + oy;
    const w = o.box.width * scale;
    const h = o.box.height * scale;
    if (mirrored) x = rect.width - x - w;
    const warn = o.obstacle && o.dist <= range;
    const color = warn ? (o.band === 'very-close' || o.band === 'close' ? '#f87171' : '#fbbf24') : '#c3a6ff';
    ctx.strokeStyle = color;
    ctx.lineWidth = warn ? 3 : 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h);
    ctx.stroke();
    const tag = `${cap(o.label)} · ${shortDist(o.dist)}`;
    const tw = ctx.measureText(tag).width + 14;
    const ty = Math.max(0, y - 24);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, ty, tw, 22, 11) : ctx.rect(x, ty, tw, 22);
    ctx.fill();
    ctx.fillStyle = '#0d0c11';
    ctx.fillText(tag, x + 7, ty + 15);
  }
}
function clearCanvas() {
  const c = $('#det-canvas');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

/* ------------------------------------------------------------------ Alerts */
function showBanner(text, level = 'mid', tag = 'LIVE') {
  const el = $('#det-banner');
  el.className = `det-banner ${level === 'high' ? 'high' : ''}`;
  el.innerHTML = `${icon('i-alert')}<span>${esc(text)}</span><small>${esc(tag)}</small>`;
  el.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.hidden = true; }, 3500);
}
function alertFor(o) {
  const now = performance.now();
  // Repeat an alert for the same kind of object on the same side only if it has come
  // closer, or after a while; a still scene shouldn't be announced over and over.
  const BAND_RANK = { far: 0, near: 1, close: 2, 'very-close': 3 };
  const key = `${o.name}|${o.dir}`;
  const prev = cooldown.get(key);
  const closer = prev && BAND_RANK[o.band] > BAND_RANK[prev.band];
  const wait = o.band === 'very-close' ? 4000 : 15000;
  if (prev && !closer && now - prev.t < wait) return;
  if (now - lastAlertAt < 2200) return;
  cooldown.set(key, { t: now, band: o.band });
  lastAlertAt = now;
  const level = o.band === 'very-close' ? 'high' : o.band === 'close' ? 'mid' : 'low';
  const moving = VEHICLES.has(o.name) ? ' Careful.' : '';
  const text = `${cap(o.label)} ${o.dir}, ${metres(o.dist)}.${moving}`;
  if (getSettings().detectBeep) cue(o.pan, level);
  if (level === 'high') vibrate([180, 80, 180]); else if (level === 'mid') vibrate([90]);
  speak(text, { interrupt: level === 'high' });
  showBanner(text, level);
  alertCount++;
  $('#det-alerts').textContent = alertCount;
  logEvent({ mode: 'detection', kind: 'alert', source: 'live', text: text.replace(/\.$/, ''), detail: `confidence ${Math.round(o.score * 100)}%` });
}

/* ------------------------------------------------------------------ Ahead list */
const DIR_ICON = { 'to your left': 'rotate(-90deg)', 'slightly left': 'rotate(-45deg)', ahead: 'none', 'slightly right': 'rotate(45deg)', 'to your right': 'rotate(90deg)' };
function renderList() {
  const el = $('#det-list');
  if (!objects.length) {
    el.innerHTML = `<li class="empty">${running ? 'Nothing in view right now.' : 'Nothing detected yet.'}</li>`;
    return;
  }
  el.innerHTML = objects.slice(0, 6).map((o) => `
    <li class="band-${o.band}">
      <span class="dir" title="${esc(o.dir)}"><svg class="icon" style="transform:${DIR_ICON[o.dir]}" aria-hidden="true"><use href="#i-arrow-up"/></svg></span>
      <span><strong>${esc(cap(o.label))}</strong><small>${esc(o.dir)} · ${Math.round(o.score * 100)}% sure</small></span>
      <span class="dist">${esc(shortDist(o.dist))}</span>
    </li>`).join('');
}

/* ------------------------------------------------------------------ Loop */
const serverTimes = [];
async function frame() {
  if (!running || inFlight) return;
  const video = $('#det-video');
  const vw = video.videoWidth, vh = video.videoHeight;
  if (video.readyState < 2 || !vw || !vh) { schedule(); return; }

  inFlight = true;
  const started = performance.now();
  let result = null;
  try {
    result = await detectFrame(video);
    failures = 0;
  } catch {
    failures++;
    if (failures === 3) {
      setModelStatus('Cloud detector unreachable · retrying', 'error');
      showBanner('Lost connection to the cloud detector. Retrying…', 'mid', 'NETWORK');
      speak('Detection connection lost. Retrying.');
    }
  }
  inFlight = false;
  if (!running) return;

  if (result) {
    if (failures === 0 && $('#det-model').textContent.includes('unreachable')) setModelStatus(`Cloud ${modelName} ready`, 'ready');
    const mirrored = isMirrored();
    objects = result.detections.map((d) => describe(d, vw, vh, mirrored)).sort((a, b) => a.dist - b.dist);
    draw(objects, vw, vh, mirrored);

    const range = getSettings().detectRange;
    const target = objects.find((o) => o.obstacle && o.dist <= range);
    if (target) alertFor(target);

    const now = performance.now();
    timings.push(result.rtt);
    serverTimes.push(result.inference_ms);
    if (timings.length > 20) { timings.shift(); serverTimes.shift(); }
    if (now - latencyTick > 1000) {
      latencyTick = now;
      const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
      const server = Math.round(serverTimes.reduce((a, b) => a + b, 0) / serverTimes.length);
      $('#det-speed').textContent = `${avg} ms`;
      $('#det-speed').title = `Round trip ${avg} ms · YOLO on the server ${server} ms`;
      window.dispatchEvent(new CustomEvent('eyedentify:latency', { detail: { ms: avg, label: `cloud ${modelName} · model ${server} ms` } }));
    }
    $('#det-count').textContent = objects.length;
    renderList();
  }
  // Back off when the server is unreachable; otherwise keep a steady cadence.
  schedule(failures ? Math.min(5000, 500 * failures) : Math.max(0, FRAME_GAP_MS - (performance.now() - started)));
}
function schedule(delay = FRAME_GAP_MS) {
  clearTimeout(loopTimer);
  if (running) loopTimer = setTimeout(frame, delay);
}

function setRunningUI() {
  const btn = $('#det-start');
  btn.setAttribute('aria-pressed', String(wanted));
  btn.querySelector('span').textContent = wanted ? 'Pause detecting' : 'Start detecting';
  btn.querySelector('use').setAttribute('href', wanted ? '#i-stop' : '#i-radar');
  $('#det-dot').classList.toggle('on', running);
  const live = camera.isLive();
  $('#det-empty').hidden = live;
  $('#det-video').classList.toggle('mirrored', live && isMirrored());
}

async function startLoop() {
  if (running || !wanted) return;
  if (location.hash.slice(1) !== 'detection' || !camera.isLive()) return;
  if (!modelName) {
    try {
      await connectModel();
    } catch {
      $('#det-empty-text').textContent = 'Couldn\'t reach the cloud detector. Check the internet connection and try again.';
      $('#det-empty').hidden = false;
      wanted = false;
      setRunningUI();
      return;
    }
  }
  if (!wanted || running || location.hash.slice(1) !== 'detection' || !camera.isLive()) return;
  running = true;
  failures = 0;
  setRunningUI();
  frame();
}
function stopLoop() {
  running = false;
  clearTimeout(loopTimer);
  objects = [];
  clearCanvas();
  renderList();
  setRunningUI();
}

async function toggle() {
  unlockAudio();
  if (wanted) {
    wanted = false;
    stopLoop();
    speak('Detection paused.');
    return;
  }
  wanted = true;
  setRunningUI();
  if (!camera.isLive()) {
    try { await camera.start(); }
    catch (err) {
      wanted = false;
      setRunningUI();
      $('#det-empty-text').textContent = err.message;
      $('#det-empty').hidden = false;
      return;
    }
  }
  $('#det-empty-text').textContent = 'Connecting to the cloud detector…';
  speak('Detection on. I will warn you about obstacles ahead.');
  logEvent({ mode: 'detection', kind: 'info', source: 'system', text: 'Detection started.' });
  startLoop();
}

/* ------------------------------------------------------------------ Demo scenes */
function playDemo(id) {
  const d = DEMOS.find((x) => x.id === id);
  if (!d) return;
  unlockAudio();
  if (getSettings().detectBeep) cue(d.pan, d.level);
  vibrate(d.level === 'high' ? [180, 80, 180] : [90]);
  speak(d.text);
  showBanner(d.text, d.level, 'DEMO SCENE');
  logEvent({ mode: 'detection', kind: 'alert', source: 'demo', text: d.text.replace(/\.$/, '') });
}

/* ------------------------------------------------------------------ Log */
function renderLog() {
  const items = getEvents().filter((e) => e.mode === 'detection' && e.kind === 'alert').slice(0, 5);
  $('#det-log').innerHTML = items.length
    ? items.map((e) => `<li>
        <span class="feed-icon alert">${icon('i-alert')}</span>
        <div class="feed-text">${esc(e.text)}<div class="feed-meta"><span class="badge ${e.source}">${e.source === 'demo' ? 'Demo scene' : 'Live'}</span></div></div>
        <time>${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        ${icon('i-chevron', 'icon chev')}
      </li>`).join('')
    : '<li class="empty"><strong>No alerts yet</strong>Start detecting, or try a hazard scene.</li>';
}

/* ------------------------------------------------------------------ Init */
export function initDetection() {
  camera.attach($('#det-video'));
  $('#det-start').addEventListener('click', toggle);

  const s = getSettings();
  const range = $('#det-range');
  range.value = s.detectRange;
  $('#det-range-out').textContent = `${s.detectRange} m`;
  range.addEventListener('input', () => {
    $('#det-range-out').textContent = `${range.value} m`;
    updateSettings({ detectRange: Number(range.value) });
  });
  $('#det-beep').checked = s.detectBeep;
  $('#det-beep').addEventListener('change', (e) => { unlockAudio(); updateSettings({ detectBeep: e.target.checked }); });

  $('#det-demos').innerHTML = DEMOS.map((d) => `
    <button class="demo-btn ${d.level === 'high' ? 'high' : ''}" data-demo="${d.id}">
      ${icon('i-alert')}<strong>${esc(d.title)}</strong><span>${esc(d.note)}</span>
    </button>`).join('');
  $('#det-demos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-demo]');
    if (b) playDemo(b.dataset.demo);
  });

  camera.onCameraChange((live) => {
    if (live) startLoop(); else stopLoop();
    setRunningUI();
  });
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1) === 'detection') startLoop(); else if (running) stopLoop();
  });
  subscribe((what) => { if (what === 'events') renderLog(); });
  renderLog();
  renderList();
  setRunningUI();
}
