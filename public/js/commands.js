// Spoken phrase → command, with no browser dependencies so it can be unit-tested in Node.
// voice.js turns each command into the matching action on the page.

export const PAGES = { overview: 'overview', home: 'overview', history: 'history', settings: 'device', device: 'device' };
export const MODES = {
  detection: 'detection', obstacle: 'detection', reading: 'reading', read: 'reading', payment: 'payment', money: 'payment',
  navigation: 'navigation-mode', map: 'navigation-mode', talk: 'talk', chat: 'talk',
};

/**
 * Understand a spoken phrase.
 * @param {string} phrase what speech recognition heard
 * @returns {{action: string, name: string, place?: string, hash?: string, page?: string, phrase?: string}}
 */
export function parseCommand(phrase) {
  const p = String(phrase).toLowerCase().replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  if (/^(stop|quiet|be quiet|silence|shut up|cancel)$/.test(p)) return { action: 'stop', name: 'stop' };
  if (/^(repeat|again|say (that|it) again|what did you say)$/.test(p)) return { action: 'repeat', name: 'repeat' };
  if (/^help$|what can (i|you) (say|do)|^commands$/.test(p)) return { action: 'help', name: 'help' };
  if (/(start|turn on|open|switch on) (the )?camera/.test(p)) return { action: 'camera-on', name: 'camera on' };
  if (/(stop|turn off|close|switch off) (the )?camera/.test(p)) return { action: 'camera-off', name: 'camera off' };
  if (/where am i|my location|where are we/.test(p)) return { action: 'where-am-i', name: 'where am I' };
  if ((m = p.match(/^(?:please )?(?:take me to|navigate to|directions to|guide me to|go to|how do i get to|find)\s+(?:(?:the|a|an|nearest|closest)\s+)*(.+)$/))
      && !PAGES[m[1]] && !MODES[m[1].replace(/ mode$/, '')]) {
    return { action: 'navigate', name: `navigate to ${m[1]}`, place: m[1] };
  }
  if (/\b(note|notes|banknote|cash|currency|rupee|rupees|money)\b/.test(p) && /(check|what|which|how much|identify|is this|count)/.test(p)) {
    return { action: 'banknote', name: 'banknote check' };
  }
  if (/\b(scan|qr|upi)\b/.test(p)) return { action: 'scan-qr', name: 'scan QR' };
  if (/^(read\b(?! mode)|what does (this|it|the sign|the label) say)/.test(p)) return { action: 'read', name: 'read' };
  if ((m = p.match(/^(?:open |go to |switch to |start )?(\w+) mode$/)) && MODES[m[1]]) {
    return { action: 'mode', name: `${m[1]} mode`, hash: MODES[m[1]] };
  }
  if (/^(start )?(detecting|detection|obstacle detection)$|what'?s ahead|any obstacles/.test(p)) {
    return { action: 'detection', name: 'detection' };
  }
  if ((m = p.match(/^(?:open |go to |show )?(?:the )?(overview|home|history|settings|device)$/))) {
    return { action: 'page', name: m[1], page: m[1], hash: PAGES[m[1]] };
  }
  return { action: 'question', name: 'question', phrase: String(phrase) };
}
