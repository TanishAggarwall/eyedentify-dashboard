// The phone's back camera stands in for the glasses' camera: either this device's own camera,
// or a phone paired to this laptop (see remote.js), whose stream is plugged in with useStream().
let stream = null;
let info = { label: '', facing: '', width: 0, height: 0, remote: false, transport: '' };
let onRemoteStop = null;
const listeners = new Set();
const attached = new Set();

export const cameraSupported = Boolean(navigator.mediaDevices?.getUserMedia);
export function isLive() { return Boolean(stream?.active); }
export function isRemote() { return Boolean(stream && info.remote); }
export function getInfo() { return { ...info }; }
export function getStream() { return stream; }
export function onCameraChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach((fn) => fn(isLive())); }

/** Show the live stream in a <video>. Safe to call before or after start(). */
export function attach(video) {
  attached.add(video);
  if (stream) { video.srcObject = stream; video.play().catch(() => {}); }
}

export async function start() {
  if (isLive()) return;
  if (!window.isSecureContext) {
    throw new Error('The camera only works over HTTPS (or on localhost). Open the dashboard from its https:// address.');
  }
  if (!cameraSupported) throw new Error('This browser does not support camera access.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
    });
  } catch (err) {
    stream = null;
    if (err.name === 'NotAllowedError') throw new Error('Camera permission was blocked. Allow camera access for this site in the browser settings, then try again.');
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') throw new Error('No camera was found on this device.');
    if (err.name === 'NotReadableError') throw new Error('The camera is being used by another app. Close it and try again.');
    throw new Error(`The camera could not start (${err.name || 'unknown error'}).`);
  }
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings?.() ?? {};
  info = {
    label: track.label || 'Camera',
    facing: settings.facingMode || '',
    width: settings.width || 0,
    height: settings.height || 0,
    remote: false,
    transport: '',
  };
  track.addEventListener('ended', () => { stop(); });
  attached.forEach((v) => { v.srcObject = stream; v.play().catch(() => {}); });
  notify();
}

/**
 * Use a stream that comes from elsewhere (a paired phone) as the camera.
 * @param {MediaStream} remoteStream
 * @param {{label?: string, transport?: string, width?: number, height?: number}} meta
 * @param {() => void} [onStop] called once when the camera is stopped, to close the connection
 */
export function useStream(remoteStream, meta = {}, onStop = null) {
  if (stream && stream !== remoteStream) {
    // Same connection switching transport (direct → relay): keep it open. Anything else: close the old one.
    const previousStop = onRemoteStop === onStop ? null : onRemoteStop;
    onRemoteStop = null;
    stream.getTracks().forEach((t) => t.stop());
    previousStop?.();
  }
  stream = remoteStream;
  onRemoteStop = onStop;
  info = {
    label: meta.label || 'Phone camera',
    facing: 'environment',
    width: meta.width || 0,
    height: meta.height || 0,
    remote: true,
    transport: meta.transport || '',
  };
  remoteStream.getVideoTracks()[0]?.addEventListener('ended', () => { if (stream === remoteStream) stop(); });
  attached.forEach((v) => { v.srcObject = stream; v.play().catch(() => {}); });
  notify();
}

/** Update details (size, transport) of the current remote stream without restarting it. */
export function updateRemoteInfo(meta) {
  if (!info.remote) return;
  info = { ...info, ...meta };
  notify();
}

export function stop() {
  const remoteStop = onRemoteStop;
  onRemoteStop = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  info = { label: '', facing: '', width: 0, height: 0, remote: false, transport: '' };
  remoteStop?.();
  attached.forEach((v) => { v.srcObject = null; });
  notify();
}

/**
 * Grab the current frame as a canvas (used by later modes: reading, QR, Talk AI).
 * @param {number} [maxSide=1280] longest side in pixels
 */
export function grabFrame(video, maxSide = 1280) {
  if (!video?.videoWidth) return null;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c;
}
