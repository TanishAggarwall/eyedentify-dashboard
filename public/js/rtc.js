// Shared WebRTC settings for pairing a phone camera with the laptop dashboard.

/** Public STUN servers let two devices on different networks find a direct path. */
export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/** How long to wait for a direct WebRTC connection before falling back to relaying frames. */
export const DIRECT_TIMEOUT_MS = 10000;

/**
 * Wait until ICE candidate gathering finishes (or `ms` passes), so the offer/answer we send
 * already contains every candidate and no separate candidate exchange is needed.
 */
export function waitForIce(pc, ms = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); clearTimeout(timer); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
