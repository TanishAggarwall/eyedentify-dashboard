// Settings and event history, kept in this browser only.
const SETTINGS_KEY = 'eyedentify.settings.v1';
const EVENTS_KEY = 'eyedentify.events.v1';
const MAX_EVENTS = 500;

const DEFAULT_SETTINGS = {
  mode: 'detection',
  voiceURI: '',
  rate: 1,
  speak: true,
  vibrate: true,
  largeText: false,
  highContrast: false,
  detectRange: 3,
  detectBeep: true,
  readRate: 1.2,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory */ }
}

let settings = { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
const savedEvents = read(EVENTS_KEY, []);
let events = Array.isArray(savedEvents) ? savedEvents : [];
const listeners = new Set();

function notify(what) { listeners.forEach((fn) => fn(what)); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function getSettings() { return { ...settings }; }
export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  write(SETTINGS_KEY, settings);
  notify('settings');
}

/**
 * Record something the glasses noticed or said.
 * @param {object} e
 * @param {string} e.mode     mode id, or 'system'
 * @param {string} e.kind     'alert' | 'reading' | 'scan' | 'answer' | 'route' | 'info'
 * @param {string} e.text     human-readable summary
 * @param {string} e.source   'live' (real sensor/model) | 'demo' (scripted) | 'ai' (Claude) | 'system'
 */
export function logEvent({ mode = 'system', kind = 'info', text, source = 'system', detail = '' }) {
  const event = {
    id: (crypto.randomUUID?.() ?? String(Date.now() + Math.random())),
    t: Date.now(),
    mode, kind, text: String(text), source, detail: String(detail ?? ''),
  };
  events = [event, ...events].slice(0, MAX_EVENTS);
  write(EVENTS_KEY, events);
  notify('events');
  return event;
}
export function getEvents() { return events; }
export function clearEvents() {
  events = [];
  write(EVENTS_KEY, events);
  notify('events');
}

export function isToday(t) {
  const d = new Date(t), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
