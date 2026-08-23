import type { CellPack } from '../devices/types';

export type CellColor = 'green' | 'yellow' | 'red';

/** Fill level 0..100 for a cell voltage within the pack's [minMv, maxMv] window. */
export function fillPercent(mv: number, minMv: number, maxMv: number): number {
  if (maxMv <= minMv) return 0;
  const pct = ((mv - minMv) / (maxMv - minMv)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Traffic-light colour for a cell by charge level within the pack window. */
export function cellColor(mv: number, minMv: number, maxMv: number): CellColor {
  if (mv <= 0) return 'red';
  const pct = fillPercent(mv, minMv, maxMv);
  if (pct >= 60) return 'green';
  if (pct >= 30) return 'yellow';
  return 'red';
}

function fmtVolts(mv: number): string {
  return (mv / 1000).toFixed(2);
}

/**
 * Render the cell pack as a series string of battery-cell icons, each filled by
 * voltage and coloured by health. The weakest (min) and strongest (max) groups
 * are marked. Pure DOM; call again with fresh regs to update.
 */
export function renderCells(container: HTMLElement, pack: CellPack, regs: Uint16Array): void {
  const values: number[] = [];
  for (let i = 0; i < pack.count; i++) values.push(regs[pack.addr + i] ?? 0);

  const present = values.filter((v) => v > 0);
  const min = present.length ? Math.min(...present) : 0;
  const max = present.length ? Math.max(...present) : 0;
  const spread = max - min;

  container.replaceChildren();

  const head = document.createElement('div');
  head.className = 'cells-head';

  const title = document.createElement('div');
  title.className = 'cells-title';
  const packLabel = document.createElement('span');
  packLabel.className = 'cells-pack-label';
  packLabel.textContent = pack.packLabel;
  title.appendChild(packLabel);
  const packV = pack.packVoltageAddr !== undefined ? regs[pack.packVoltageAddr] ?? 0 : 0;
  if (packV) {
    const packVEl = document.createElement('span');
    packVEl.className = 'cells-pack-v';
    packVEl.textContent = `${fmtVolts(packV)} V`;
    title.append(' ', packVEl);
  }
  head.appendChild(title);

  const stats = document.createElement('div');
  stats.className = 'cells-stats';
  const stat = (label: string, value: number, cls?: string): HTMLElement => {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    const b = document.createElement('b');
    b.textContent = String(value);
    s.append(`${label} `, b, ' mV');
    return s;
  };
  stats.append(
    stat('min', min),
    stat('max', max),
    stat('spread', spread, spread > 20 ? 'bad' : 'good'),
  );
  head.appendChild(stats);

  container.appendChild(head);

  const note = document.createElement('div');
  note.className = 'cells-note';
  note.textContent = `${pack.count} series groups · each ${pack.parallel} cells in parallel`;
  container.appendChild(note);

  const row = document.createElement('div');
  row.className = 'cells-row' + (pack.layout === 'u' ? ' cells-u' : '');

  values.forEach((mv, i) => {
    const color = cellColor(mv, pack.minMv, pack.maxMv);
    const pct = fillPercent(mv, pack.minMv, pack.maxMv);

    const cell = document.createElement('div');
    cell.className = 'cell';
    if (mv > 0 && mv === min) cell.classList.add('weak');
    if (mv > 0 && mv === max) cell.classList.add('strong');

    const battery = document.createElement('div');
    battery.className = 'cell-battery';

    const nub = document.createElement('div');
    nub.className = 'cell-nub';

    const body = document.createElement('div');
    body.className = 'cell-body';
    const fill = document.createElement('div');
    fill.className = `cell-fill ${color}`;
    fill.style.height = `${pct}%`;
    body.appendChild(fill);

    battery.append(nub, body);

    const value = document.createElement('div');
    value.className = 'cell-value';
    value.textContent = mv > 0 ? String(mv) : '—';

    const label = document.createElement('div');
    label.className = 'cell-label';
    label.textContent = `S${i + 1}`;

    cell.append(battery, value, label);
    row.appendChild(cell);
  });

  container.appendChild(row);
}
