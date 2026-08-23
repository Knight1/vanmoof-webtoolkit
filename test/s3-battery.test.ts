import { describe, it, expect } from 'vitest';
import { s3Battery } from '../src/devices/s3-battery';
import { SimulatedBmsTransport } from '../src/transport/simulated-bms';
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

    const fault = s3Battery.fields.find((f) => f.addr === 0x02)!;
    expect(fault.decode(regs)).toBe('OK');
  });

  it('every action has a confirm string', () => {
    for (const a of s3Battery.actions) expect(a.confirm.length).toBeGreaterThan(0);
  });
});
