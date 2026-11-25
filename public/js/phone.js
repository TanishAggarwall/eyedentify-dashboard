// Phone side of "use my phone as the camera": streams this phone's camera to the laptop dashboard.
// Tries a direct WebRTC video link first; if that can't connect, posts JPEG frames through the server.
import { apiUrl } from './api.js';
import { ICE_SERVERS, DIRECT_TIMEOUT_MS, waitForIce, sleep } from './rtc.js';

const $ = (s) => document.querySelector(s);
const RELAY_MAX_SIDE = 640;
const RELAY_QUALITY = 0.7;
const RELAY_MIN_GAP_MS = 90; // at most ~11 frames a second

let code = new URLSearchParams(location.search).get('c')?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
let stream = null;
let pc = null;
let mode = '';          // '' | 'connecting' | 'webrtc' | 'relay'
let running = false;
let facing = 'environment';
let wakeLock = null;
let frames = 0;

function pill(text, state = '') {
  $('#pill').className = `pill ${state}`;
  $('#pill-text').textContent = text;
}
function status(text) { $('#status').textContent = text; }

async function post(path, body, json = true) {
  const res = await fetch(apiUrl(path), {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': json ? 'application/json' : 'image/jpeg' },
    body: json ? JSON.stringify(body) : body,
  });
  if (res.status === 404) throw Object.assign(new Error('gone'), { gone: true });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res;
}

function ended(message) {
  stopAll();
  pill('Disconnected', 'bad');
  status(message);
}

async function openCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
  });
  const v = $('#preview');
  v.srcObject = stream;
  await v.play().catch(() => {});
  $('#empty').hidden = true;
  return stream;
}

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported or denied */ }
}

/* ------------------------------------------------------------------ Direct (WebRTC) */
async function startDirect() {
  mode = 'connecting';
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const track = stream.getVideoTracks()[0];
  const sender = pc.addTrack(track, stream);
  try {
    const params = sender.getParameters();
    params.encodings = [{ ...(params.encodings?.[0] || {}), maxBitrate: 1_500_000 }];
    await sender.setParameters(params);
  } catch { /* not supported everywhere */ }

  const thisPc = pc;
  pc.onconnectionstatechange = () => {
    if (thisPc !== pc || !running) return;
    const s = pc.connectionState;
    if (s === 'connected') {
      mode = 'webrtc';
      pill('Live · direct', 'ok');
      status('Streaming directly to the laptop. Keep this screen open.');
    } else if (s === 'failed' && mode !== 'relay') {
      startRelay();
    } else if (s === 'disconnected' && mode === 'webrtc') {
      pill('Reconnecting…', 'warn');
    }
  };

  await pc.setLocalDescription(await pc.createOffer());
  await waitForIce(pc);
  await post(`/api/remote/${code}/offer`, pc.localDescription);
  pill('Connecting…', 'warn');
  status('Waiting for the laptop to answer…');

  const t0 = performance.now();
  while (running && thisPc === pc) {
    const r = await fetch(apiUrl(`/api/remote/${code}/answer`), { cache: 'no-store' });
    if (r.status === 404) return ended('The laptop closed the pairing. Make a new code on the laptop and scan it again.');
    if (r.status === 200) { await pc.setRemoteDescription(await r.json()); break; }
    if (performance.now() - t0 > 20000) return startRelay();
    await sleep(800);
  }
  setTimeout(() => { if (running && thisPc === pc && pc.connectionState !== 'connected' && mode !== 'relay') startRelay(); }, DIRECT_TIMEOUT_MS);
}

/* ------------------------------------------------------------------ Fallback: frame relay */
async function startRelay() {
  if (mode === 'relay' || !running) return;
  mode = 'relay';
  pc?.close();
  pc = null;
  pill('Live · relay', 'ok');
  status('Direct video was blocked on this network, so frames go through the server. A little slower, still works.');
  const video = $('#preview');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  while (running && mode === 'relay') {
    const t0 = performance.now();
    if (video.videoWidth) {
      const scale = Math.min(1, RELAY_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', RELAY_QUALITY));
      try {
        await post(`/api/remote/${code}/frame`, blob, false);
        frames += 1;
      } catch (err) {
        if (err.gone) return ended('The laptop closed the pairing. Make a new code on the laptop and scan it again.');
        await sleep(600);
      }
    }
    await sleep(Math.max(0, RELAY_MIN_GAP_MS - (performance.now() - t0)));
  }
}

/* ------------------------------------------------------------------ Heartbeat */
async function heartbeat() {
  while (running) {
    await sleep(3000);
    if (!running) return;
    if (mode === 'webrtc') {
      try { await post(`/api/remote/${code}/ping`, { transport: 'webrtc' }); } catch (err) {
        if (err.gone) return ended('The laptop closed the pairing. Make a new code on the laptop and scan it again.');
      }
    }
    if (mode === 'relay') $('#stats').textContent = `${frames} frames sent through the server.`;
  }
}

/* ------------------------------------------------------------------ Controls */
async function start() {
  if (running) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status('The camera needs the https:// address of the dashboard. Open the link from the QR code.');
    return;
  }
  $('#start-btn').disabled = true;
  try {
    await openCamera();
  } catch (err) {
    $('#start-btn').disabled = false;
    status(err.name === 'NotAllowedError'
      ? 'Camera permission was blocked. Allow camera access for this site in the browser settings, then tap Start again.'
      : `The camera couldn't start (${err.name || err.message}).`);
    return;
  }
  running = true;
  frames = 0;
  keepAwake();
  $('#start-btn').hidden = true;
  $('#stop-btn').hidden = false;
  $('#flip-btn').hidden = false;
  $('#title').hidden = false;
  heartbeat();
  try {
    await startDirect();
  } catch (err) {
    if (err.gone) ended('That pairing code has expired. Make a new one on the laptop.');
    else startRelay();
  }
}

function stopAll() {
  running = false;
  mode = '';
  pc?.close();
  pc = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  $('#preview').srcObject = null;
  $('#empty').hidden = false;
  $('#start-btn').hidden = false;
  $('#start-btn').disabled = false;
  $('#stop-btn').hidden = true;
  $('#flip-btn').hidden = true;
  $('#title').hidden = true;
}

async function flip() {
  facing = facing === 'environment' ? 'user' : 'environment';
  try {
    await openCamera();
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
    await sender?.replaceTrack(stream.getVideoTracks()[0]);
  } catch (err) {
    status(`Couldn't switch camera (${err.name || err.message}).`);
  }
}

function showCode() {
  $('#code-form').hidden = true;
  $('#cam-section').hidden = false;
  $('#controls').hidden = false;
  pill(`Code ${code}`, '');
  status('Tap Start streaming to send this camera to the laptop.');
}

$('#code-form').addEventListener('submit', (e) => {
  e.preventDefault();
  code = $('#code-input').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length >= 6) showCode();
});
$('#start-btn').addEventListener('click', start);
$('#stop-btn').addEventListener('click', () => { stopAll(); pill('Stopped', ''); status('Stopped. Tap Start streaming to send the camera again.'); });
$('#flip-btn').addEventListener('click', flip);
document.addEventListener('visibilitychange', () => { if (!document.hidden && running) keepAwake(); });

if (code) showCode();
else { $('#code-form').hidden = false; $('#code-input').focus(); }
