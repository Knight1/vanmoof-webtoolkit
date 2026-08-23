import type { CellPack } from './types';
import { milliAmps, decodeStateWord } from './decoders';

export type SafetyLevel = 'warn' | 'error';
export interface SafetyIssue { level: SafetyLevel; message: string; }

// Documented S3 safety limits, from the firmware decompilation:
//   ../vanmoof-s3-decomp/batteryware/docs/protection-config.md  (cfg_blk)
//   ../vanmoof-s3-decomp/batteryware/docs/hardware.md           (secondary/fuse)
//   ../vanmoof-s3-decomp/batteryware/docs/fedl5236.md           (AFE short-circuit)
//
// Cell thresholds come from the power-on detection set (cfg_blk +0x2a..+0x46,
// millivolts) and the S-8215AAD hardware stage (4.35 V/cell, 2 s -> pyro fuse).
// The runtime byte comparators (protection-config.md section 2) are in an
// undecoded scale, so they are not used here. Temperature has no documented
// firmware protection threshold (AFE temp sensing is left disabled), so it is
// deliberately not checked.
export const LIMITS = {
  cellWarnHighMv: 4250,   // power-on OVP1 (cfg +0x2a)
  cellErrorHighMv: 4300,  // power-on OVP (cfg +0x32)
  cellFuseMv: 4350,       // S-8215AAD secondary: 4.35 V/cell for 2 s blows the fuse
  cellWarnLowMv: 3000,    // power-on UVP (cfg +0x3a)
  cellErrorLowMv: 2800,   // power-on UVP (cfg +0x42)
  packWarnHighMv: 42500,  // ~10 x cell warn-high
  packErrorHighMv: 43000, // ~10 x cell error-high
  packWarnLowMv: 30000,
  packErrorLowMv: 28000,  // ~10 x cell error-low
  imbalanceWarnMv: 20,    // cell-balance guidance (health heuristic, not a firmware trip)
  shortCircuitA: 150,     // AFE SCWDT: 150 mV shunt ~ 150 A @ 1 mOhm, autonomous cutoff
  socHighPct: 85,         // SOC-vs-voltage plausibility: implausibly high...
  socLowCellMv: 3600,     // ...while even the strongest cell is this low = miscalibrated gauge
} as const;

/** Evaluate the documented safety limits against a register snapshot. */
export function checkSafety(regs: Uint16Array, cells: CellPack): SafetyIssue[] {
  const issues: SafetyIssue[] = [];

  const values: number[] = [];
  for (let i = 0; i < cells.count; i++) values.push(regs[cells.addr + i] ?? 0);
  const present = values.filter((v) => v > 0);
  const packV = cells.packVoltageAddr !== undefined ? (regs[cells.packVoltageAddr] ?? 0) : 0;

  const noCells = present.length === 0;
  const noPack = cells.packVoltageAddr !== undefined && packV === 0;

  // No voltage data at all: we cannot assess safety, so warn instead of
  // implying everything is fine (a pack reporting 0 mV is asleep / not sampling).
  if (noCells && noPack) {
    return [{ level: 'warn', message: 'No voltage data - all cells and the pack read 0 mV (the battery may be asleep or the cells are not being sampled)' }];
  }
  if (noCells) {
    issues.push({ level: 'warn', message: 'No per-cell voltage data (all cells read 0 mV)' });
  }

  if (present.length) {
    const max = Math.max(...present);
    const min = Math.min(...present);
    const maxCell = values.indexOf(max) + 1;
    const minCell = values.indexOf(min) + 1;

    if (max >= LIMITS.cellFuseMv) {
      issues.push({ level: 'error', message: `Cell S${maxCell} at ${max} mV - above 4.35 V/cell a dedicated hardware chip (S-8215AAD) fires the pyro fuse after 2 s, permanently opening the pack` });
    } else if (max >= LIMITS.cellErrorHighMv) {
      issues.push({ level: 'error', message: `Cell S${maxCell} over-voltage: ${max} mV (limit ${LIMITS.cellErrorHighMv} mV)` });
    } else if (max >= LIMITS.cellWarnHighMv) {
      issues.push({ level: 'warn', message: `Cell S${maxCell} high: ${max} mV (warn at ${LIMITS.cellWarnHighMv} mV)` });
    }

    if (min <= LIMITS.cellErrorLowMv) {
      issues.push({ level: 'error', message: `Cell S${minCell} under-voltage: ${min} mV (limit ${LIMITS.cellErrorLowMv} mV)` });
    } else if (min <= LIMITS.cellWarnLowMv) {
      issues.push({ level: 'warn', message: `Cell S${minCell} low: ${min} mV (warn at ${LIMITS.cellWarnLowMv} mV)` });
    }

    const spread = max - min;
    if (spread > LIMITS.imbalanceWarnMv) {
      issues.push({ level: 'warn', message: `Cell imbalance ${spread} mV (warn over ${LIMITS.imbalanceWarnMv} mV)` });
    }

    // SOC-vs-voltage plausibility: a near-full gauge on a low pack = miscalibrated.
    if (cells.socAddr !== undefined) {
      const soc = regs[cells.socAddr] ?? 0;
      if (soc >= LIMITS.socHighPct && max <= LIMITS.socLowCellMv) {
        issues.push({ level: 'warn', message: `State-of-charge reads ${soc}% but cells are low (max ${max} mV) - the fuel gauge may be miscalibrated` });
      }
    }
  }

  if (cells.packVoltageAddr !== undefined) {
    const pack = regs[cells.packVoltageAddr] ?? 0;
    if (pack > 0) {
      if (pack >= LIMITS.packErrorHighMv) issues.push({ level: 'error', message: `Pack over-voltage: ${pack} mV (limit ${LIMITS.packErrorHighMv} mV)` });
      else if (pack >= LIMITS.packWarnHighMv) issues.push({ level: 'warn', message: `Pack voltage high: ${pack} mV` });
      else if (pack <= LIMITS.packErrorLowMv) issues.push({ level: 'error', message: `Pack under-voltage: ${pack} mV (limit ${LIMITS.packErrorLowMv} mV)` });
      else if (pack <= LIMITS.packWarnLowMv) issues.push({ level: 'warn', message: `Pack voltage low: ${pack} mV` });
    }
  }

  if (cells.currentAddr !== undefined) {
    const mA = milliAmps(regs[cells.currentAddr] ?? 0);
    const amps = Math.abs(mA) / 1000;
    if (amps >= LIMITS.shortCircuitA) {
      const dir = mA < 0 ? 'discharge' : 'charge';
      issues.push({ level: 'error', message: `Over-current (${dir}): ${amps.toFixed(0)} A - at/over the ${LIMITS.shortCircuitA} A short-circuit cutoff` });
    }
  }

  // Surface the firmware's own protection/fault state word so the banner agrees
  // with the State field (a fault/failure is an error, other protections a warning).
  if (cells.stateAddr !== undefined) {
    const state = regs[cells.stateAddr] ?? 0;
    if (state === 0xffff) {
      // Fuse fired: the BMS reports the secondary pyro fuse has blown. Hard flag.
      issues.push({ level: 'error', message: 'MOS Failure - the secondary fuse has FIRED (over-current / over-voltage latched). You need to replace the fuse AFTER all cells are below the threshold. Consult repair manual.' });
    } else if (state !== 0) {
      const label = decodeStateWord(state);
      issues.push({ level: /Failure|fault/.test(label) ? 'error' : 'warn', message: `BMS protection state: ${label}` });
    }
  }

  return issues;
}
