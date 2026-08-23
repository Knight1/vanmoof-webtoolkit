function int16(reg: number): number { return reg >= 0x8000 ? reg - 0x10000 : reg; }

export function celsius(reg: number): number { return (int16(reg) - 2731) / 10; }
export function milliAmps(reg: number): number { return int16(reg) * 10; }
export function volts(reg: number): number { return reg / 1000; }

export function flags16(reg: number, names: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    if (names[i] && names[i] !== 'RSVD' && (reg & (1 << i)) !== 0) out.push(names[i]!);
  }
  return out;
}

// Register 2 is a one-hot "state word": the firmware maps its internal state
// byte (g_bms_state) through report_arm_value (uart.c) to these values. 0x0000
// means a normal running state (idle/charge/discharge all collapse to 0). Names
// are from the decompiled protocol.md reg-2 table. The transform is lossy
// (0/1/2/4/5/6 all read 0x0000) and values can collide with the state-3 composed
// fault word, so treat this as a hint, not a precise fault decode.
const STATE_WORDS: Record<number, string> = {
  0x0000: 'Normal',
  0x0080: 'OVP1 (cell over-voltage)',
  0x0040: 'OVP2 (cell over-voltage)',
  0x0020: 'UVP1 (cell under-voltage)',
  0x0010: 'UVP2 (cell under-voltage)',
  0x0200: 'OVP1 recovery latch',
  0x0100: 'OVP2 recovery latch',
  0x0800: 'Protection (bit 6)',
  0x0400: 'Protection (bit 7)',
  0x0008: 'Protection (OVP recovery)',
  0x0004: 'Protection (OVP recovery)',
  0x0001: 'Pending protection',
  0x2000: 'Pack-1 over-voltage cutoff',
  0x1000: 'Pack-2 over-voltage cutoff',
  0x8000: 'Runtime OVP1 fault',
  0x4000: 'Runtime OVP2 fault',
  0x0002: 'Over-temperature fault',
  0xffff: 'MOS Failure - OC latched, secondary fuse FIRED',
  0x00c0: 'MOS Failure - hard protection',
  0x0030: 'Recoverable protection',
};

/** Decode register 2 (the state word). Unknown values (e.g. a composed fault
 *  word) fall back to hex. */
export function decodeStateWord(reg: number): string {
  return STATE_WORDS[reg & 0xffff] ?? '0x' + (reg & 0xffff).toString(16).padStart(4, '0');
}

export function decodeEsn(regs: Uint16Array, start: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < 7; i++) {
    const r = regs[start + i] ?? 0;
    bytes.push((r >> 8) & 0xff, r & 0xff);
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0+$/, '');
}

/**
 * Decode the manufacture date (registers hold bytes [_, YY, MM, DD]) and format
 * it in the runtime's locale - so a German OS shows DD.MM.YYYY and a US OS shows
 * MM/DD/YYYY. Pass an explicit `locale` for deterministic tests.
 */
export function decodeDate(regs: Uint16Array, start: number, locale?: string): string {
  const b: number[] = [];
  for (let i = 0; i < 2; i++) {
    const r = regs[start + i] ?? 0;
    b.push((r >> 8) & 0xff, r & 0xff);
  }
  const yy = b[1] ?? 0, mm = b[2] ?? 0, dd = b[3] ?? 0; // [_, YY, MM, DD]
  if (!yy || !mm || !dd) return '-';
  const date = new Date(2000 + yy, mm - 1, dd);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function imbalance(maxReg: number, minReg: number): number {
  return Math.abs(maxReg - minReg);
}
