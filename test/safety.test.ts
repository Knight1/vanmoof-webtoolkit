import { describe, it, expect } from 'vitest';
import { checkSafety, LIMITS } from '../src/devices/safety';
import { scenarioRegisters } from '../src/transport/simulated-bms';
import { s3Battery } from '../src/devices/s3-battery';

const cells = s3Battery.cells!;

function packRegs(cellMv: number[], packMv: number, currentReg = 0, socPct = 0): Uint16Array {
  const r = new Uint16Array(0x100);
  cellMv.forEach((v, i) => { r[cells.addr + i] = v; });
  r[cells.packVoltageAddr!] = packMv;
  r[cells.currentAddr!] = currentReg;
  r[cells.socAddr!] = socPct;
  return r;
}

const tenCells = (mv: number) => Array.from({ length: 10 }, () => mv);
const levels = (regs: Uint16Array) => checkSafety(regs, cells).map((i) => i.level);

describe('checkSafety', () => {
  it('reports nothing for a healthy balanced pack', () => {
    const regs = packRegs(tenCells(4000), 40000, 0);
    expect(checkSafety(regs, cells)).toEqual([]);
  });

  it('errors when a cell reaches the hardware fuse voltage', () => {
    const c = tenCells(4000); c[3] = LIMITS.cellFuseMv;
    const issues = checkSafety(packRegs(c, 40800), cells);
    expect(issues.some((i) => i.level === 'error' && /fuse/.test(i.message))).toBe(true);
  });

  it('errors on cell under-voltage', () => {
    const c = tenCells(4000); c[5] = LIMITS.cellErrorLowMv - 50;
    expect(levels(packRegs(c, 39500))).toContain('error');
  });

  it('warns on a cell above the high warn threshold', () => {
    const c = tenCells(4000); c[0] = LIMITS.cellWarnHighMv + 10;
    const issues = checkSafety(packRegs(c, 40300), cells);
    expect(issues.some((i) => i.level === 'warn')).toBe(true);
    expect(issues.some((i) => i.level === 'error')).toBe(false);
  });

  it('warns on cell imbalance', () => {
    const c = tenCells(4000); c[2] = 4000 + LIMITS.imbalanceWarnMv + 5;
    const issues = checkSafety(packRegs(c, 40000), cells);
    expect(issues.some((i) => /imbalance/.test(i.message))).toBe(true);
  });

  it('errors at/over the short-circuit current', () => {
    // reg = int16, current mA = reg * 10; 150 A = 150000 mA => reg 15000.
    const issues = checkSafety(packRegs(tenCells(4000), 40000, 15000), cells);
    expect(issues.some((i) => i.level === 'error' && /short-circuit/.test(i.message))).toBe(true);
  });

  it('flags the short-circuit scenario as an over-current error', () => {
    const issues = checkSafety(scenarioRegisters('short-circuit'), cells);
    expect(issues.some((i) => i.level === 'error' && /short-circuit/.test(i.message))).toBe(true);
  });

  it('surfaces the over-temperature fault state as a banner error', () => {
    const issues = checkSafety(scenarioRegisters('overtemp'), cells);
    expect(issues.some((i) => i.level === 'error' && /over-temperature/i.test(i.message))).toBe(true);
  });

  it('hard-flags a fired fuse (reg-2 state 0xFFFF) as an irreversible error', () => {
    const issues = checkSafety(scenarioRegisters('fuse-fired'), cells);
    const fuse = issues.find((i) => /fuse has FIRED/i.test(i.message));
    expect(fuse).toBeDefined();
    expect(fuse!.level).toBe('error');
    expect(fuse!.message).toMatch(/permanently open/i);
  });

  it('warns (never "safe") when all voltages read 0', () => {
    const issues = checkSafety(new Uint16Array(0x100), cells);
    expect(issues.length).toBe(1);
    expect(issues[0]!.level).toBe('warn');
    expect(issues[0]!.message).toMatch(/no voltage data/i);
  });

  it('warns when SOC is high but the cells are low (miscalibrated gauge)', () => {
    const issues = checkSafety(packRegs(tenCells(2860), 28600, 0, 99), cells);
    expect(issues.some((i) => /fuel gauge/.test(i.message))).toBe(true);
  });

  it('flags the depleted and over-voltage scenarios', () => {
    expect(levels(scenarioRegisters('depleted'))).toContain('error');
    expect(levels(scenarioRegisters('overvoltage'))).toContain('error');
    expect(checkSafety(scenarioRegisters('healthy'), cells)).toEqual([]);
  });
});
