import type { SerialParams, Transport } from './types';
import { crc16 } from '../protocol/modbus-rtu';

const UNIT = 170;

/** Selectable fault/behaviour scenarios for hardware-free testing. */
export const BMS_SCENARIOS = [
  { id: 'healthy', label: 'Healthy pack' },
  { id: 'shutdown', label: 'BMS shutdown (protection)' },
  { id: 'faulty-cell', label: 'Faulty cell (undervoltage)' },
  { id: 'imbalanced', label: 'Imbalanced cells' },
  { id: 'overtemp', label: 'Over-temperature' },
  { id: 'short-circuit', label: 'Short-circuit (over-current)' },
  { id: 'fuse-fired', label: 'MOS Failure (fuse fired)' },
  { id: 'depleted', label: 'Depleted / low charge' },
  { id: 'overvoltage', label: 'Cell over-voltage' },
  { id: 'asleep', label: 'Asleep (cells read 0 mV)' },
  { id: 'outdated-fw', label: 'Outdated firmware' },
  { id: 'fw-crc-error', label: 'Firmware CRC error (test)' },
] as const;
export type BmsScenario = typeof BMS_SCENARIOS[number]['id'];

export class SimulatedBmsTransport implements Transport {
  isOpen = false;
  private regs: Uint16Array;
  private rx: number[] = [];

  constructor(init?: Uint16Array | BmsScenario) {
    this.regs = init instanceof Uint16Array
      ? init
      : typeof init === 'string' ? scenarioRegisters(init) : buildHealthy();
  }

  setRegister(addr: number, value: number): void { this.regs[addr] = value & 0xffff; }

  async open(_params: SerialParams): Promise<void> { this.isOpen = true; }
  async close(): Promise<void> { this.isOpen = false; }

  async write(bytes: Uint8Array): Promise<void> {
    // ASCII shell command? (no Modbus unit-id/func framing) → canned replies.
    const asAscii = new TextDecoder().decode(bytes);
    if (/^(PF=0|Log Clear|Reset ESN|Reset BMS|DSG CAL=|CHG CAL=|GPIO\.)/.test(asAscii)) {
      this.pushAscii(asciiReply(asAscii));
      return;
    }
    this.handleModbus(bytes);
  }

  async read(timeoutMs: number): Promise<Uint8Array> {
    if (this.rx.length === 0) await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 5)));
    const out = new Uint8Array(this.rx);
    this.rx = [];
    return out;
  }

  private pushFrame(body: number[]): void {
    const c = crc16(new Uint8Array(body));
    this.rx.push(...body, c & 0xff, (c >> 8) & 0xff);
  }

  private pushAscii(s: string): void {
    this.rx.push(...new TextEncoder().encode(s));
  }

  private handleModbus(f: Uint8Array): void {
    if (f[0] !== UNIT) return;
    const func = f[1];
    if (func === 0x03) {
      const addr = (f[2]! << 8) | f[3]!;
      const qty = (f[4]! << 8) | f[5]!;
      const body = [UNIT, 0x03, qty * 2];
      for (let i = 0; i < qty; i++) {
        const v = this.regs[addr + i] ?? 0;
        body.push((v >> 8) & 0xff, v & 0xff);
      }
      this.pushFrame(body);
    } else if (func === 0x06) {
      const addr = (f[2]! << 8) | f[3]!;
      this.regs[addr] = ((f[4]! << 8) | f[5]!) & 0xffff;
      this.pushFrame([...f.subarray(0, 6)]); // echo
    } else if (func === 0x10) {
      const addr = (f[2]! << 8) | f[3]!;
      const qty = (f[4]! << 8) | f[5]!;
      for (let i = 0; i < qty; i++) this.regs[addr + i] = ((f[7 + i * 2]! << 8) | f[8 + i * 2]!) & 0xffff;
      this.pushFrame([UNIT, 0x10, f[2]!, f[3]!, f[4]!, f[5]!]);
    }
  }
}

function asciiReply(cmd: string): string {
  if (cmd.startsWith('PF=0')) return 'OK\r\nI am VanMoof BL V007 2022-11-04 09:32:30\r\n';
  if (cmd.startsWith('Reset ESN')) return 'Done\r\n';
  if (cmd.startsWith('Log Clear')) return 'OK\r\n';
  return '\r\n';
}

function writeAscii(r: Uint16Array, start: number, s: string): void {
  for (let j = 0; j * 2 < s.length; j++) {
    r[start + j] = ((s.charCodeAt(j * 2) || 0) << 8) | (s.charCodeAt(j * 2 + 1) || 0);
  }
}

function setFlags(r: Uint16Array, addr: number, bits: number[]): void {
  let v = r[addr] ?? 0;
  for (const b of bits) v |= (1 << b);
  r[addr] = v & 0xffff;
}

function recomputeMinMax(r: Uint16Array): void {
  let min = 0xffff, max = 0;
  for (let i = 0; i < 10; i++) {
    const v = r[0x1b + i] ?? 0;
    if (v > 0) { if (v < min) min = v; if (v > max) max = v; }
  }
  r[0x29] = max;
  r[0x2a] = min === 0xffff ? 0 : min;
}

/** A realistic, fault-free S3 pack near full charge. */
function buildHealthy(): Uint16Array {
  const r = new Uint16Array(0x100);
  r[0x00] = 0x0100;                 // running (application mode) - constant
  r[0x01] = 0x0001;                 // AP liveness signature - constant
  r[0x02] = 0;                      // state word: Normal
  r[0x03] = 2731 + 180;             // battery 18.0 C
  r[0x04] = 42000;                  // pack 42.0 V
  r[0x05] = 96;                     // RSOC %
  r[0x06] = 0;                      // current (idle)
  r[0x08] = 0x8000;                 // discharging enabled
  r[0x0a] = 0x0003;                 // hardware version
  r[0x0b] = 0x0117;                 // software version (latest)
  writeAscii(r, 0x0c, 'VM13147K220012'); // 14-char serial number
  r[0x13] = 22;                     // manufacture year 2022 (byte)
  r[0x14] = (3 << 8) | 15;          // March 15
  r[0x16] = 12000;                  // full-charge capacity mAh
  r[0x17] = 11500;                  // remaining mAh
  r[0x18] = 95;                     // absolute SOC %
  r[0x19] = 84;                     // cycle count
  for (let i = 0; i < 10; i++) r[0x1b + i] = 4200 + (i % 3); // ~4.20 V/cell
  r[0x25] = 2731 + 190; r[0x26] = 2731 + 195; r[0x27] = 2731 + 210; // temps
  r[0x28] = 0;                      // no warnings
  r[0x2c] = 0x0007;                 // bootloader version (latest)
  recomputeMinMax(r);
  return r;
}

/**
 * Build a register set for a named scenario, so the UI can be exercised against
 * shutdowns, faulty/imbalanced cells, over-temperature, etc. without hardware.
 * Fault bit order: DOTP0 DUTP1 COTP2 CUTP3 DOCP1=4 DOCP2=5 COCP1=6 COCP2=7
 * OVP1=8 OVP2=9 UVP1=10 UVP2=11 PDOCP=12 PDSCP=13 MOTP=14 SCP=15.
 */
export function scenarioRegisters(id: BmsScenario): Uint16Array {
  const r = buildHealthy();
  switch (id) {
    case 'healthy':
      break;
    case 'shutdown': // protection tripped, output disabled, pack sagging
      r[0x02] = 0x0020;            // state word: Power-On UVP1
      r[0x08] = 0;                 // discharge off
      r[0x04] = 31000; r[0x05] = 4; r[0x18] = 3; r[0x17] = 400;
      for (let i = 0; i < 10; i++) r[0x1b + i] = 3100 + (i % 3);
      break;
    case 'faulty-cell': // one series group collapsed
      r[0x1e] = 1850;              // S4 far below the rest
      r[0x02] = 0x0020;            // Power-On UVP1
      r[0x08] = 0;
      break;
    case 'imbalanced': // one group sags but all still in range
      r[0x20] = 3850;              // S6 low
      break;
    case 'overtemp':
      r[0x03] = 2731 + 620; r[0x25] = 2731 + 610; r[0x26] = 2731 + 615; r[0x27] = 2731 + 720;
      r[0x02] = 0x0002;           // state word: over-temperature fault
      r[0x08] = 0;
      break;
    case 'short-circuit': // AFE short-circuit cutoff (~150 A)
      r[0x06] = 0xc568;          // int16 -15000 -> -150000 mA = -150 A discharge
      r[0x02] = 0x00c0;          // state word: MOS Failure - hard protection
      r[0x08] = 0;               // FETs opened
      break;
    case 'fuse-fired': // secondary pyro fuse has blown - pack permanently open
      r[0x02] = 0xffff;          // state word: MOS Failure, fuse fired
      r[0x08] = 0;               // output dead
      break;
    case 'depleted': // very low charge across the pack
      for (let i = 0; i < 10; i++) r[0x1b + i] = 2650 + (i % 3);
      r[0x04] = 26500; r[0x05] = 2; r[0x18] = 1; r[0x17] = 300;
      r[0x02] = 0x0010;            // Power-On UVP2
      setFlags(r, 0x28, [11]);     // SOC warning
      break;
    case 'overvoltage':
      r[0x1c] = 4380;              // S2 above the high threshold
      r[0x02] = 0x0080;            // Power-On OVP1
      break;
    case 'asleep': // BMS answers Modbus but the AFE is not sampling cells
      for (let i = 0; i < 10; i++) r[0x1b + i] = 0;
      r[0x04] = 0; r[0x06] = 0; // pack voltage + current read 0
      break;
    case 'outdated-fw': // older firmware to exercise the update warning
      r[0x0b] = 0x0107;            // software version below latest
      r[0x2c] = 0x0004;            // bootloader below latest
      break;
    case 'fw-crc-error':
      r[0x81] = 1;                 // firmware CRC check reports failure
      break;
  }
  recomputeMinMax(r);
  return r;
}
