import type { Device, Field } from '../devices/types';
import { renderCells } from './cells';
import { checkSafety, type SafetyIssue } from '../devices/safety';

function renderSafety(issues: SafetyIssue[]): HTMLElement {
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  const banner = document.createElement('section');
  banner.className = 'safety ' + (errors.length ? 'safety-error' : warns.length ? 'safety-warn' : 'safety-ok');

  const head = document.createElement('div');
  head.className = 'safety-head';
  head.textContent = errors.length
    ? `${errors.length} safety ${errors.length > 1 ? 'errors' : 'error'}`
    : warns.length
      ? `${warns.length} ${warns.length > 1 ? 'warnings' : 'warning'}`
      : 'All readings within documented safe limits';
  banner.append(head);

  if (issues.length) {
    const list = document.createElement('ul');
    list.className = 'safety-list';
    for (const issue of [...errors, ...warns]) {
      const li = document.createElement('li');
      li.className = 'lvl-' + issue.level;
      li.textContent = issue.message;
      list.append(li);
    }
    banner.append(list);
  }
  return banner;
}

/** Pill styling for a few status fields; undefined = render as plain value. */
function pillClass(field: Field, value: string): string | undefined {
  if (field.name === 'State') {
    if (value === 'Normal') return 'pill ok';
    return /Failure|fault/.test(value) ? 'pill bad' : 'pill warn';
  }
  if (field.name === 'Warnings') return value === 'None' ? 'pill ok' : 'pill warn';
  if (field.name === 'Discharging') return value === 'on' ? 'pill ok' : 'pill muted';
  if (field.name === 'Software version' || field.name === 'Bootloader version') {
    return value.includes('outdated') ? 'pill warn' : undefined;
  }
  return undefined;
}

function renderKvCard(group: string, fields: Field[], regs: Uint16Array): HTMLElement {
  const card = document.createElement('section');
  card.className = 'card';

  const h = document.createElement('h2');
  h.textContent = group;
  card.appendChild(h);

  const dl = document.createElement('dl');
  dl.className = 'kv';
  for (const field of fields) {
    const value = field.decode(regs);
    const row = document.createElement('div');
    row.className = 'kv-row';

    const dt = document.createElement('dt');
    dt.textContent = field.name;

    const dd = document.createElement('dd');
    const pc = pillClass(field, value);
    if (pc) {
      const pill = document.createElement('span');
      pill.className = pc;
      pill.textContent = value;
      dd.appendChild(pill);
    } else {
      dd.textContent = field.unit ? `${value} ${field.unit}` : value;
    }

    row.append(dt, dd);
    dl.appendChild(row);
  }
  card.appendChild(dl);
  return card;
}

export function renderDashboard(
  container: HTMLElement,
  device: Device,
  regs: Uint16Array,
  extraIssues: SafetyIssue[] = [],
): void {
  const groups = new Map<string, Field[]>();
  for (const field of device.fields) {
    const arr = groups.get(field.group) ?? [];
    arr.push(field);
    groups.set(field.group, arr);
  }

  container.replaceChildren();

  const issues = [...extraIssues, ...(device.cells ? checkSafety(regs, device.cells) : [])];
  if (issues.length || device.cells) {
    container.append(renderSafety(issues));
  }

  const grid = document.createElement('div');
  grid.className = 'dash-grid';

  for (const [group, fields] of groups) {
    if (group === 'Cells' && device.cells) {
      const card = document.createElement('section');
      card.className = 'card card-wide cells-card';
      const h = document.createElement('h2');
      h.textContent = 'Cells';
      card.appendChild(h);
      const body = document.createElement('div');
      renderCells(body, device.cells, regs);
      card.appendChild(body);
      grid.appendChild(card);
    } else {
      grid.appendChild(renderKvCard(group, fields, regs));
    }
  }

  container.appendChild(grid);
}
