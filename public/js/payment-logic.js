// Payment & currency logic with no browser dependencies, so it can be unit-tested in Node.
// Explains UPI payment codes (who it pays, which app, how much) and works out change.

// UPI handle → the app or bank it usually belongs to.
const HANDLES = {
  okaxis: 'Google Pay', oksbi: 'Google Pay', okhdfcbank: 'Google Pay', okicici: 'Google Pay',
  ybl: 'PhonePe', ibl: 'PhonePe', axl: 'PhonePe', paytm: 'Paytm', pthdfc: 'Paytm', ptsbi: 'Paytm', ptaxis: 'Paytm', ptyes: 'Paytm',
  apl: 'Amazon Pay', yapl: 'Amazon Pay', upi: 'BHIM', fbl: 'Federal Bank', sbi: 'SBI', hdfcbank: 'HDFC Bank', icici: 'ICICI Bank',
  axisbank: 'Axis Bank', kotak: 'Kotak', jupiteraxis: 'Jupiter', freecharge: 'Freecharge', waicici: 'WhatsApp Pay', wahdfcbank: 'WhatsApp Pay',
};

/** Format a rupee amount for display and speech, or null when it isn't a positive number. */
export function rupees(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  return { n, label: `₹${n.toLocaleString('en-IN', { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 })}`,
    spoken: `${whole.toLocaleString('en-IN')} rupee${whole === 1 ? '' : 's'}${paise ? ` and ${paise} paise` : ''}` };
}


/** Explain a scanned code ({ text, format }) for display and speech. */
export function parseCode(code) {
  const text = code.text.trim();
  if (/^upi:\/\/pay/i.test(text)) {
    const params = new URLSearchParams(text.slice(text.indexOf('?') + 1));
    const get = (k) => (params.get(k) || '').trim();
    const vpa = get('pa');
    const [handleUser, handle = ''] = vpa.split('@');
    const app = HANDLES[handle.toLowerCase()] ?? null;
    const amount = rupees(get('am'));
    const name = get('pn');
    const note = get('tn');
    const warnings = [];
    if (!vpa) warnings.push('This code has no UPI ID. Don\'t pay with it.');
    if (!name) warnings.push('The payee name isn\'t in the code. Ask the shopkeeper to confirm the UPI ID before paying.');
    if (get('cu') && get('cu').toUpperCase() !== 'INR') warnings.push(`The currency is ${get('cu')}, not rupees.`);
    const who = name || 'an unnamed payee';
    const spoken = [
      `UPI payment to ${who}.`,
      vpa ? `UPI ID ${handleUser.replace(/[._]/g, ' ')} at ${handle}${app ? `, a ${app} ID` : ''}.` : '',
      amount ? `Amount ${amount.spoken}.` : 'No amount is set. You will type the amount in your payment app.',
      note ? `Note: ${note}.` : '',
      warnings.length ? `Careful: ${warnings[0]}` : '',
    ].filter(Boolean).join(' ');
    return {
      kind: 'UPI payment', badge: 'live', title: who, amount, spoken, warnings,
      rows: [['UPI ID', vpa || '—'], ['App / bank', app ?? (handle ? `@${handle}` : '—')], ['Note', note || '—'], ['Currency', get('cu') || 'INR']],
      log: `UPI QR: ${who}${amount ? `, ${amount.label}` : ', no amount set'}`,
    };
  }
  if (/^https?:\/\//i.test(text)) {
    let host = text;
    try { host = new URL(text).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
    return {
      kind: 'Website link', badge: 'demo', title: host, amount: null,
      spoken: `This code opens a website: ${host.replace(/\./g, ' dot ')}. It is not a UPI payment code. Be careful before opening links from QR codes.`,
      warnings: ['Not a payment code. Scammers sometimes stick fake QR codes over real ones.'],
      rows: [['Website', host]], log: `QR link: ${host}`,
    };
  }
  if (/^(EAN|UPC|ITF)/i.test(code.format) || /^\d{8,14}$/.test(text)) {
    return {
      kind: 'Product barcode', badge: 'system', title: text, amount: null,
      spoken: `Product barcode ${text.split('').join(' ')}.`,
      warnings: [], rows: [['Format', code.format], ['Number', text]], log: `Barcode ${text}`,
    };
  }
  return {
    kind: code.format || 'Code', badge: 'system', title: text.slice(0, 60), amount: null,
    spoken: `This code contains text: ${text.slice(0, 160)}`, warnings: [],
    rows: [['Format', code.format]], log: `${code.format}: ${text.slice(0, 60)}`,
  };
}

export const NOTES = [500, 200, 100, 50, 20, 10];
export const COINS = [5, 2, 1];
/** Split an amount into the fewest Indian notes and coins. */
export function breakdown(amount) {
  let left = Math.round(amount);
  const parts = [];
  for (const d of [...NOTES, ...COINS]) {
    const n = Math.floor(left / d);
    if (n) { parts.push({ d, n, note: NOTES.includes(d) }); left -= n * d; }
  }
  return parts;
}
