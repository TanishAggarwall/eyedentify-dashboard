// Unit tests for the dashboard's browser-free logic. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCode, rupees, breakdown } from '../public/js/payment-logic.js';
import { parseCommand } from '../public/js/commands.js';

/* ------------------------------------------------------------------ UPI and codes */

test('UPI code: payee, app, amount and spoken summary', () => {
  const info = parseCode({ text: 'upi://pay?pa=sharma.bakery@okaxis&pn=Sharma%20Bakery&am=120&cu=INR&tn=Bread', format: 'QRCode' });
  assert.equal(info.kind, 'UPI payment');
  assert.equal(info.title, 'Sharma Bakery');
  assert.equal(info.amount.n, 120);
  assert.equal(info.amount.label, '₹120');
  assert.deepEqual(info.warnings, []);
  assert.match(info.spoken, /UPI payment to Sharma Bakery\./);
  assert.match(info.spoken, /UPI ID sharma bakery at okaxis, a Google Pay ID\./);
  assert.match(info.spoken, /Amount 120 rupees\./);
  assert.match(info.spoken, /Note: Bread\./);
});

test('UPI code without amount tells the user to type it', () => {
  const info = parseCode({ text: 'upi://pay?pa=shop@ybl&pn=Shop', format: 'QRCode' });
  assert.equal(info.amount, null);
  assert.match(info.spoken, /No amount is set/);
  assert.equal(info.rows.find(([k]) => k === 'App / bank')[1], 'PhonePe');
});

test('UPI code warnings: missing name, missing ID, foreign currency', () => {
  assert.match(parseCode({ text: 'upi://pay?pa=x@paytm', format: 'QRCode' }).warnings[0], /payee name isn't in the code/);
  assert.match(parseCode({ text: 'upi://pay?pn=Someone', format: 'QRCode' }).warnings[0], /no UPI ID/);
  assert.ok(parseCode({ text: 'upi://pay?pa=x@upi&pn=A&cu=USD', format: 'QRCode' }).warnings.some((w) => /USD/.test(w)));
});

test('Website QR is flagged as not a payment', () => {
  const info = parseCode({ text: 'https://www.example.com/pay', format: 'QRCode' });
  assert.equal(info.kind, 'Website link');
  assert.equal(info.title, 'example.com');
  assert.match(info.spoken, /not a UPI payment code/);
});

test('Product barcode digits are read one by one', () => {
  const info = parseCode({ text: '8901234567890', format: 'EAN13' });
  assert.equal(info.kind, 'Product barcode');
  assert.match(info.spoken, /8 9 0 1 2/);
});

test('rupees(): formats Indian grouping and paise, rejects bad values', () => {
  assert.equal(rupees(150000).label, '₹1,50,000');
  assert.equal(rupees(1).spoken, '1 rupee');
  assert.equal(rupees(10.5).spoken, '10 rupees and 50 paise');
  assert.equal(rupees(0), null);
  assert.equal(rupees(-5), null);
  assert.equal(rupees('abc'), null);
});

/* ------------------------------------------------------------------ Change calculator */

test('breakdown(): fewest notes and coins', () => {
  assert.deepEqual(breakdown(380), [
    { d: 200, n: 1, note: true }, { d: 100, n: 1, note: true }, { d: 50, n: 1, note: true },
    { d: 20, n: 1, note: true }, { d: 10, n: 1, note: true },
  ]);
  assert.deepEqual(breakdown(8), [{ d: 5, n: 1, note: false }, { d: 2, n: 1, note: false }, { d: 1, n: 1, note: false }]);
  assert.deepEqual(breakdown(1000), [{ d: 500, n: 2, note: true }]);
  assert.deepEqual(breakdown(0), []);
});

test('breakdown(): parts always add up to the amount', () => {
  for (const amount of [1, 7, 99, 388, 1234, 4999]) {
    const total = breakdown(amount).reduce((sum, { d, n }) => sum + d * n, 0);
    assert.equal(total, amount, `amount ${amount}`);
  }
});

/* ------------------------------------------------------------------ Voice commands */

const cases = [
  ['stop', { action: 'stop' }],
  ['Repeat.', { action: 'repeat' }],
  ['help', { action: 'help' }],
  ['what can I say', { action: 'help' }],
  ['turn on the camera', { action: 'camera-on' }],
  ['switch off camera', { action: 'camera-off' }],
  ['Where am I?', { action: 'where-am-i' }],
  ['take me to India Gate', { action: 'navigate', place: 'india gate' }],
  ['find the nearest pharmacy', { action: 'navigate', place: 'pharmacy' }],
  ['check this note', { action: 'banknote' }],
  ['how much money is this', { action: 'banknote' }],
  ['scan QR code', { action: 'scan-qr' }],
  ['read this', { action: 'read' }],
  ['what does the sign say', { action: 'read' }],
  ['reading mode', { action: 'mode', hash: 'reading' }],
  ['go to navigation mode', { action: 'mode', hash: 'navigation-mode' }],
  ['money mode', { action: 'mode', hash: 'payment' }],
  ['detection', { action: 'detection' }],
  ["what's ahead", { action: 'detection' }],
  ['open history', { action: 'page', hash: 'history' }],
  ['settings', { action: 'page', hash: 'device' }],
  ['go to history', { action: 'page', hash: 'history' }],
];
for (const [phrase, expected] of cases) {
  test(`voice: "${phrase}" → ${expected.action}`, () => {
    const cmd = parseCommand(phrase);
    for (const [k, v] of Object.entries(expected)) assert.equal(cmd[k], v, `${k} for "${phrase}"`);
  });
}

test('voice: anything else becomes a Talk AI question, keeping the original words', () => {
  const cmd = parseCommand('Is the door open?');
  assert.equal(cmd.action, 'question');
  assert.equal(cmd.phrase, 'Is the door open?');
});
