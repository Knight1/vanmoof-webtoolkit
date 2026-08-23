/**
 * The centered screen shown before a battery is connected. When the browser
 * can't talk to serial devices, it explains which browsers work instead.
 */
export function renderLanding(container: HTMLElement, supported: boolean): void {
  container.replaceChildren();
  const wrap = document.createElement('section');
  // The unsupported screen is centered both horizontally and vertically.
  wrap.className = supported ? 'landing' : 'landing landing-center';

  if (!supported) {
    renderUnsupported(wrap);
  } else {
    renderWelcome(wrap);
  }
  container.append(wrap);
}

/** Shown when the BMS stops answering reads, so stale/0 values are not left on screen. */
export function renderNotResponding(container: HTMLElement, seconds: number): void {
  container.replaceChildren();
  const wrap = document.createElement('section');
  wrap.className = 'landing landing-center';

  const emoji = document.createElement('div');
  emoji.className = 'landing-emoji';
  emoji.textContent = '📡';

  const h = document.createElement('h1');
  h.textContent = 'BMS not responding';

  const p = document.createElement('p');
  p.textContent = `No reply from the battery after about ${seconds}s. Retrying...`;

  const tipsTitle = document.createElement('h2');
  tipsTitle.textContent = 'Troubleshooting';
  const tips = document.createElement('ol');
  tips.className = 'landing-steps';
  for (const t of [
    'Ground the TEST pin - the BMS sleeps and ignores Modbus until TEST is tied to GND.',
    'Check RX/TX are crossed (adapter RX to battery TX, adapter TX to battery RX) and GND is shared.',
    'Make sure the adapter is 3.3 V logic and the pack has voltage on the discharge port.',
    'Confirm you picked the right serial adapter when connecting.',
  ]) {
    const li = document.createElement('li');
    li.textContent = t;
    tips.append(li);
  }

  wrap.append(emoji, h, p, tipsTitle, tips);
  container.append(wrap);
}

function renderUnsupported(wrap: HTMLElement): void {
  const emoji = document.createElement('div');
  emoji.className = 'landing-emoji';
  emoji.textContent = '😕';

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

  wrap.append(emoji, h, p, lead, list, note);
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
  const port = renderPortDiagram();
  const portLegend = renderPortLegend();

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

  wrap.append(h, lead, stepsTitle, steps, wiringTitle, portCaption, port, portLegend, wiring, wnote);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

interface Pin { label: string; cx: number; cy: number; color: string; }

// Pin positions match the battery's external port: a downward-narrowing
// connector with rows of 4, 3, 2, 2 pins. Colours group pins by function.
const PIN_DATA = '#38bdf8';       // TX / RX
const PIN_CONTROL = '#fbbf24';    // TEST / DET / KEY_IN / FAULT
const PIN_GROUND = '#94a3b8';     // GND
const PIN_CHARGE = '#34d399';     // CHG+ / CHG-
const PIN_DISCHARGE = '#60a5fa';  // DSG+ / DSG-

const PORT_PINS: Pin[] = [
  { label: 'TEST', cx: 85, cy: 75, color: PIN_CONTROL },
  { label: 'DET', cx: 155, cy: 75, color: PIN_CONTROL },
  { label: 'TX', cx: 225, cy: 75, color: PIN_DATA },
  { label: 'KEY_IN', cx: 295, cy: 75, color: PIN_CONTROL },
  { label: 'FAULT', cx: 120, cy: 125, color: PIN_CONTROL },
  { label: 'GND', cx: 190, cy: 125, color: PIN_GROUND },
  { label: 'RX', cx: 260, cy: 125, color: PIN_DATA },
  { label: 'CHG+', cx: 150, cy: 175, color: PIN_CHARGE },
  { label: 'CHG-', cx: 230, cy: 175, color: PIN_CHARGE },
  { label: 'DSG-', cx: 150, cy: 222, color: PIN_DISCHARGE },
  { label: 'DSG+', cx: 230, cy: 222, color: PIN_DISCHARGE },
];

function renderPortDiagram(): SVGElement {
  const w = 60, h = 30;
  const svg = svgEl('svg', {
    viewBox: '0 0 380 270',
    class: 'port-svg',
    role: 'img',
    'aria-label': 'Battery external port pinout',
  });
  svg.appendChild(svgEl('polygon', { points: '30,30 350,30 290,250 90,250', class: 'port-housing' }));
  for (const p of PORT_PINS) {
    svg.appendChild(svgEl('rect', {
      x: p.cx - w / 2, y: p.cy - h / 2, width: w, height: h, rx: 6, fill: p.color,
    }));
    const text = svgEl('text', {
      x: p.cx, y: p.cy + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'port-pin-label',
    });
    text.textContent = p.label;
    svg.appendChild(text);
  }
  return svg;
}

function renderPortLegend(): HTMLElement {
  const legend = document.createElement('div');
  legend.className = 'port-legend';
  const items: [string, string][] = [
    [PIN_DATA, 'Data (TX/RX)'],
    [PIN_CONTROL, 'Control / status'],
    [PIN_GROUND, 'Ground'],
    [PIN_CHARGE, 'Charge'],
    [PIN_DISCHARGE, 'Discharge'],
  ];
  for (const [color, label] of items) {
    const span = document.createElement('span');
    const dot = document.createElement('i');
    dot.className = 'dot';
    dot.style.background = color;
    span.append(dot, document.createTextNode(' ' + label));
    legend.append(span);
  }
  return legend;
}
