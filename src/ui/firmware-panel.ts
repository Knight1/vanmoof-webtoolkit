import type { ModbusRtuClient } from '../protocol/modbus-rtu';
import { flashFirmware, FirmwareCrcError } from '../devices/firmware';

/**
 * Expert-only firmware update panel: pick a .bin, confirm, flash with a live
 * progress bar and log. The caller renders this only while polling is paused,
 * so the flash owns the serial link.
 */
export function renderFirmwarePanel(container: HTMLElement, client: ModbusRtuClient): HTMLElement {
  const wrap = document.createElement('section');

  const h = document.createElement('h2');
  h.textContent = 'Firmware update';
  wrap.append(h);

  const warn = document.createElement('p');
  warn.className = 'fw-warn';
  warn.textContent =
    '⚠ Flashing the wrong firmware can temporarily brick the BMS. Recovery is only possible via SWD. Only use a known-good .bin for this exact battery, check the crc32 and do not disconnect during the update.';
  wrap.append(warn);

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.bin,application/octet-stream';

  const flash = document.createElement('button');
  flash.textContent = 'Flash firmware';
  flash.dataset.danger = 'high';
  flash.disabled = true;

  const bar = document.createElement('div');
  bar.className = 'fw-bar';
  const barFill = document.createElement('div');
  barFill.className = 'fw-bar-fill';
  bar.append(barFill);

  const logEl = document.createElement('pre');
  const log = (m: string) => { logEl.textContent += m + '\n'; logEl.scrollTop = logEl.scrollHeight; };

  let bytes: Uint8Array | undefined;

  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) { bytes = undefined; flash.disabled = true; return; }
    bytes = new Uint8Array(await f.arrayBuffer());
    flash.disabled = false;
    barFill.style.width = '0%';
    log(`Selected ${f.name} (${bytes.length} bytes).`);
  };

  flash.onclick = async () => {
    const f = file.files?.[0];
    if (!bytes || !f) return;
    if (!window.confirm(
      `Flash "${f.name}" (${bytes.length} bytes) to the BMS?\n\n` +
      'This can permanently brick the battery if the firmware is wrong. Continue?',
    )) return;

    flash.disabled = true;
    file.disabled = true;
    try {
      await flashFirmware(client, bytes, {
        onProgress: (w, t) => { barFill.style.width = `${((w / t) * 100).toFixed(1)}%`; },
        onLog: log,
      });
    } catch (e) {
      log('✗ ' + (e as Error).message);
      if (e instanceof FirmwareCrcError) log('The BMS was not reset - you can safely retry.');
    } finally {
      file.disabled = false;
      flash.disabled = !bytes;
    }
  };

  wrap.append(file, flash, bar, logEl);
  container.append(wrap);
  return wrap;
}
