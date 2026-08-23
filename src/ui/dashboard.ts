import type { Device, Field } from '../devices/types';
import { renderCells } from './cells';

/** Pill styling for a few status fields; undefined = render as plain value. */
function pillClass(field: Field, value: string): string | undefined {
  if (field.name === 'Fault status') return value === 'OK' ? 'pill ok' : 'pill bad';
  if (field.name === 'Warnings') return value === 'None' ? 'pill ok' : 'pill warn';
  if (field.name === 'Discharging') return value === 'on' ? 'pill ok' : 'pill muted';
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

export function renderDashboard(container: HTMLElement, device: Device, regs: Uint16Array): void {
  const groups = new Map<string, Field[]>();
  for (const field of device.fields) {
    const arr = groups.get(field.group) ?? [];
    arr.push(field);
    groups.set(field.group, arr);
  }

  container.replaceChildren();
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
