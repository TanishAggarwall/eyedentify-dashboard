// Global voice commands ("hey glasses"): one mic in the top bar works from any page.
// Recognised commands run the matching mode's action; anything else becomes a Talk AI question.
import { speak, stopSpeaking, repeatLast, vibrate, unlockAudio } from './speech.js';
import * as camera from './camera.js';
import { startDetection } from './detection.js';
import { readNow } from './reading.js';
import { checkBanknote, startQrScan } from './payment.js';
import { whereAmI, goTo } from './navigation.js';
import { askTalk } from './talk.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = Boolean(SR);
const $ = (s) => document.querySelector(s);

const HELP = 'You can say: what\'s in front of me. Read this. Check this note. Scan QR code. Where am I. '
  + 'Take me to, and a place. Detection mode. Start camera. Repeat. Or stop. Anything else, I\'ll answer as a question.';

let rec = null;
let toastTimer = 0;

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.remove('alert');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/** Switch page, give it a moment to show its camera view, then run the action. */
function goThen(hash, action) {
  if (location.hash !== `#${hash}`) location.hash = hash;
  setTimeout(action, 350);
}

const PAGES = { overview: 'overview', home: 'overview', history: 'history', settings: 'device', device: 'device' };
const MODES = { detection: 'detection', obstacle: 'detection', reading: 'reading', read: 'reading', payment: 'payment', money: 'payment', navigation: 'navigation-mode', map: 'navigation-mode', talk: 'talk', chat: 'talk' };

/** Turn a spoken phrase into an action. Exported for testing. */
export function route(phrase) {
  const p = phrase.toLowerCase().replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  if (/^(stop|quiet|be quiet|silence|shut up|cancel)$/.test(p)) return { name: 'stop', run: () => stopSpeaking() };
  if (/^(repeat|again|say (that|it) again|what did you say)$/.test(p)) return { name: 'repeat', run: () => repeatLast() };
  if (/^help$|what can (i|you) (say|do)|^commands$/.test(p)) return { name: 'help', run: () => speak(HELP, { force: true }) };
  if (/(start|turn on|open|switch on) (the )?camera/.test(p)) return { name: 'camera on', run: () => camera.start().then(() => speak('Camera on.')).catch((e) => speak(e.message)) };
  if (/(stop|turn off|close|switch off) (the )?camera/.test(p)) return { name: 'camera off', run: () => { camera.stop(); speak('Camera off.'); } };
  if (/where am i|my location|where are we/.test(p)) return { name: 'where am I', run: () => goThen('navigation-mode', whereAmI) };
  if ((m = p.match(/^(?:please )?(?:take me to|navigate to|directions to|guide me to|go to|how do i get to|find)\s+(?:the |a |an |nearest )?(.+)$/)) && !PAGES[m[1]] && !MODES[m[1].replace(/ mode$/, '')]) {
    const place = m[1];
    return { name: `navigate to ${place}`, run: () => goThen('navigation-mode', () => goTo(place)) };
  }
  if (/\b(note|notes|banknote|cash|currency|rupee|rupees|money)\b/.test(p) && /(check|what|which|how much|identify|is this|count)/.test(p)) {
    return { name: 'banknote check', run: () => goThen('payment', checkBanknote) };
  }
  if (/\b(scan|qr|upi)\b/.test(p)) return { name: 'scan QR', run: () => goThen('payment', startQrScan) };
  if (/^(read\b(?! mode)|what does (this|it|the sign|the label) say)/.test(p)) {
    return { name: 'read', run: () => goThen('reading', readNow) };
  }
  if ((m = p.match(/^(?:open |go to |switch to |start )?(\w+) mode$/)) && MODES[m[1]]) {
    const hash = MODES[m[1]];
    return { name: `${m[1]} mode`, run: () => { location.hash = hash; if (hash === 'detection') setTimeout(startDetection, 350); } };
  }
  if (/^(start )?(detecting|detection|obstacle detection)$|what'?s ahead|any obstacles/.test(p)) {
    return { name: 'detection', run: () => goThen('detection', startDetection) };
  }
  if ((m = p.match(/^(?:open |go to |show )?(?:the )?(overview|home|history|settings|device)$/))) {
    return { name: m[1], run: () => { location.hash = PAGES[m[1]]; speak(`${m[1]}.`); } };
  }
  return { name: 'question', run: () => goThen('talk', () => askTalk(phrase)) };
}

function setListening(on) {
  const btn = $('#voice-btn');
  btn.classList.toggle('listening', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Listening for a command. Tap to stop.' : 'Voice command');
}

export function listen() {
  if (!SR) {
    speak('Voice commands need Chrome on Android, or desktop Chrome.', { force: true });
    toast('Voice commands need Chrome.');
    return;
  }
  if (rec) { try { rec.stop(); } catch { /* already stopped */ } return; }
  unlockAudio();
  stopSpeaking();
  rec = new SR();
  rec.lang = document.querySelector('#talk-lang')?.value || 'en-IN';
  rec.interimResults = true;
  let finalText = '';
  rec.onstart = () => { setListening(true); vibrate([30]); toast('Listening…'); };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
    }
    toast(`“${(finalText || interim).trim()}”`);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed') speak('Microphone permission was blocked. Allow it in the browser settings.', { force: true });
    else if (e.error === 'no-speech') speak('I didn\'t hear anything.', { force: true });
  };
  rec.onend = () => {
    setListening(false);
    rec = null;
    const said = finalText.trim();
    if (!said) return;
    const cmd = route(said);
    toast(`“${said}” → ${cmd.name}`);
    cmd.run();
  };
  rec.start();
}

export function initVoice() {
  const btn = $('#voice-btn');
  btn.addEventListener('click', listen);
  if (!SR) btn.title = 'Voice commands need Chrome';
  // V = voice command from anywhere (keyboard stand-in for the glasses' "hey glasses").
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'v' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
    e.preventDefault();
    listen();
  });
}
