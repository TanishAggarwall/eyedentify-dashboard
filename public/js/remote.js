// Laptop side of "use my phone as the camera".
// Opens a pairing session, shows a QR for the phone, then receives the phone's video: directly over
// WebRTC when possible, otherwise as JPEG frames relayed through the backend. Either way the video
// becomes the dashboard's camera (camera.useStream), so every mode works without changes.
import * as camera from './camera.js';
import { apiUrl } from './api.js';
import { ICE_SERVERS, DIRECT_TIMEOUT_MS, waitForIce, sleep } from './rtc.js';

/** Where the phone should go: the phone page next to this dashboard, with the pairing code. */
export function phoneUrl(code, base = location.href) {
  const u = new URL('phone.html', base);
  u.search = `c=${encodeURIComponent(code)}`;
  u.hash = '';
  return u.toString();
}

async function api(path, opts = {}) {
  const res = await fetch(apiUrl(path), { cache: 'no-store', ...opts });
  if (res.status === 404) throw Object.assign(new Error('The pairing session ended.'), { gone: true });
  return res;
}

/** Seconds without video from a connected phone before we call it lost (and the dashboard falls back to the webcam). */
const LOST_AFTER_MS = 8000;
/** After a live direct link drops: how long to wait for it to recover, then for relayed frames. */
const RECOVER_MS = 2000;
const LOST_AFTER_DROP_MS = 4000;

/**
 * Start pairing. `ui` receives progress:
 *   ui.code(code, url, qrSrc) · ui.status(text) · ui.connected(transport) · ui.error(text)
 *   ui.lost(reason) – the phone stopped sending after it was live · ui.ended() – pairing closed
 * Returns { code, cancel() }.
 */
export async function startPairing(ui) {
  let cancelled = false;
  let pc = null;
  let relaying = false;
  let handledOffer = '';
  let live = false;
  let lostReported = false;

  const res = await fetch(apiUrl('/api/remote/session'), { method: 'POST' });
  if (!res.ok) throw new Error('Could not start pairing. Check the connection and try again.');
  const { code } = await res.json();
  const url = phoneUrl(code);
  ui.code(code, url, apiUrl(`/api/qr?text=${encodeURIComponent(url)}`));
  ui.status('Waiting for the phone… scan the QR code with its camera.');

  function cleanup() {
    if (cancelled) return;
    cancelled = true;
    pc?.close();
    fetch(apiUrl(`/api/remote/${code}`), { method: 'DELETE', keepalive: true }).catch(() => {});
    ui.ended?.();
  }

  function lost(reason) {
    if (lostReported || cancelled || !live) return;
    lostReported = true;
    ui.lost?.(reason);
  }

  function goLive(stream, transport, size = {}) {
    camera.useStream(stream, { label: 'Paired phone camera', transport, ...size }, cleanup);
    if (!live) ui.connected(transport);
    else camera.updateRemoteInfo({ transport });
    live = true;
  }

  async function relay(lostAfter = LOST_AFTER_MS) {
    if (relaying || cancelled) return;
    relaying = true;
    ui.status('Direct video was blocked on this network. Receiving frames through the server instead…');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let stream = null;
    let seq = 0;
    let lastFrameAt = performance.now();
    while (!cancelled && relaying) {
      if (live && performance.now() - lastFrameAt > lostAfter) return lost('The phone stopped sending video.');
      try {
        const r = await api(`/api/remote/${code}/frame?after=${seq}`);
        if (r.status === 204) continue;
        lastFrameAt = performance.now();
        seq = Number(r.headers.get('X-Frame-Seq')) || seq + 1;
        const bmp = await createImageBitmap(await r.blob());
        if (canvas.width !== bmp.width || canvas.height !== bmp.height) { canvas.width = bmp.width; canvas.height = bmp.height; }
        ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        if (!stream) {
          stream = canvas.captureStream(15);
          goLive(stream, 'relay', { width: canvas.width, height: canvas.height });
        }
      } catch (err) {
        if (err.gone) { if (live) lost('The pairing session ended.'); else cleanup(); return; }
        await sleep(800);
      }
    }
  }

  async function answer(offer) {
    pc?.close();
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.addTransceiver('video', { direction: 'recvonly' });
    let remoteStream = null;
    pc.ontrack = (e) => { remoteStream = e.streams[0] || new MediaStream([e.track]); };
    const thisPc = pc;
    pc.onconnectionstatechange = () => {
      if (thisPc !== pc || cancelled) return;
      if (pc.connectionState === 'connected' && remoteStream) {
        relaying = false;
        goLive(remoteStream, 'webrtc');
      } else if (pc.connectionState === 'failed') {
        relay(live ? LOST_AFTER_DROP_MS : LOST_AFTER_MS);
      } else if (pc.connectionState === 'disconnected' && live) {
        // Often the phone's tab closed or it lost Wi-Fi; don't wait the 20+ s browsers take to call it failed.
        setTimeout(() => { if (thisPc === pc && pc.connectionState !== 'connected') relay(LOST_AFTER_DROP_MS); }, RECOVER_MS);
      }
    };
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);
    await api(`/api/remote/${code}/answer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pc.localDescription),
    });
    ui.status('Phone found. Connecting video…');
    setTimeout(() => { if (thisPc === pc && pc.connectionState !== 'connected') relay(); }, DIRECT_TIMEOUT_MS);
  }

  // Watch for the phone's offer (again later too, if the phone page is reloaded).
  (async () => {
    while (!cancelled) {
      try {
        const r = await api(`/api/remote/${code}/offer`);
        if (r.status === 200) {
          const offer = await r.json();
          if (offer.sdp !== handledOffer) {
            handledOffer = offer.sdp;
            await answer(offer);
          }
        } else if (!relaying && !live) {
          // No offer: the phone may not support WebRTC at all and be relaying frames already.
          const st = await (await api(`/api/remote/${code}/status`)).json();
          if (st.seq > 0) relay();
        }
      } catch (err) {
        if (err.gone) { if (live) lost('The pairing session ended.'); else { ui.error('The pairing code expired. Make a new one.'); cleanup(); } return; }
      }
      await sleep(live ? 3000 : 1000);
    }
  })();

  return { code, cancel: () => { if (live) camera.stop(); else cleanup(); } };
}
