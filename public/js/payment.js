// Mode 3 — Payment & currency.
// Scans QR codes and barcodes on the cloud backend, explains UPI payment codes aloud
// (who it pays, which app, how much), and works out change in Indian notes and coins.
// It never makes or approves a payment.
import { logEvent } from './store.js';
import { speak, vibrate, cue, unlockAudio } from './speech.js';
import * as camera from './camera.js';
import { postImage, postJSON, frameBlob, fileBlob, ensureCamera, drawBoxes, clearCanvas, blobToBase64, getHealth } from './api.js';
import { parseCode, rupees, breakdown } from './payment-logic.js';

export { parseCode, breakdown };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

const SCAN_GAP_MS = 400;

let scanning = false;
let starting = false;
let timer = 0;
let inFlight = false;
let lastCode = { text: '', at: 0 };
let lastSpoken = '';
let fails = 0;

/* ------------------------------------------------------------------ Understanding codes */
function render(info, raw) {
  $('#pay-kind').hidden = false;
  $('#pay-kind').className = `badge ${info.badge}`;
  $('#pay-kind').textContent = info.kind;
  $('#pay-status').textContent = `Scanned at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  $('#pay-details').innerHTML = `
    <strong class="pay-title">${esc(info.title)}</strong>
    <div class="pay-amount">${info.amount ? esc(info.amount.label) : '—'}<small>${info.amount ? 'amount in code' : info.kind === 'UPI payment' ? 'no amount set' : ''}</small></div>
    ${info.rows.map(([k, v]) => `<div class="pay-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
    ${info.warnings.map((w) => `<div class="pay-warn">${icon('i-alert')}<span>${esc(w)}</span></div>`).join('')}
    <p class="pay-raw">${esc(raw)}</p>`;
  $('#pay-repeat').disabled = false;
}

function announce(code, { fromUpload = false } = {}) {
  const info = parseCode(code);
  render(info, code.text);
  lastSpoken = info.spoken;
  cue(0, info.warnings.length ? 'high' : 'mid');
  vibrate(info.warnings.length ? [120, 80, 120] : [80]);
  speak(info.spoken, { force: true });
  logEvent({ mode: 'payment', kind: 'scan', source: 'live', text: info.log, detail: code.text });
  if (!fromUpload) lastCode = { text: code.text, at: Date.now() };
}

/* ------------------------------------------------------------------ Scanning */
async function scanOnce() {
  if (!scanning || inFlight) return;
  const video = $('#pay-video');
  inFlight = true;
  try {
    const shot = await frameBlob(video, 960, 0.8);
    if (shot) {
      const res = await postImage('/api/scan', shot.blob, { timeout: 8000 });
      fails = 0;
      $('#pay-meta').textContent = `Scanning · server ${Math.round(res.ms)} ms · round trip ${Math.round(res.rtt)} ms`;
      if (res.codes.length) {
        drawBoxes($('#pay-canvas'), res.codes.map((c) => c.box), video.videoWidth, video.videoHeight, { color: '#4ade80', labels: res.codes.map((c) => c.format) });
        const code = res.codes[0];
        const repeat = code.text === lastCode.text && Date.now() - lastCode.at < 8000;
        if (!repeat) announce(code);
        else lastCode.at = Date.now();
      } else {
        clearCanvas($('#pay-canvas'));
      }
    }
  } catch (err) {
    fails++;
    $('#pay-meta').textContent = err.message;
    if (fails === 3) speak('Scanner connection lost. Retrying.', { force: true });
  } finally {
    inFlight = false;
    if (scanning) timer = setTimeout(scanOnce, fails ? Math.min(4000, 600 * fails) : SCAN_GAP_MS);
  }
}

function setScanUI() {
  const btn = $('#pay-start');
  btn.setAttribute('aria-pressed', String(scanning));
  btn.querySelector('span').textContent = scanning ? 'Stop scanning' : 'Start scanning';
  $('#pay-frame').hidden = !scanning;
  $('#pay-dot').classList.toggle('on', scanning);
  $('#pay-empty').hidden = camera.isLive();
}

async function startScan() {
  if (starting) return;
  unlockAudio();
  starting = true;
  $('#pay-start').disabled = true;
  try {
    await ensureCamera($('#pay-video'));
  } catch (err) {
    $('#pay-empty-text').textContent = err.message;
    $('#pay-empty').hidden = false;
    return;
  } finally {
    starting = false;
    $('#pay-start').disabled = false;
  }
  scanning = true;
  fails = 0;
  setScanUI();
  speak('Scanning for QR codes. Hold the code inside the frame.', { force: true });
  scanOnce();
}
function stopScan() {
  scanning = false;
  clearTimeout(timer);
  clearCanvas($('#pay-canvas'));
  $('#pay-meta').textContent = '';
  setScanUI();
}

async function scanUpload(file) {
  unlockAudio();
  $('#pay-status').textContent = 'Checking the photo…';
  try {
    const shot = await fileBlob(file, 1600, 0.9);
    const res = await postImage('/api/scan', shot.blob, { timeout: 15000 });
    if (!res.codes.length) {
      // Clear the previous result so an old payee is never mistaken for this photo's.
      $('#pay-kind').hidden = true;
      $('#pay-details').innerHTML = '<p class="placeholder">No code found. Try a sharper photo with the whole QR code in view.</p>';
      $('#pay-repeat').disabled = true;
      lastSpoken = '';
      $('#pay-status').textContent = 'No QR code or barcode found in that photo.';
      speak('No QR code found in that photo.', { force: true });
      return;
    }
    announce(res.codes[0], { fromUpload: true });
  } catch (err) {
    $('#pay-status').textContent = err.message;
    speak('Scanning failed. ' + err.message, { force: true });
  }
}

/* ------------------------------------------------------------------ Change */
function workOutChange() {
  const bill = Number($('#change-bill').value);
  const given = Number($('#change-given').value);
  const out = $('#change-out');
  if (!(bill > 0) || !(given > 0)) {
    out.innerHTML = '<p class="placeholder">Enter the bill and the amount you gave.</p>';
    return;
  }
  if (given < bill) {
    const short = rupees(bill - given);
    out.innerHTML = `<div class="pay-amount">${esc(short.label)}<small>still to pay</small></div>`;
    speak(`You still need to pay ${short.spoken}.`, { force: true });
    return;
  }
  const change = given - bill;
  if (change === 0) {
    out.innerHTML = '<div class="pay-amount">₹0<small>exact amount, no change</small></div>';
    speak('Exact amount. No change is due.', { force: true });
    return;
  }
  const c = rupees(change);
  const parts = breakdown(change);
  const words = parts.map((p) => `${p.n === 1 ? 'one' : p.n} ${p.d}-rupee ${p.note ? 'note' : 'coin'}${p.n > 1 ? 's' : ''}`);
  out.innerHTML = `<div class="pay-amount">${esc(c.label)}<small>change due</small></div>
    <div class="coin-row">${parts.map((p) => `<span class="coin ${p.note ? 'note' : ''}">${p.n} × ₹${p.d}</span>`).join('')}</div>`;
  speak(`Change due: ${c.spoken}. For example, ${words.join(', ')}.`, { force: true });
  logEvent({ mode: 'payment', kind: 'info', source: 'live', text: `Change for ₹${bill} paid with ₹${given}: ${c.label}` });
}

/* ------------------------------------------------------------------ Banknotes (Gemini) */
async function checkBanknote() {
  const btn = $('#note-btn');
  const out = $('#note-out');
  unlockAudio();
  btn.disabled = true;
  btn.lastChild.textContent = 'Looking…';
  out.innerHTML = '';
  try {
    await ensureCamera($('#pay-video'));
    const shot = await frameBlob($('#pay-video'), 1024, 0.85);
    if (!shot) throw new Error('Couldn\'t capture a picture.');
    cue(0, 'low');
    const res = await postJSON('/api/ai/banknote', { image: await blobToBase64(shot.blob) });
    const notes = res.notes ?? [];
    let spoken;
    if (!notes.length) {
      spoken = `I can't see a banknote clearly. ${res.advice || 'Hold the note flat, about 20 centimetres from the camera, in good light.'}`;
      out.innerHTML = `<p class="placeholder">${esc(spoken)}</p>`;
    } else {
      const inr = notes.filter((n) => (n.currency || 'INR') === 'INR');
      const list = notes.map((n) => `${n.denomination} ${n.currency === 'INR' || !n.currency ? 'rupee' : n.currency}`);
      spoken = notes.length === 1
        ? `This is a ${list[0]} note.`
        : `I see ${notes.length} notes: ${list.join(', ')}.${inr.length === notes.length ? ` Total ${res.total} rupees.` : ''}`;
      if (res.confidence === 'low') spoken += ' I\'m not fully sure; hold it closer to check.';
      out.innerHTML = `<div class="pay-amount">₹${esc(res.total.toLocaleString('en-IN'))}<small>${notes.length} note${notes.length === 1 ? '' : 's'} · ${esc(res.confidence)} confidence</small></div>
        <div class="coin-row">${notes.map((n) => `<span class="coin note">${n.currency && n.currency !== 'INR' ? esc(n.currency) + ' ' : '₹'}${n.denomination}</span>`).join('')}</div>`;
      logEvent({ mode: 'payment', kind: 'scan', source: 'ai', text: `Banknote check: ${list.join(', ')}` });
    }
    vibrate(notes.length ? [80] : [40, 60, 40]);
    speak(spoken, { force: true });
  } catch (err) {
    out.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`;
    speak('Banknote check failed. ' + err.message, { force: true });
  } finally {
    btn.disabled = false;
    btn.lastChild.textContent = 'Check banknote';
  }
}

/* ------------------------------------------------------------------ Init */
export function initPayment() {
  camera.attach($('#pay-video'));
  camera.onCameraChange((live) => { if (!live) stopScan(); setScanUI(); });
  $('#pay-start').addEventListener('click', () => (scanning ? stopScan() : startScan()));
  $('#pay-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) scanUpload(file);
  });
  $('#pay-repeat').addEventListener('click', () => lastSpoken && speak(lastSpoken, { force: true }));
  $('#change-form').addEventListener('submit', workOutChange);
  $('#note-btn').addEventListener('click', checkBanknote);
  getHealth().then((h) => {
    if (h?.ai?.enabled) return;
    $('#note-btn').disabled = true;
    $('#note-hint').textContent = 'Banknote check needs the AI key on the server.';
  });
  window.addEventListener('hashchange', () => { if (location.hash !== '#payment' && scanning) stopScan(); });
  setScanUI();
}

/** Voice commands: banknote check and QR scanning. */
export { checkBanknote };
export const startQrScan = () => { if (!scanning) startScan(); };
