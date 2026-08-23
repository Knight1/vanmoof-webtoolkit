import { describe, it, expect } from 'vitest';
import { s3Battery, versionLabel, LATEST_SW, LATEST_BL } from '../src/devices/s3-battery';
import { SimulatedBmsTransport, scenarioRegisters } from '../src/transport/simulated-bms';
import { ModbusRtuClient } from '../src/protocol/modbus-rtu';

describe('s3Battery device', () => {
  it('has the right serial params and unit id', () => {
    expect(s3Battery.serial).toEqual({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    expect(s3Battery.unitId).toBe(170);
  });

  it('decodes seeded simulator values via its fields', async () => {
    const sim = new SimulatedBmsTransport();
    await sim.open(s3Battery.serial);
    const client = new ModbusRtuClient(sim, s3Battery.unitId);
    const regs = await client.readHolding(s3Battery.reads[0]!.addr, s3Battery.reads[0]!.qty);

    const pack = s3Battery.fields.find((f) => f.addr === 0x04)!;
    expect(pack.decode(regs)).toBe('42'); // volts(42000)

    const state = s3Battery.fields.find((f) => f.addr === 0x02)!;
    expect(state.decode(regs)).toBe('Normal'); // reg 2 state word, 0 = Normal
  });

  it('every action has a confirm string', () => {
    for (const a of s3Battery.actions) expect(a.confirm.length).toBeGreaterThan(0);
  });

  it('flags an outdated software/bootloader version', () => {
    expect(versionLabel(0x0107, LATEST_SW)).toContain('outdated');
    expect(versionLabel(0x0004, LATEST_BL)).toContain('outdated');
    expect(versionLabel(LATEST_SW, LATEST_SW)).not.toContain('outdated');
    expect(versionLabel(LATEST_BL, LATEST_BL)).not.toContain('outdated');
  });

  it('the Software version field marks old firmware as outdated', () => {
    const regs = scenarioRegisters('outdated-fw'); // sw 0x0107, bl 0x0004
    const sw = s3Battery.fields.find((f) => f.name === 'Software version')!;
    const bl = s3Battery.fields.find((f) => f.name === 'Bootloader version')!;
    expect(sw.decode(regs)).toContain('outdated');
    expect(bl.decode(regs)).toContain('outdated');
  });
});
