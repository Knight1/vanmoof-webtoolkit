import type { Device, DeviceContext } from '../devices/types';

export function renderActionsPanel(container: HTMLElement, device: Device, ctx: DeviceContext): HTMLElement {
  const wrap = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = 'Expert actions';
  wrap.append(h);
  const log = document.createElement('pre');

  for (const action of device.actions) {
    const btn = document.createElement('button');
    btn.textContent = action.name;
    btn.dataset.danger = action.danger;
    btn.onclick = async () => {
      if (!window.confirm(action.confirm)) return;
      try {
        const result = await action.run(ctx);
        log.textContent += `✓ ${action.name}: ${result}\n`;
      } catch (e) {
        log.textContent += `✗ ${action.name}: ${(e as Error).message}\n`;
      }
      log.scrollTop = log.scrollHeight;
    };
    wrap.append(btn);
  }
  wrap.append(log);
  container.append(wrap);
  return wrap;
}
