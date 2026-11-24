// EYEDENTIFY ONE dashboard: shell, overview, device and history.
import { MODES, SYSTEM_VIEWS, modeById } from './modes.js';
import { getSettings, updateSettings, logEvent, getEvents, clearEvents, subscribe, isToday } from './store.js';
import { speak, stopSpeaking, repeatLast, vibrate, onVoices, speechSupported, vibrationSupported } from './speech.js';
import * as camera from './camera.js';
import { initDetection } from './detection.js';
import { initReading } from './reading.js';
import { initPayment } from './payment.js';
import { initTalk } from './talk.js';
import { initNavigation } from './navigation.js';
import { initVoice } from './voice.js';
import { getHealth } from './api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

const VIEW_IDS = ['overview', ...MODES.map((m) => m.id), 'device', 'history'];
const SOURCE_LABEL = { live: 'Live', demo: 'Demo scene', ai: 'AI', system: 'System' };
const KIND_ICON = { alert: 'i-alert', reading: 'i-book', scan: 'i-wallet', answer: 'i-talk', route: 'i-nav', info: 'i-sparkle' };

/* ------------------------------------------------------------------ Notices */
let toastTimer;
export function toast(text, { alert = false, ms = 3500 } = {}) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('alert', alert);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function showNotice(html) {
  const el = $('#notice');
  el.innerHTML = html;
  el.hidden = !html;
}

/* ------------------------------------------------------------------ Routing */
function currentView() {
  const id = location.hash.slice(1);
  return VIEW_IDS.includes(id) ? id : 'overview';
}
function route(e) {
  const id = currentView();
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${id}`; });
  $$('.nav-item').forEach((a) => {
    if (a.dataset.view === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const view = $(`#view-${id}`);
  $('#breadcrumb').textContent = view?.dataset.title ?? 'Overview';
  document.title = `${view?.dataset.title ?? 'Overview'} · EYEDENTIFY ONE`;
  closeMenu();
  // Opening a mode page makes it the active mode, like switching mode on the glasses.
  if (modeById(id) && getSettings().mode !== id) setMode(id, { speakIt: false });
  window.scrollTo({ top: 0 });
  const h1 = view?.querySelector('h1');
  h1?.setAttribute('tabindex', '-1');
  // On page changes (not the first load), move focus to the new heading so screen readers announce it.
  if (e && h1) h1.focus({ preventScroll: true });
}

function openMenu() {
  $('#sidebar').classList.add('open');
  $('#scrim').hidden = false;
  $('#menu-btn').setAttribute('aria-expanded', 'true');
  $('#sidebar .nav-item[aria-current]')?.focus();
}
function closeMenu() {
  $('#sidebar').classList.remove('open');
  $('#scrim').hidden = true;
  $('#menu-btn').setAttribute('aria-expanded', 'false');
}

/* ------------------------------------------------------------------ Modes */
function setMode(id, { speakIt = true } = {}) {
  const mode = modeById(id);
  if (!mode) return;
  updateSettings({ mode: id });
  renderMode();
  if (speakIt) speak(`${mode.name} mode.`);
  window.dispatchEvent(new CustomEvent('eyedentify:mode', { detail: { id } }));
}
function templeTap() {
  const i = MODES.findIndex((m) => m.id === getSettings().mode);
  const next = MODES[(i + 1) % MODES.length];
  vibrate([40]);
  setMode(next.id);
  if (modeById(currentView())) location.hash = next.id;
}
function renderMode() {
  const mode = modeById(getSettings().mode) ?? MODES[0];
  $('#mode-chip-label').textContent = mode.short;
  $('#mode-chip use').setAttribute('href', `#${mode.icon}`);
  $('#mode-chip').setAttribute('aria-label', `Active mode: ${mode.name}. Tap to switch to the next mode.`);
  $('#hero-mode').textContent = mode.name;
  $('#hero-mode-desc').textContent = mode.desc;
  $('#hero-open').href = `#${mode.id}`;
  $('#mode-grid').innerHTML = MODES.map((m, i) => `
    <a class="mode-tile" href="#${m.id}" ${m.id === mode.id ? 'aria-current="true"' : ''}>
      <span class="mode-icon">${icon(m.icon)}</span>
      ${m.id === mode.id ? '<span class="active-badge">ACTIVE</span>' : `<kbd class="num" aria-hidden="true">${i + 1}</kbd>`}
      <strong>${esc(m.name)}</strong>
      <span class="desc">${esc(m.tile)}</span>
    </a>`).join('');
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  $('#next-mode-label').textContent = next.name;
}
function renderSunburst() {
  const g = $('#burst');
  if (!g) return;
  g.innerHTML = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const r1 = 14, r2 = 58;
    return `<line x1="${60 + Math.cos(a) * r1}" y1="${60 + Math.sin(a) * r1}" x2="${60 + Math.cos(a) * r2}" y2="${60 + Math.sin(a) * r2}"/>`;
  }).join('');
}
function renderUpcoming() {
  $$('[data-upcoming]').forEach((card) => {
    const mode = modeById(card.dataset.upcoming);
    card.innerHTML = `
      <span class="tag">BEING BUILT</span>
      <h2>${esc(mode.name)} arrives in the next build step</h2>
      <p class="lede">${esc(mode.desc)}</p>
      <ul>${mode.planned.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <div class="button-row"><a class="button ghost" href="#overview">${icon('i-home')}Back to overview</a></div>`;
  });
}

/* ------------------------------------------------------------------ Camera */
async function toggleCamera() {
  if (camera.isLive()) {
    camera.stop();
    logEvent({ kind: 'info', text: 'Camera turned off.' });
    speak('Camera off.');
    return;
  }
  try {
    await camera.start();
    showNotice('');
    const facing = camera.getInfo().facing;
    logEvent({ kind: 'info', text: `Camera started${facing === 'environment' ? ' (back camera)' : ''}.` });
    speak('Camera on.');
  } catch (err) {
    showNotice(`<strong>Camera unavailable.</strong> ${esc(err.message)}`);
    speak('The camera could not start.');
  }
}
function renderCamera(live) {
  const btn = $('#camera-btn');
  btn.setAttribute('aria-pressed', String(live));
  $('#camera-btn-label').textContent = live ? 'Stop camera' : 'Start camera';
  btn.querySelector('use').setAttribute('href', live ? '#i-camera-off' : '#i-camera');
  btn.setAttribute('aria-label', live ? 'Stop camera' : 'Start camera');
  $('#overview-empty').hidden = live;
  $('#overview-cam-tag').hidden = !live;
  const pill = $('#glasses-pill');
  pill.classList.toggle('live', live);
  pill.querySelector('span').textContent = live ? 'Phone camera live' : 'Glasses not connected';
  const info = camera.getInfo();
  $('#stat-camera').textContent = live ? 'Your camera is live.' : 'Waiting for your camera.';
  $('#stat-camera-caption').textContent = live
    ? `${info.facing === 'environment' ? 'Back camera' : info.facing === 'user' ? 'Front camera' : 'Camera'}${info.width ? ` · ${info.width}×${info.height}` : ''} · standing in for the glasses`
    : 'The phone\'s back camera is used when available.';
  $('#cam-dot').classList.toggle('on', live);
  $('#camera-card-btn').firstChild.textContent = live ? 'Stop camera ' : 'Start camera ';
  $('#art-cam-l').classList.toggle('on', live);
  $('#art-cam-r').classList.toggle('on', live);
  $('#art-led').classList.toggle('on', live);
  renderStatus();
}

/* ------------------------------------------------------------------ Battery */
let battery = null;
async function initBattery() {
  if (!navigator.getBattery) { renderBattery(); return; }
  try {
    battery = await navigator.getBattery();
    ['levelchange', 'chargingchange'].forEach((e) => battery.addEventListener(e, renderBattery));
  } catch { battery = null; }
  renderBattery();
}
function renderBattery() {
  if (!battery) {
    $('#stat-battery').textContent = '—';
    $('#stat-battery-caption').textContent = 'This browser doesn\'t share battery level';
    $('#dev-battery').textContent = '—';
    $('#dev-battery-note').textContent = 'This browser doesn\'t share battery level (Chrome on Android does).';
    return;
  }
  const pct = Math.round(battery.level * 100);
  const note = battery.charging ? 'Charging · this phone' : 'On battery · this phone';
  $('#stat-battery').textContent = `${pct}%`;
  $('#stat-battery-caption').textContent = note;
  $('#dev-battery').textContent = `${pct}%`;
  $('#dev-battery-note').textContent = note;
  const bar = $('#dev-battery-bar');
  bar.style.width = `${pct}%`;
  bar.style.background = pct <= 15 ? 'var(--red)' : pct <= 35 ? 'var(--orange)' : 'var(--green)';
}

/* ------------------------------------------------------------------ Latency (fed by modes later) */
const latencies = [];
window.addEventListener('eyedentify:latency', (e) => {
  latencies.push(e.detail.ms);
  if (latencies.length > 30) latencies.shift();
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  $('#stat-latency').textContent = avg;
  $('#stat-latency-caption').textContent = `Average of the last ${latencies.length} · ${e.detail.label ?? 'measured on this phone'}`;
});

/* ------------------------------------------------------------------ Device status */
let visionState = ['Connects in Detection', 'warn'];
let aiState = ['Checking…', 'warn'];
getHealth().then((h) => {
  aiState = !h ? ['Server unreachable', 'bad'] : h.ai?.enabled ? [`Ready · ${h.ai.model}`, 'ok'] : ['Key not set · demo answers', 'warn'];
  renderStatus();
});
window.addEventListener('eyedentify:vision', (e) => {
  const { state, text } = e.detail;
  visionState = state === 'ready' ? [text.replace('Cloud ', '').replace(' ready', ' · ready'), 'ok']
    : state === 'error' ? ['Unreachable', 'bad'] : ['Connecting…', 'warn'];
  renderStatus();
});
function renderStatus() {
  const live = camera.isLive();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rows = [
    ['i-camera', 'Camera', live ? ['Live', 'ok'] : camera.cameraSupported ? ['Ready · off', 'warn'] : ['Not supported', 'bad']],
    ['i-shield', 'Secure connection', window.isSecureContext ? ['Yes', 'ok'] : ['No · camera blocked', 'bad']],
    ['i-volume', 'Spoken output', speechSupported ? ['Ready', 'ok'] : ['Not supported', 'bad']],
    ['i-mic', 'Voice commands', SR ? ['Supported', 'ok'] : ['Not in this browser', 'warn']],
    ['i-vibrate', 'Haptic cues', vibrationSupported ? ['Supported', 'ok'] : ['Not on this device', 'warn']],
    ['i-pin', 'Location', 'geolocation' in navigator ? ['Supported', 'ok'] : ['Not supported', 'warn']],
    ['i-chip', 'Cloud detection (YOLO)', visionState],
    ['i-cloud', 'Cloud AI (Gemini)', aiState],
  ];
  $('#status-list').innerHTML = rows.map(([ic, label, [value, cls]]) =>
    `<div class="status-row"><span>${icon(ic)}${esc(label)}</span><strong class="${cls}">${esc(value)}</strong></div>`).join('');
}

/* ------------------------------------------------------------------ Settings */
function applyDisplaySettings() {
  const s = getSettings();
  document.documentElement.dataset.largeText = String(s.largeText);
  document.documentElement.dataset.contrast = s.highContrast ? 'high' : 'normal';
}
function initSettings() {
  const s = getSettings();
  const rate = $('#set-rate');
  rate.value = s.rate;
  $('#set-rate-out').textContent = `${Number(s.rate).toFixed(1)}×`;
  $('#set-speak').checked = s.speak;
  $('#set-vibrate').checked = s.vibrate;
  $('#set-large').checked = s.largeText;
  $('#set-contrast').checked = s.highContrast;

  rate.addEventListener('input', () => {
    $('#set-rate-out').textContent = `${Number(rate.value).toFixed(1)}×`;
    updateSettings({ rate: Number(rate.value) });
  });
  $('#set-speak').addEventListener('change', (e) => updateSettings({ speak: e.target.checked }));
  $('#set-vibrate').addEventListener('change', (e) => updateSettings({ vibrate: e.target.checked }));
  $('#set-large').addEventListener('change', (e) => { updateSettings({ largeText: e.target.checked }); applyDisplaySettings(); });
  $('#set-contrast').addEventListener('change', (e) => { updateSettings({ highContrast: e.target.checked }); applyDisplaySettings(); });
  $('#set-voice').addEventListener('change', (e) => updateSettings({ voiceURI: e.target.value }));

  onVoices((voices) => {
    const sel = $('#set-voice');
    const saved = getSettings().voiceURI;
    const sorted = [...voices].sort((a, b) =>
      (b.lang.startsWith('en-IN') - a.lang.startsWith('en-IN')) || (b.lang.startsWith('en') - a.lang.startsWith('en')) || a.name.localeCompare(b.name));
    sel.innerHTML = '<option value="">System default</option>' +
      sorted.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === saved ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  });

  $('#test-voice').addEventListener('click', () => speak('This is how your glasses will sound. Obstacle ahead, two metres, slightly left.', { force: true }));
  $('#test-vibrate').addEventListener('click', () => {
    const ok = navigator.vibrate?.([80, 60, 80]);
    if (!ok) toast('This device or browser does not support vibration.');
  });
  $('#repeat-btn').addEventListener('click', repeatLast);
  $('#stop-speech-btn').addEventListener('click', stopSpeaking);
}

/* ------------------------------------------------------------------ Feed + history */
let historyFilter = 'all';
function timeLabel(t) {
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday(t) ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${time}`;
}
function eventItem(e) {
  const mode = modeById(e.mode);
  return `<li>
    <span class="feed-icon ${e.kind === 'alert' ? 'alert' : ''}">${icon(KIND_ICON[e.kind] ?? 'i-sparkle')}</span>
    <div class="feed-text">${esc(e.text)}
      <div class="feed-meta"><span>${esc(mode?.short ?? 'System')}</span><span class="badge ${esc(e.source)}">${esc(SOURCE_LABEL[e.source] ?? e.source)}</span></div>
    </div>
    <time datetime="${new Date(e.t).toISOString()}">${esc(timeLabel(e.t))}</time>
    ${icon('i-chevron', 'icon chev')}
  </li>`;
}
function renderFeed() {
  const events = getEvents().slice(0, 7);
  $('#overview-feed').innerHTML = events.length
    ? events.map(eventItem).join('')
    : '<li class="empty"><strong>Nothing yet</strong>Start the camera and open a mode. Alerts, readings and answers will appear here.</li>';
  const today = getEvents().filter((e) => isToday(e.t) && e.source !== 'system');
  $('#stat-today').textContent = today.length;
  const alerts = today.filter((e) => e.kind === 'alert').length;
  $('#stat-today-caption').textContent = today.length ? `${alerts} alert${alerts === 1 ? '' : 's'} among them` : 'Alerts, readings and answers';
}
function renderHistory() {
  const all = getEvents();
  const today = all.filter((e) => isToday(e.t));
  const count = (pred) => today.filter(pred).length;
  const stats = [
    ['i-alert', 'Alerts', count((e) => e.kind === 'alert'), 'today', 'Obstacle and safety alerts', 'tint-peach'],
    ['i-book', 'Readings', count((e) => e.kind === 'reading'), 'today', 'Texts read aloud', 'tint-lavender'],
    ['i-wallet', 'Scans', count((e) => e.kind === 'scan'), 'today', 'QR codes and notes checked', 'tint-mint'],
    ['i-talk', 'Answers', count((e) => e.kind === 'answer'), 'today', 'Talk AI answers', 'tint-lavender'],
  ];
  $('#history-stats').innerHTML = stats.map(([ic, title, n, unit, cap, tint]) => `
    <article class="card stat ${tint}">
      <div class="stat-top"><h3>${title}</h3>${icon(ic)}</div>
      <div class="stat-value">${n} <small>${unit}</small></div><p class="stat-caption">${cap}</p>
    </article>`).join('');

  const filters = [['all', 'All'], ...MODES.map((m) => [m.id, m.short]), ['system', 'System']];
  $('#history-filters').innerHTML = filters.map(([id, label]) =>
    `<button class="filter-btn" data-filter="${id}" aria-pressed="${historyFilter === id}">${esc(label)}</button>`).join('');

  const shown = historyFilter === 'all' ? all : all.filter((e) => e.mode === historyFilter);
  $('#history-list').innerHTML = shown.length
    ? shown.slice(0, 200).map(eventItem).join('')
    : '<li class="empty"><strong>No events here yet</strong>Events appear as you use the modes.</li>';
  $('#export-csv').disabled = !all.length;
  $('#clear-history').disabled = !all.length;
}
function exportCsv() {
  const rows = [['time', 'mode', 'kind', 'source', 'text', 'detail']];
  getEvents().slice().reverse().forEach((e) =>
    rows.push([new Date(e.t).toISOString(), modeById(e.mode)?.name ?? 'System', e.kind, SOURCE_LABEL[e.source] ?? e.source, e.text, e.detail]));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `eyedentify-history-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function confirmClear() {
  const dlg = $('#confirm-dialog');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'ok') { clearEvents(); toast('History cleared.'); }
  }, { once: true });
}

/* ------------------------------------------------------------------ Keyboard (temple controls) */
function onKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return;
  if (e.key === 'Escape') { stopSpeaking(); closeMenu(); return; }
  if (tag === 'BUTTON' || tag === 'A') { if (e.key === ' ' || e.key === 'Enter') return; }
  if (e.key === ' ') { e.preventDefault(); templeTap(); }
  else if (/^[1-5]$/.test(e.key)) { location.hash = MODES[Number(e.key) - 1].id; speak(`${MODES[Number(e.key) - 1].name} mode.`); }
  else if (e.key.toLowerCase() === 'r') repeatLast();
  else if (e.key.toLowerCase() === 'c') toggleCamera();
}

/* ------------------------------------------------------------------ Boot */
function init() {
  applyDisplaySettings();
  $('#date-label').textContent = new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  renderMode();
  renderSunburst();
  renderUpcoming();
  renderStatus();
  renderFeed();
  renderHistory();
  initSettings();
  initBattery();
  initDetection();
  initReading();
  initPayment();
  initTalk();
  initNavigation();
  initVoice();

  camera.attach($('#overview-video'));
  camera.onCameraChange(renderCamera);
  renderCamera(camera.isLive());

  subscribe((what) => { if (what === 'events') { renderFeed(); renderHistory(); } });

  $('#camera-btn').addEventListener('click', toggleCamera);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="camera-start"]')) toggleCamera();
    const f = e.target.closest('[data-filter]');
    if (f) { historyFilter = f.dataset.filter; renderHistory(); }
  });
  $('#mode-chip').addEventListener('click', templeTap);
  $('#temple-tap').addEventListener('click', templeTap);
  $('#menu-btn').addEventListener('click', openMenu);
  $('#scrim').addEventListener('click', closeMenu);
  $('#export-csv').addEventListener('click', exportCsv);
  $('#clear-history').addEventListener('click', confirmClear);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => {
    // Free the camera when the phone screen locks or the tab is hidden.
    if (document.hidden && camera.isLive()) camera.stop();
  });
  route();
}

init();

// Shared helpers for the mode modules added in later steps.
export { setMode, logEvent, speak, vibrate, camera };
