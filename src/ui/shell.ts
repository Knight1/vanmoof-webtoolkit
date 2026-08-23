import type { Device } from '../devices/types';
import type { Transport } from '../transport/types';
import { ModbusRtuClient } from '../protocol/modbus-rtu';
import { BMS_SCENARIOS } from '../transport/simulated-bms';

export interface ShellHandles { setStatus(text: string): void; content: HTMLElement; }

export function renderShell(root: HTMLElement, opts: {
  onConnect(mode: 'hardware' | 'simulated', scenario: string): void;
  onExpertToggle(on: boolean): void;
}): ShellHandles {
  root.replaceChildren();
  const bar = document.createElement('header');

  const connect = document.createElement('button');
  connect.textContent = 'Connect (hardware)';
  connect.onclick = () => opts.onConnect('hardware', scenario.value);

  const sim = document.createElement('button');
  sim.textContent = 'Connect (simulated)';
  sim.onclick = () => opts.onConnect('simulated', scenario.value);

  const scenarioLabel = document.createElement('label');
  const scenario = document.createElement('select');
  for (const s of BMS_SCENARIOS) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    scenario.appendChild(o);
  }
  scenarioLabel.append(document.createTextNode('Simulate: '), scenario);

  const expert = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.onchange = () => opts.onExpertToggle(cb.checked);
  expert.append(cb, document.createTextNode(' Expert mode'));

  const status = document.createElement('span');
  status.textContent = 'Disconnected';

  bar.append(connect, sim, scenarioLabel, expert, status);
  const content = document.createElement('main');
  root.append(bar, content);
  return { setStatus: (t) => { status.textContent = t; }, content };
}

export class Session {
  readonly client: ModbusRtuClient;
  private running = false;
  private paused = false;
  private cb: (regs: Uint16Array) => void = () => {};
  private errCb?: (count: number) => void;
  private errorCount = 0;
  constructor(private device: Device, private transport: Transport) {
    this.client = new ModbusRtuClient(transport, device.unitId);
  }
  onRegs(cb: (regs: Uint16Array) => void): void { this.cb = cb; }
  onError(cb: (count: number) => void): void { this.errCb = cb; }
  async start(): Promise<void> {
    await this.transport.open(this.device.serial);
    this.running = true;
    const block = this.device.reads[0]!;
    while (this.running) {
      if (!this.paused) {
        try {
          const regs = await this.client.readHolding(block.addr, block.qty);
          this.errorCount = 0;
          this.cb(regs);
        } catch {
          this.errorCount++;
          this.errCb?.(this.errorCount);
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  stop(): void { this.running = false; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
}
