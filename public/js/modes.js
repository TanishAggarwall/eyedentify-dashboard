// The five assistive modes from the EYEDENTIFY ONE concept.
export const MODES = [
  {
    id: 'detection',
    name: 'Real-time detection',
    short: 'Detection',
    icon: 'i-radar',
    desc: 'Alerts for people, vehicles and obstacles ahead, spoken into the ear they\'re closest to.',
    tile: 'Obstacles, people and vehicles',
    voice: ['detection', 'detect', 'obstacle', 'obstacles', 'what\'s in front'],
    planned: [
      'Live camera with boxes around people, vehicles, chairs, bags and other everyday objects, detected on the phone.',
      'Near / far estimate and a spoken cue panned to the left or right ear.',
      'Vibration on close obstacles.',
      'Stairs, curbs and drop-offs as labelled demo scenarios.',
    ],
  },
  {
    id: 'reading',
    name: 'Instant reading',
    short: 'Reading',
    icon: 'i-book',
    desc: 'Point at a sign, label, menu or page and hear it read aloud, or translated.',
    tile: 'Signs, labels, menus, books',
    voice: ['reading', 'read', 'text'],
    planned: [
      'Capture a frame or upload a photo, then recognise the text on the phone.',
      'Read aloud at 1.0× to 3.5× speed.',
      'Translate into a chosen language with the AI.',
    ],
  },
  {
    id: 'payment',
    name: 'Payment & currency',
    short: 'Payment',
    icon: 'i-wallet',
    desc: 'Scan UPI and merchant QR codes, check banknotes and work out your change.',
    tile: 'Banknotes, QR codes, change',
    voice: ['payment', 'pay', 'currency', 'money', 'cash', 'qr'],
    planned: [
      'Live UPI / merchant QR scanning that speaks the payee and amount.',
      'Banknote recognition with the AI.',
      'Change calculator.',
    ],
  },
  {
    id: 'navigation-mode',
    name: 'AI navigation',
    short: 'Navigation',
    icon: 'i-nav',
    desc: 'Spoken step-by-step directions outdoors, and guidance to lifts, exits and platforms indoors.',
    tile: 'Indoor and outdoor guidance',
    voice: ['navigation', 'navigate', 'directions', 'map', 'route'],
    planned: [
      'Map with your current location and spoken directions to a searched place.',
      'Indoor demo scenario: metro station platform edge, lift and exit.',
    ],
  },
  {
    id: 'talk',
    name: 'Talk AI',
    short: 'Talk AI',
    icon: 'i-talk',
    desc: 'Ask about what\'s in front of you, like "where are my keys?", and hear the answer.',
    tile: 'Ask about the scene',
    voice: ['talk', 'ask', 'question', 'assistant', 'where are my'],
    planned: [
      'Ask by voice or by typing about what the camera sees.',
      'The AI answers from the current camera frame, and the answer is spoken.',
      'Scripted answers when offline.',
    ],
  },
];

export const SYSTEM_VIEWS = {
  overview: { name: 'Overview', icon: 'i-home' },
  device: { name: 'Device & settings', icon: 'i-glasses' },
  history: { name: 'History', icon: 'i-clock' },
};

export const modeById = (id) => MODES.find((m) => m.id === id);
