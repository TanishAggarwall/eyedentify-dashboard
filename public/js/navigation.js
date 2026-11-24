// Mode 4 — AI navigation.
// Map (Leaflet + OpenStreetMap/CARTO dark tiles), place search, walking routes from the backend,
// spoken turn-by-turn guidance with re-routing, a simulated walk for demos, "where am I / where is it",
// and a scripted indoor metro-station walk-through.
import { logEvent } from './store.js';
import { speak, vibrate, cue, unlockAudio } from './speech.js';
import { apiUrl } from './api.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
const DEMO_START = { lat: 28.6315, lon: 77.2167, label: 'Connaught Place, New Delhi' };
const ARRIVE_M = 15;          // close enough to call it arrived
const NEAR_M = 22;            // "turn left now"
const PREVIEW_M = 90;         // "in 80 metres, turn left"
const PASS_M = 10;            // manoeuvre passed
const OFF_ROUTE_M = 35;       // further than this from the line counts as off route
const SIM_SPEED = 6;          // simulated walk runs at 6x walking pace for demos

let L = null, map = null, meMarker = null, destMarker = null, routeLine = null;
let pos = null;               // {lat, lon, accuracy, sim}
let posIsDemo = false;
let heading = null;           // degrees from north, if known
let watchId = null;
let dest = null;              // {name, lat, lon}
let route = null;             // backend route
let guiding = false;
let stepIdx = 0;
let said = {};                // per-step flags: {preview, near}
let offCount = 0;
let lastReroute = 0;
let sim = null;               // {timer, idx, along}

/* ------------------------------------------------------------------ Geometry */
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
export function dist(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function distToSegment(p, a, b) {
  // Equirectangular projection around p: accurate enough at street scale.
  const kx = Math.cos(rad(p.lat)) * R * Math.PI / 180, ky = R * Math.PI / 180;
  const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function distToRoute(p) {
  const g = route.geometry;
  let best = Infinity;
  for (let i = 1; i < g.length; i++) best = Math.min(best, distToSegment(p, { lat: g[i - 1][0], lon: g[i - 1][1] }, { lat: g[i][0], lon: g[i][1] }));
  return best;
}
const CARD = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const cardinal = (b) => CARD[Math.round(b / 45) % 8];
function clock(rel) { const h = Math.round((((rel % 360) + 360) % 360) / 30) % 12; return h === 0 ? 12 : h; }
function metres(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} kilometres`;
  const r = m < 100 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10;
  return `${r} metres`;
}
const short = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/* ------------------------------------------------------------------ Server calls */
async function getJSON(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(apiUrl(path), { signal: ctrl.signal, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The map service took too long. Try again.');
    if (err instanceof TypeError) throw new Error('Couldn\'t reach the server. Check the internet connection.');
    throw err;
  } finally { clearTimeout(t); }
}

/* ------------------------------------------------------------------ Map */
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}/leaflet.css`;
    document.head.append(css);
    const s = document.createElement('script');
    s.src = `${LEAFLET}/leaflet.js`;
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('The map couldn\'t load. Check the internet connection.'));
    document.head.append(s);
  });
}
async function ensureMap() {
  if (map) return map;
  L = await loadLeaflet();
  const start = pos ?? DEMO_START;
  map = L.map('nav-map', { zoomControl: true, attributionControl: true }).setView([start.lat, start.lon], 16);
  // Standard OpenStreetMap tiles, darkened with a CSS filter (.nav-map .leaflet-tile-pane).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}
function drawMe() {
  if (!map || !pos) return;
  const html = `<div class="me-dot ${pos.sim ? 'sim' : ''}"></div>`;
  const ic = L.divIcon({ className: '', html, iconSize: [18, 18], iconAnchor: [9, 9] });
  if (!meMarker) meMarker = L.marker([pos.lat, pos.lon], { icon: ic, keyboard: false, title: 'You' }).addTo(map);
  else { meMarker.setLatLng([pos.lat, pos.lon]); meMarker.setIcon(ic); }
}
function drawRoute() {
  routeLine?.remove();
  destMarker?.remove();
  if (!route) return;
  routeLine = L.polyline(route.geometry, { color: '#8b55f7', weight: 6, opacity: 0.9 }).addTo(map);
  destMarker = L.marker([dest.lat, dest.lon], {
    icon: L.divIcon({ className: '', html: '<div class="dest-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 22] }),
    title: dest.name,
  }).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
}

/* ------------------------------------------------------------------ Location */
function setBadge() {
  const b = $('#nav-loc-badge');
  const text = !pos ? 'Location off' : pos.sim ? 'Simulated walk' : posIsDemo ? `Demo location · ${DEMO_START.label}` : `GPS ±${Math.round(pos.accuracy || 0)} m`;
  b.innerHTML = `${icon('i-pin')}${esc(text)}`;
  $('#nav-dot').classList.toggle('on', Boolean(pos) && !posIsDemo);
}
function useDemoLocation(reason) {
  pos = { lat: DEMO_START.lat, lon: DEMO_START.lon, accuracy: 0 };
  posIsDemo = true;
  $('#nav-meta').textContent = `${reason} Using a demo location: ${DEMO_START.label}.`;
  setBadge();
  drawMe();
  map?.setView([pos.lat, pos.lon], 16);
}
async function locate({ announce = true } = {}) {
  await ensureMap();
  if (!('geolocation' in navigator) || !window.isSecureContext) { useDemoLocation('Location isn\'t available here.'); return; }
  $('#nav-meta').textContent = 'Finding your location…';
  return new Promise((resolve) => {
    let first = true;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition((p) => {
      if (sim) return; // a simulated walk owns the position
      pos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
      posIsDemo = false;
      if (p.coords.heading != null && !Number.isNaN(p.coords.heading) && p.coords.speed > 0.5) heading = p.coords.heading;
      setBadge();
      drawMe();
      if (first) {
        first = false;
        map.setView([pos.lat, pos.lon], 17);
        $('#nav-meta').textContent = `Located to within ${Math.round(pos.accuracy)} m.`;
        if (announce) speak('Location found.');
        resolve();
      }
      onPosition();
    }, (err) => {
      if (first) {
        first = false;
        useDemoLocation(err.code === 1 ? 'Location permission was blocked.' : 'Your location couldn\'t be found.');
        resolve();
      }
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 });
  });
}
function initCompass() {
  const onOrient = (e) => {
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === 'number') heading = (360 - e.alpha) % 360;
  };
  window.addEventListener('deviceorientationabsolute', onOrient);
  window.addEventListener('deviceorientation', onOrient);
}

/* ------------------------------------------------------------------ Search & route */
async function search(q) {
  const list = $('#nav-results');
  list.innerHTML = '<li class="empty">Searching…</li>';
  try {
    if (!pos) await locate({ announce: false });
    const data = await getJSON(`/api/nav/search?q=${encodeURIComponent(q)}&lat=${pos.lat}&lon=${pos.lon}`);
    if (!data.results.length) {
      list.innerHTML = '<li class="empty">No places found nearby. Try another name.</li>';
      speak(`I couldn't find ${q} nearby.`);
      return;
    }
    list.innerHTML = data.results.map((r, i) => `<li><button data-i="${i}">
      <strong>${esc(r.name)}</strong><small>${esc(r.area || '')}</small><span class="dist">${r.distance_m != null ? short(r.distance_m) : ''}</span></button></li>`).join('');
    list._results = data.results;
    const top = data.results[0];
    speak(`${data.results.length} result${data.results.length === 1 ? '' : 's'}. Nearest: ${top.name}, ${metres(top.distance_m)} away. Tap a result to get directions.`);
  } catch (err) {
    list.innerHTML = `<li class="empty">${esc(err.message)}</li>`;
    speak(err.message);
  }
}

async function planRoute(target, { reroute = false } = {}) {
  dest = target;
  if (!reroute) {
    $('#nav-guide').hidden = false;
    $('#nav-dest-label').textContent = `TO ${target.name.toUpperCase()}`;
    $('#nav-instruction').textContent = 'Finding a walking route…';
    $('#nav-sub').textContent = '';
  }
  try {
    route = await getJSON(`/api/nav/route?flat=${pos.lat}&flon=${pos.lon}&tlat=${target.lat}&tlon=${target.lon}`);
    stepIdx = reroute ? 1 : 0;
    said = {};
    offCount = 0;
    drawRoute();
    renderSteps();
    $('#nav-whereis').disabled = false;
    const summary = `Walking route to ${target.name}: ${metres(route.distance)}, about ${route.minutes} minute${route.minutes === 1 ? '' : 's'}.`;
    $('#nav-instruction').textContent = route.steps[0].instruction;
    $('#nav-sub').textContent = `${short(route.distance)} · about ${route.minutes} min walk`;
    if (reroute) { speak(`New route. ${route.steps[Math.min(1, route.steps.length - 1)].instruction}.`); }
    else speak(`${summary} Tap Start guidance, or Simulated walk to try it here.`);
  } catch (err) {
    $('#nav-instruction').textContent = err.message;
    speak(err.message);
  }
}

const STEP_ICON = (s) => s.type === 'arrive' ? 'i-flag' : /left/.test(s.modifier) ? 'i-turn-left' : /right/.test(s.modifier) ? 'i-turn-right' : 'i-arrow-up';
function renderSteps() {
  $('#nav-steps').innerHTML = route.steps.map((s, i) => `<li class="${i < stepIdx ? 'done' : i === stepIdx ? 'current' : ''}">
    ${icon(STEP_ICON(s))}<span>${esc(s.instruction)}</span><small>${s.type === 'arrive' ? '' : `then ${short(s.distance)}`}</small></li>`).join('');
  $('#nav-steps .current')?.scrollIntoView({ block: 'nearest' });
}

/* ------------------------------------------------------------------ Guidance */
function startGuidance() {
  if (!route) return;
  unlockAudio();
  guiding = true;
  stepIdx = 1;
  said = {};
  $('#nav-start span').textContent = 'Stop guidance';
  $('#nav-start use').setAttribute('href', '#i-stop');
  const first = route.steps[0];
  speak(`Starting guidance to ${dest.name}. ${first.instruction}, for ${metres(first.distance)}.`);
  logEvent({ mode: 'navigation-mode', kind: 'route', source: sim ? 'demo' : 'live', text: `Guidance to ${dest.name}: ${short(route.distance)}, about ${route.minutes} min` });
  renderSteps();
  onPosition();
}
function stopGuidance(reason) {
  guiding = false;
  stopSim();
  $('#nav-start span').textContent = 'Start guidance';
  $('#nav-start use').setAttribute('href', '#i-play');
  if (reason) speak(reason);
}
function onPosition() {
  setBadge();
  if (!guiding || !route || !pos) return;
  const here = { lat: pos.lat, lon: pos.lon };
  const toDest = dist(here, dest);
  if (toDest < ARRIVE_M || stepIdx >= route.steps.length) {
    stopGuidance();
    cue(0, 'mid');
    vibrate([100, 60, 100, 60, 200]);
    const side = route.steps[route.steps.length - 1].modifier;
    speak(`You have arrived at ${dest.name}${side === 'left' || side === 'right' ? `, on your ${side}` : ''}.`);
    $('#nav-instruction').textContent = `Arrived at ${dest.name}`;
    $('#nav-sub').textContent = 'Guidance finished.';
    logEvent({ mode: 'navigation-mode', kind: 'route', source: pos.sim ? 'demo' : 'live', text: `Arrived at ${dest.name}` });
    return;
  }
  // Off route? Re-plan from here (not too often).
  if (distToRoute(here) > OFF_ROUTE_M) {
    offCount++;
    if (offCount >= 2 && Date.now() - lastReroute > 15000) {
      lastReroute = Date.now();
      vibrate([60, 60, 60]);
      speak('You are off the route. Finding a new way.');
      planRoute(dest, { reroute: true });
      return;
    }
  } else offCount = 0;

  const step = route.steps[stepIdx];
  const target = { lat: step.location[0], lon: step.location[1] };
  const d = dist(here, target);
  const flags = (said[stepIdx] ??= {});
  if (d < PASS_M) {
    // Never pass a turn without saying it (e.g. one that comes right after the start).
    if (!flags.near && step.type !== 'arrive') speak(`${step.instruction}.`, { interrupt: false });
    stepIdx++;
    renderSteps();
    return onPosition();
  }
  if (d < NEAR_M && !flags.near && step.type !== 'arrive') {
    flags.near = true;
    const pan = /left/.test(step.modifier) ? -0.8 : /right/.test(step.modifier) ? 0.8 : 0;
    cue(pan, 'mid');
    vibrate(pan < 0 ? [70] : pan > 0 ? [70, 60, 70] : [50]);
    speak(`${step.instruction} now.`);
  } else if (d < PREVIEW_M && d >= NEAR_M && !flags.preview && step.type !== 'arrive') {
    flags.preview = true;
    speak(`In ${metres(d)}, ${lc(step.instruction)}.`);
  }
  $('#nav-instruction').textContent = step.type === 'arrive' ? `${dest.name} in ${short(d)}` : `In ${short(d)}, ${lc(step.instruction)}`;
  $('#nav-sub').textContent = `${short(toDest)} to go${pos.sim ? ' · simulated walk' : ''}`;
}

/* ------------------------------------------------------------------ Simulated walk */
function toggleSim() {
  if (sim) { stopSim(); speak('Simulated walk stopped.'); return; }
  if (!route) return;
  unlockAudio();
  const g = route.geometry;
  sim = { idx: 0, along: 0, timer: 0 };
  pos = { lat: g[0][0], lon: g[0][1], accuracy: 0, sim: true };
  $('#nav-sim').setAttribute('aria-pressed', 'true');
  $('#nav-sim span').textContent = 'Stop simulation';
  drawMe();
  if (!guiding) startGuidance();
  sim.timer = setInterval(() => {
    let move = 1.3 * SIM_SPEED; // metres per tick (1 s)
    while (move > 0 && sim.idx < g.length - 1) {
      const a = { lat: g[sim.idx][0], lon: g[sim.idx][1] }, b = { lat: g[sim.idx + 1][0], lon: g[sim.idx + 1][1] };
      const seg = dist(a, b);
      const left = seg - sim.along;
      if (move < left) { sim.along += move; move = 0; }
      else { move -= left; sim.idx++; sim.along = 0; }
      heading = bearing(a, b);
    }
    if (sim.idx >= g.length - 1) { const e = g[g.length - 1]; pos = { lat: e[0], lon: e[1], accuracy: 0, sim: true }; }
    else {
      const a = g[sim.idx], b = g[sim.idx + 1];
      const seg = dist({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }) || 1;
      const t = sim.along / seg;
      pos = { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t, accuracy: 0, sim: true };
    }
    drawMe();
    map.panTo([pos.lat, pos.lon], { animate: true });
    onPosition();
  }, 1000);
}
function stopSim() {
  if (!sim) return;
  clearInterval(sim.timer);
  sim = null;
  $('#nav-sim').setAttribute('aria-pressed', 'false');
  $('#nav-sim span').textContent = 'Simulated walk';
  if (pos) pos.sim = false;
  drawMe();
  setBadge();
}

/* ------------------------------------------------------------------ Where am I / where is it */
async function whereAmI() {
  unlockAudio();
  try {
    if (!pos) await locate({ announce: false });
    const r = await getJSON(`/api/nav/reverse?lat=${pos.lat}&lon=${pos.lon}`);
    const text = `${posIsDemo && !pos.sim ? 'Demo location. ' : ''}${r.spoken}`;
    $('#nav-meta').textContent = r.label;
    speak(text);
    logEvent({ mode: 'navigation-mode', kind: 'info', source: posIsDemo || pos.sim ? 'demo' : 'live', text });
  } catch (err) { speak(err.message); }
}
function whereIsIt() {
  if (!dest || !pos) return;
  const d = dist(pos, dest);
  const b = bearing(pos, dest);
  const text = heading != null
    ? `${dest.name} is at ${clock(b - heading)} o'clock, ${metres(d)} away in a straight line.`
    : `${dest.name} is ${metres(d)} to the ${cardinal(b)}, in a straight line.`;
  speak(text);
  $('#nav-meta').textContent = text;
}

/* ------------------------------------------------------------------ Indoor demo (metro station) */
const INDOOR = [
  { title: 'Station entrance', text: 'You are at Gate 7 of Rajiv Chowk metro station. Ticket machines are 5 metres ahead on your right.', pan: 0.4 },
  { title: 'Ticket gates', text: 'Ticket gates in 8 metres. Use the wide gate on your far left; it is the accessible one. Tap your card on the reader at waist height, on the right side.', pan: -0.7 },
  { title: 'Lift to platforms', text: 'Lift on your left in 12 metres. Tactile paving leads to it. Take the lift down one level, to the Blue Line.', pan: -0.6 },
  { title: 'Platform 2', text: 'You are on Platform 2, Blue Line towards Dwarka. Yellow tactile strip ahead. The platform edge is 1 metre in front of you. Stop here.', pan: 0, warn: true },
  { title: 'Train arriving', text: 'Train to Dwarka Sector 21 arriving in 30 seconds. Doors will open on your right. The ladies\' coach is at the front.', pan: 0.6 },
  { title: 'Doors open', text: 'Doors are open, straight ahead. Mind the gap; step up about 5 centimetres. A seat is free on your left.', pan: 0, warn: true },
];
let indoorIdx = -1;
function renderIndoor() {
  $('#indoor-steps').innerHTML = INDOOR.map((s, i) => `<li class="${i < indoorIdx ? 'done' : i === indoorIdx ? 'current' : ''} ${s.warn ? 'warn' : ''}">
    <span class="num">${i + 1}</span><strong>${esc(s.title)}</strong>${esc(s.text)}</li>`).join('');
  const btn = $('#indoor-next span');
  btn.textContent = indoorIdx < 0 ? 'Start the walk-through' : indoorIdx >= INDOOR.length - 1 ? 'Walk-through finished' : 'Next step';
  $('#indoor-next').disabled = indoorIdx >= INDOOR.length - 1;
}
function indoorNext() {
  unlockAudio();
  if (indoorIdx >= INDOOR.length - 1) return;
  indoorIdx++;
  const s = INDOOR[indoorIdx];
  cue(s.pan, s.warn ? 'high' : 'mid');
  vibrate(s.warn ? [150, 80, 150] : [60]);
  speak(s.text);
  renderIndoor();
  if (indoorIdx === 0) logEvent({ mode: 'navigation-mode', kind: 'route', source: 'demo', text: 'Indoor guidance demo: Rajiv Chowk metro station' });
}

/* ------------------------------------------------------------------ Init */
export function initNavigation() {
  const onShow = () => {
    if (location.hash !== '#navigation-mode') return;
    ensureMap().then((m) => { setTimeout(() => m.invalidateSize(), 50); if (!pos) locate({ announce: false }); })
      .catch((err) => { $('#nav-meta').textContent = err.message; });
  };
  window.addEventListener('hashchange', onShow);
  onShow();

  $('#nav-locate').addEventListener('click', () => { unlockAudio(); stopSim(); locate(); });
  $('#nav-whereami').addEventListener('click', whereAmI);
  $('#nav-whereis').addEventListener('click', whereIsIt);
  $('#nav-search').addEventListener('submit', () => { const q = $('#nav-q').value.trim(); if (q.length >= 2) { unlockAudio(); search(q); } });
  $('#nav-results').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    stopGuidance();
    const picked = $('#nav-results')._results[Number(b.dataset.i)];
    $('#nav-results').innerHTML = '';   // keep the directions in view, not a long list
    planRoute(picked);
  });
  $('#nav-start').addEventListener('click', () => (guiding ? stopGuidance('Guidance stopped.') : startGuidance()));
  $('#nav-sim').addEventListener('click', toggleSim);
  $('#nav-cancel').addEventListener('click', () => {
    stopGuidance();
    route = null; dest = null;
    routeLine?.remove(); destMarker?.remove();
    $('#nav-guide').hidden = true;
    $('#nav-whereis').disabled = true;
  });
  $('#indoor-next').addEventListener('click', indoorNext);
  $('#indoor-reset').addEventListener('click', () => { indoorIdx = -1; renderIndoor(); });
  initCompass();
  renderIndoor();
}

/** Voice commands: "where am I" and "take me to …" (search, then route to the best match). */
export { whereAmI };
export async function goTo(query) {
  unlockAudio();
  try {
    await ensureMap();
    if (!pos) await locate({ announce: false });
    $('#nav-q').value = query;
    const data = await getJSON(`/api/nav/search?q=${encodeURIComponent(query)}&lat=${pos.lat}&lon=${pos.lon}`);
    if (!data.results.length) { speak(`I couldn't find ${query} nearby.`); return; }
    $('#nav-results').innerHTML = '';
    await planRoute(data.results[0]);
  } catch (err) { speak(err.message); }
}
