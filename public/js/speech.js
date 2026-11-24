// Spoken output and haptic cues: the phone speaker stands in for bone conduction.
import { getSettings } from './store.js';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let lastSpoken = '';
let voices = [];
const voiceListeners = new Set();

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices();
  voiceListeners.forEach((fn) => fn(voices));
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export const speechSupported = Boolean(synth);
export function onVoices(fn) { voiceListeners.add(fn); fn(voices); }

/**
 * Speak text aloud.
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.interrupt=true] cancel anything currently being spoken
 * @param {boolean} [opts.force=false]    speak even when "speak alerts" is off (e.g. test button)
 * @param {number}  [opts.rate]           override the saved rate
 * @param {string}  [opts.lang]           BCP-47 language for the utterance
 */
export function speak(text, { interrupt = true, force = false, rate, lang } = {}) {
  if (!text) return;
  lastSpoken = text;
  announce(text);
  const s = getSettings();
  if (!synth || (!s.speak && !force)) return;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate ?? s.rate;
  const voice = voices.find((v) => v.voiceURI === s.voiceURI);
  if (voice && !lang) u.voice = voice;
  if (lang) u.lang = lang;
  synth.speak(u);
}

export function stopSpeaking() { synth?.cancel(); }
export function repeatLast() { if (lastSpoken) speak(lastSpoken, { force: true }); }

/** Vibration pattern as a haptic cue (Android Chrome supports this; iOS ignores it). */
export function vibrate(pattern = [120]) {
  if (!getSettings().vibrate) return false;
  return navigator.vibrate?.(pattern) ?? false;
}
export const vibrationSupported = 'vibrate' in navigator;

/* Directional beeps: stand-in for the glasses' binaural bone-conduction cues. */
let audioCtx = null;
/** Create/resume the audio context. Call from a user gesture (a tap or click). */
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx ??= new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
/**
 * Play a short beep panned to one ear.
 * @param {number} pan     -1 (left ear) … 0 (centre) … 1 (right ear)
 * @param {'low'|'mid'|'high'} urgency  more and higher beeps when closer
 */
export function cue(pan = 0, urgency = 'mid') {
  const ctx = audioCtx;
  if (!ctx || ctx.state !== 'running') return;
  const { count, freq } = { low: { count: 1, freq: 660 }, mid: { count: 2, freq: 880 }, high: { count: 3, freq: 1175 } }[urgency] ?? { count: 2, freq: 880 };
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panner) { panner.pan.value = Math.max(-1, Math.min(1, pan)); panner.connect(ctx.destination); }
  const out = panner ?? ctx.destination;
  for (let i = 0; i < count; i++) {
    const t = ctx.currentTime + i * 0.16;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.12);
  }
}

/** Screen-reader announcement through the polite live region. */
export function announce(text) {
  const el = document.getElementById('announcer');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = text; });
}
