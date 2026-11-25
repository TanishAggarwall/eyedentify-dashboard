// Global voice commands ("hey glasses"): one mic in the top bar works from any page.
// Recognised commands run the matching mode's action; anything else becomes a Talk AI question.
import { speak, stopSpeaking, repeatLast, vibrate, unlockAudio } from './speech.js';
import * as camera from './camera.js';
import { startDetection } from './detection.js';
import { readNow } from './reading.js';
import { checkBanknote, startQrScan } from './payment.js';
import { whereAmI, goTo } from './navigation.js';
import { askTalk } from './talk.js';
import { parseCommand } from './commands.js';

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

/** Turn a spoken phrase into a runnable action (the parsing itself lives in commands.js). */
export function route(phrase) {
  const cmd = parseCommand(phrase);
  const run = {
    stop: () => stopSpeaking(),
    repeat: () => repeatLast(),
    help: () => speak(HELP, { force: true }),
    'camera-on': () => camera.start().then(() => speak('Camera on.')).catch((e) => speak(e.message)),
    'camera-off': () => { camera.stop(); speak('Camera off.'); },
    'where-am-i': () => goThen('navigation-mode', whereAmI),
    navigate: () => goThen('navigation-mode', () => goTo(cmd.place)),
    banknote: () => goThen('payment', checkBanknote),
    'scan-qr': () => goThen('payment', startQrScan),
    read: () => goThen('reading', readNow),
    mode: () => { location.hash = cmd.hash; if (cmd.hash === 'detection') setTimeout(startDetection, 350); },
    detection: () => goThen('detection', startDetection),
    page: () => { location.hash = cmd.hash; speak(`${cmd.page}.`); },
    question: () => goThen('talk', () => askTalk(phrase)),
  }[cmd.action];
  return { name: cmd.name, run };
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
