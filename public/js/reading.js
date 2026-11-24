// Mode 2 — Instant reading.
// Captures a frame (or an uploaded photo), sends it to the cloud OCR endpoint, shows the text
// line by line and reads it aloud at an adjustable speed.
import { getSettings, updateSettings, logEvent, getEvents, subscribe } from './store.js';
import { speak, stopSpeaking, vibrate, unlockAudio, cue } from './speech.js';
import * as camera from './camera.js';
import { postJSON, frameBlob, fileBlob, ensureCamera, drawBoxes, clearCanvas, blobToBase64, getHealth } from './api.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

let busy = false;
let result = null;          // last OCR result
let stillSize = null;       // [w, h] of the still being shown
let speaking = false;
let aiEnabled = false;

const DEVANAGARI = /[ऀ-ॿ]/;
const LANG_NAMES = { hi: 'Hindi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', mr: 'Marathi', kn: 'Kannada', gu: 'Gujarati', pa: 'Punjabi', en: 'English' };

function setBusy(on, label = 'Reading…') {
  busy = on;
  $('#read-busy').hidden = !on;
  $('#read-busy').lastChild.textContent = label;
  $('#read-btn').disabled = on;
}

function showStill(canvas) {
  const img = $('#read-still');
  img.src = canvas.toDataURL('image/jpeg', 0.8);
  img.hidden = false;
  stillSize = [canvas.width, canvas.height];
  $('#read-live').hidden = false;
  $('#read-empty').hidden = true;
}
function backToLive() {
  $('#read-still').hidden = true;
  $('#read-live').hidden = true;
  stillSize = null;
  clearCanvas($('#read-canvas'));
  renderCameraState();
}

function renderText() {
  const box = $('#read-text');
  const has = Boolean(result?.lines?.length);
  $('#read-play').disabled = !has;
  $('#read-stop').disabled = !has;
  $('#read-copy').disabled = !has;
  $('#read-translate').disabled = !has || !aiEnabled;
  if (!result) return;
  if (!has) {
    box.innerHTML = '<p class="placeholder">No text found. Move closer, fill the frame with the text, and keep the phone steady.</p>';
    return;
  }
  box.innerHTML = result.lines.map((l, i) =>
    `<p data-line="${i}" class="${l.confidence < 0.7 ? 'low' : ''}"${l.confidence ? ` title="${Math.round(l.confidence * 100)}% sure"` : ''}>${esc(l.text)}</p>`).join('');
}

async function translate() {
  if (!result?.text || !aiEnabled) return;
  const code = $('#read-lang').value;
  const target = LANG_NAMES[code] ?? 'Hindi';
  const btn = $('#read-translate');
  btn.disabled = true;
  btn.textContent = 'Translating…';
  try {
    const res = await postJSON('/api/ai/translate', { text: result.text, target });
    let out = $('#read-translation');
    if (!out) {
      out = document.createElement('div');
      out.id = 'read-translation';
      out.className = 'translation';
      out.setAttribute('aria-live', 'polite');
      $('#read-text').after(out);
    }
    out.innerHTML = `<small>${esc(target.toUpperCase())}</small>${esc(res.translation)}`;
    speak(res.translation.replace(/\n/g, '. '), { force: true, rate: getSettings().readRate, lang: res.lang || `${code}-IN` });
    logEvent({ mode: 'reading', kind: 'reading', source: 'ai', text: `Translated into ${target}: “${res.translation.replace(/\s+/g, ' ').slice(0, 80)}”`, detail: res.translation });
  } catch (err) {
    $('#read-status').textContent = err.message;
    speak('Translation failed. ' + err.message, { force: true });
  } finally {
    btn.textContent = 'Translate';
    btn.disabled = !result?.lines?.length;
  }
}

function readAloud() {
  if (!result?.lines?.length) return;
  unlockAudio();
  const text = result.lines.map((l) => l.text).join('. ').replace(/\.\.+/g, '.');
  speaking = true;
  $('#read-play span').textContent = 'Read again';
  speak(text, { force: true, rate: getSettings().readRate, lang: DEVANAGARI.test(text) ? 'hi-IN' : undefined });
}

async function runOcr(source) {
  if (busy) return;
  unlockAudio();
  setBusy(true);
  $('#read-status').textContent = 'Reading…';
  try {
    let shot;
    if (source === 'camera') {
      await ensureCamera($('#read-video'));
      shot = await frameBlob($('#read-video'), 1280, 0.88);
    } else {
      shot = await fileBlob(source, 1600, 0.88);
    }
    if (!shot) throw new Error('Couldn\'t capture a picture.');
    showStill(shot.canvas);
    $('#read-translation')?.remove();
    cue(0, 'low');
    // The AI reads first (better with signs, spacing and Hindi); the server falls back to OCR by itself.
    result = await postJSON('/api/ai/read', { image: await blobToBase64(shot.blob) }, { timeout: 40000 });
    const n = result.lines.length;
    const engine = result.source === 'ai' ? 'Gemini' : 'basic OCR';
    $('#read-status').textContent = n
      ? `${n} line${n === 1 ? '' : 's'} · read by ${engine} in ${(result.rtt / 1000).toFixed(1)} s`
      : 'No text found.';
    $('#read-meta').textContent = `${result.source === 'ai' ? result.model : 'RapidOCR'} · server ${Math.round(result.ms)} ms · round trip ${Math.round(result.rtt)} ms`;
    renderText();
    const boxes = result.lines.map((l) => l.box).filter(Boolean);
    if (boxes.length) drawBoxes($('#read-canvas'), boxes, stillSize[0], stillSize[1], { fit: 'contain' });
    else clearCanvas($('#read-canvas'));
    if (n) {
      vibrate([60]);
      readAloud();
      const preview = result.text.replace(/\s+/g, ' ').slice(0, 90);
      logEvent({ mode: 'reading', kind: 'reading', source: result.source === 'ai' ? 'ai' : 'live', text: `Read aloud: “${preview}${result.text.length > 90 ? '…' : ''}”`, detail: result.text });
    } else {
      speak('I couldn\'t find any text. Move closer and hold the phone steady.', { force: true });
    }
  } catch (err) {
    result = null;
    renderText();
    $('#read-status').textContent = err.message;
    speak('Reading failed. ' + err.message, { force: true });
  } finally {
    setBusy(false);
  }
}

function renderCameraState() {
  const live = camera.isLive();
  $('#read-dot').classList.toggle('on', live);
  $('#read-empty').hidden = live || !$('#read-still').hidden;
}

function renderLog() {
  const items = getEvents().filter((e) => e.mode === 'reading' && e.kind === 'reading').slice(0, 5);
  $('#read-log').innerHTML = items.length
    ? items.map((e) => `<li>
        <span class="feed-icon">${icon('i-book')}</span>
        <div class="feed-text">${esc(e.text)}<div class="feed-meta"><span class="badge live">Live</span></div></div>
        <time>${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        <button class="link-btn" data-reread="${esc(e.id)}" aria-label="Read this again">${icon('i-volume')}</button>
      </li>`).join('')
    : '<li class="empty"><strong>Nothing read yet</strong>Tap Read text with a sign, label or page in view.</li>';
}

export function initReading() {
  camera.attach($('#read-video'));
  camera.onCameraChange(renderCameraState);

  const rate = $('#read-rate');
  rate.value = getSettings().readRate ?? 1.2;
  $('#read-rate-out').textContent = `${Number(rate.value).toFixed(1)}×`;
  rate.addEventListener('input', () => {
    $('#read-rate-out').textContent = `${Number(rate.value).toFixed(1)}×`;
    updateSettings({ readRate: Number(rate.value) });
  });
  rate.addEventListener('change', () => { if (speaking) readAloud(); });

  $('#read-btn').addEventListener('click', () => runOcr('camera'));
  $('#read-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) runOcr(file);
  });
  $('#read-live').addEventListener('click', backToLive);
  $('#read-play').addEventListener('click', readAloud);
  $('#read-stop').addEventListener('click', () => { stopSpeaking(); speaking = false; });
  $('#read-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(result?.text ?? ''); $('#read-status').textContent = 'Copied to the clipboard.'; }
    catch { $('#read-status').textContent = 'Copy isn\'t allowed in this browser.'; }
  });
  $('#read-log').addEventListener('click', (e) => {
    const b = e.target.closest('[data-reread]');
    const ev = b && getEvents().find((x) => x.id === b.dataset.reread);
    if (ev?.detail) speak(ev.detail.replace(/\n/g, '. '), { force: true, rate: getSettings().readRate });
  });
  // Temple-tap shortcut on this page: Enter reads, as the glasses' "read" gesture would.
  document.addEventListener('keydown', (e) => {
    if (location.hash !== '#reading' || e.key !== 'Enter' || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'LABEL'].includes(e.target.tagName)) return;
    e.preventDefault();
    runOcr('camera');
  });
  window.addEventListener('resize', () => {
    const boxes = result?.lines?.map((l) => l.box).filter(Boolean) ?? [];
    if (boxes.length && stillSize) drawBoxes($('#read-canvas'), boxes, stillSize[0], stillSize[1], { fit: 'contain' });
  });
  $('#read-translate').addEventListener('click', translate);

  subscribe((what) => { if (what === 'events') renderLog(); });
  renderLog();
  renderCameraState();
  getHealth().then((h) => {
    aiEnabled = Boolean(h?.ai?.enabled);
    $('#read-translate').title = aiEnabled ? 'Translate with Gemini' : 'Needs the AI key on the server';
    const hint = $('#read-translate').closest('.player').querySelector('.hint');
    hint.textContent = aiEnabled ? 'Translation and reading use Google Gemini; basic OCR takes over if it\'s busy.' : 'Translation needs the AI key on the server. Reading uses basic OCR until then.';
    renderText();
  });
}
