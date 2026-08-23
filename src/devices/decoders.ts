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
