// Mode 5 — Talk AI.
// Ask by voice (browser speech recognition) or by typing; the current camera frame and the
// question go to Gemini through the backend, and the answer is spoken and kept in a thread.
import { logEvent } from './store.js';
import { speak, stopSpeaking, vibrate, cue, unlockAudio } from './speech.js';
import * as camera from './camera.js';
import { postJSON, frameBlob, ensureCamera, blobToBase64, getHealth } from './api.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const DEVANAGARI = /[ऀ-ॿ]/;
const CHIPS = {
  'en-IN': ["What's in front of me?", 'Where are my keys?', 'Is the path clear?', 'Read this for me', 'Who is near me?', 'What colour is this?'],
  'hi-IN': ['मेरे सामने क्या है?', 'मेरी चाबी कहाँ है?', 'क्या रास्ता साफ़ है?', 'इसे पढ़ कर सुनाओ', 'मेरे पास कौन है?'],
};

let busy = false;
let rec = null;
let aiInfo = null;
const thread = [];

function langOf(text) { return DEVANAGARI.test(text) ? 'hi-IN' : 'en-IN'; }

function renderThread() {
  const el = $('#talk-thread');
  if (!thread.length) {
    el.innerHTML = '<li class="empty">Ask anything about what\'s in front of you.<br>Try “Where are my keys?”</li>';
    return;
  }
  el.innerHTML = thread.map((t, i) => t.role === 'q'
    ? `<li class="q">${esc(t.text)}</li>`
    : t.role === 'err'
      ? `<li class="err">${esc(t.text)}</li>`
      : `<li class="a" data-i="${i}" tabindex="0" role="button" aria-label="Answer: ${esc(t.text)}. Activate to hear it again.">${esc(t.text)}
           <small><span class="badge ${t.source === 'ai' ? 'ai' : 'demo'}">${t.source === 'ai' ? 'Gemini' : 'Demo answer'}</span>${t.ms ? `${(t.ms / 1000).toFixed(1)} s` : ''}</small></li>`).join('');
  el.scrollTop = el.scrollHeight;
}

function setBusy(on) {
  busy = on;
  $('#talk-busy').hidden = !on;
  $('#talk-send').disabled = on;
  $('#talk-mic').disabled = on;
}

async function ask(question) {
  question = question.trim();
  if (!question || busy) return;
  unlockAudio();
  stopSpeaking();
  setBusy(true);
  thread.push({ role: 'q', text: question });
  renderThread();
  $('#talk-input').value = '';
  try {
    await ensureCamera($('#talk-video'));
    const shot = await frameBlob($('#talk-video'), 1024, 0.8);
    if (!shot) throw new Error('Couldn\'t capture a picture.');
    const still = $('#talk-still');
    still.src = shot.canvas.toDataURL('image/jpeg', 0.7);
    still.hidden = false;
    cue(0, 'low');
    const res = await postJSON('/api/ai/ask', { image: await blobToBase64(shot.blob), question });
    thread.push({ role: 'a', text: res.answer, source: res.source, ms: res.rtt });
    renderThread();
    vibrate([50]);
    speak(res.answer, { force: true, lang: langOf(res.answer) === 'hi-IN' ? 'hi-IN' : undefined });
    $('#talk-meta').textContent = res.source === 'ai'
      ? `${res.model} · model ${(res.ms / 1000).toFixed(1)} s · total ${(res.rtt / 1000).toFixed(1)} s`
      : 'Demo answer: the AI key isn\'t set up on the server yet.';
    logEvent({ mode: 'talk', kind: 'answer', source: res.source === 'ai' ? 'ai' : 'demo', text: `“${question}” → ${res.answer}` });
  } catch (err) {
    thread.push({ role: 'err', text: err.message });
    renderThread();
    speak('Sorry. ' + err.message, { force: true });
  } finally {
    setBusy(false);
    setTimeout(() => { $('#talk-still').hidden = true; }, 2500);
  }
}

/* ------------------------------------------------------------------ Voice input */
function stopListening() {
  try { rec?.stop(); } catch { /* already stopped */ }
}
function listen() {
  if (!SR) {
    thread.push({ role: 'err', text: 'Voice input isn\'t supported in this browser. Use Chrome on Android, or type your question.' });
    renderThread();
    return;
  }
  if (rec) { stopListening(); return; }
  unlockAudio();
  stopSpeaking();
  rec = new SR();
  rec.lang = $('#talk-lang').value;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onstart = () => { $('#talk-mic').classList.add('listening'); $('#talk-mic').setAttribute('aria-label', 'Listening. Tap to stop.'); vibrate([30]); };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    $('#talk-input').value = (finalText || interim).trim();
  };
  rec.onerror = (e) => {
    const msg = e.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in the browser settings.'
      : e.error === 'no-speech' ? 'I didn\'t hear anything. Tap the mic and ask again.'
        : `Voice input stopped (${e.error}).`;
    thread.push({ role: 'err', text: msg });
    renderThread();
  };
  rec.onend = () => {
    $('#talk-mic').classList.remove('listening');
    $('#talk-mic').setAttribute('aria-label', 'Tap to ask by voice');
    rec = null;
    if (finalText.trim()) ask(finalText);
  };
  rec.start();
}

function renderChips() {
  const lang = $('#talk-lang').value;
  $('#talk-chips').innerHTML = CHIPS[lang].map((q) => `<button class="chip" type="button">${esc(q)}</button>`).join('');
}

function renderCamera() {
  const live = camera.isLive();
  $('#talk-dot').classList.toggle('on', live);
  $('#talk-empty').hidden = live;
}

export async function initTalk() {
  camera.attach($('#talk-video'));
  camera.onCameraChange(renderCamera);
  $('#talk-form').addEventListener('submit', () => ask($('#talk-input').value));
  $('#talk-mic').addEventListener('click', listen);
  $('#talk-chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) ask(c.textContent); });
  $('#talk-lang').addEventListener('change', renderChips);
  $('#talk-clear').addEventListener('click', () => { thread.length = 0; renderThread(); });
  $('#talk-thread').addEventListener('click', (e) => {
    const li = e.target.closest('li.a');
    if (li) speak(thread[Number(li.dataset.i)].text, { force: true, lang: langOf(li.textContent) === 'hi-IN' ? 'hi-IN' : undefined });
  });
  $('#talk-thread').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li.a')) { e.preventDefault(); e.target.click(); } });
  // M key = "hey glasses": start voice input from anywhere on this page.
  document.addEventListener('keydown', (e) => {
    if (location.hash !== '#talk' || e.key.toLowerCase() !== 'm' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    e.preventDefault();
    listen();
  });
  if (!SR) $('#talk-mic').title = 'Voice input needs Chrome on Android or desktop Chrome';

  renderChips();
  renderThread();
  renderCamera();
  aiInfo = (await getHealth())?.ai ?? null;
  $('#talk-engine').innerHTML = `<svg class="icon"><use href="#i-sparkle"/></svg>${aiInfo?.enabled ? 'Gemini · ' + esc(aiInfo.model) : 'Demo answers · AI key not set'}`;
}
