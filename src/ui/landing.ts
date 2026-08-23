/**
 * The centered screen shown before a battery is connected. When the browser
 * can't talk to serial devices, it explains which browsers work instead.
 */
export function renderLanding(container: HTMLElement, supported: boolean): void {
  container.replaceChildren();
  const wrap = document.createElement('section');
  wrap.className = 'landing';

  if (!supported) {
    renderUnsupported(wrap);
  } else {
    renderWelcome(wrap);
  }
  container.append(wrap);
}

function renderUnsupported(wrap: HTMLElement): void {
  const h = document.createElement('h1');
  h.textContent = "This browser isn't supported";

  const p = document.createElement('p');
  p.textContent =
    'The toolkit talks to your battery using Web Serial, which only works in Chromium-based desktop browsers.';

  const lead = document.createElement('p');
  lead.className = 'landing-muted';
  lead.textContent = 'Please open this page in one of:';

  const list = document.createElement('ul');
  list.className = 'landing-browsers';
  for (const b of ['Google Chrome', 'Microsoft Edge', 'Brave', 'Opera']) {
    const li = document.createElement('li');
    li.textContent = b;
    list.append(li);
  }

  const note = document.createElement('p');
  note.className = 'landing-muted';
  note.textContent = 'On a computer - not a phone or tablet. Firefox and Safari can’t connect.';

  wrap.append(h, p, lead, list, note);
}

function renderWelcome(wrap: HTMLElement): void {
  const h = document.createElement('h1');
  h.textContent = 'VanMoof Battery Toolkit';

  const lead = document.createElement('p');
  lead.textContent = 'Check your S3 / S4 battery’s health - cell by cell - right in your browser.';

  const stepsTitle = document.createElement('h2');
  stepsTitle.textContent = 'Get started';
  const steps = document.createElement('ol');
  steps.className = 'landing-steps';
  for (const t of [
    'Wire the battery to your PC with a USB-to-serial (UART) adapter.',
    'Click “Connect (hardware)” at the top and choose your adapter.',
    'Watch the live dashboard: cells, temperatures, charge and faults.',
  ]) {
    const li = document.createElement('li');
    li.textContent = t;
    steps.append(li);
  }

  const wiringTitle = document.createElement('h2');
  wiringTitle.textContent = 'How to wire it';

  const portCaption = document.createElement('p');
  portCaption.className = 'landing-muted';
  portCaption.textContent = 'The battery’s external port (pins):';
  const port = document.createElement('pre');
  port.className = 'landing-port';
  port.textContent = [
    ' -----------------------------',
    ' \\ TEST | DET | TX | KEY_IN /',
    '  \\  FAULT  |  GND  |  RX  /',
    '   \\     CHG+  |  CHG-    /',
    '    \\    DSG-  |  DSG+   /',
    '     --------------------',
  ].join('\n');

  const wiring = document.createElement('div');
  wiring.className = 'landing-wiring';
  const pairs: [string, string][] = [
    ['Adapter RX', 'Battery TX'],
    ['Adapter TX', 'Battery RX'],
    ['Adapter GND', 'Battery GND'],
    ['Battery TEST', 'GND - keeps it awake'],
  ];
  for (const [from, to] of pairs) {
    const row = document.createElement('div');
    row.className = 'wire-row';
    const a = document.createElement('span'); a.className = 'from'; a.textContent = from;
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
    const b = document.createElement('span'); b.className = 'to'; b.textContent = to;
    row.append(a, arrow, b);
    wiring.append(row);
  }

  const wnote = document.createElement('p');
  wnote.className = 'landing-muted';
  wnote.textContent =
    '9600 baud, 8-N-1. If TEST isn’t grounded the battery stays asleep and won’t answer.';

  wrap.append(h, lead, stepsTitle, steps, wiringTitle, portCaption, port, wiring, wnote);
}
