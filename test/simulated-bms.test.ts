import { describe, it, expect } from 'vitest';
import { SimulatedBmsTransport, scenarioRegisters } from '../src/transport/simulated-bms';
import { encodeReadHolding, decodeReadHolding } from '../src/protocol/modbus-rtu';

describe('SimulatedBmsTransport', () => {
  it('answers a read-holding request with seeded register values', async () => {
    const sim = new SimulatedBmsTransport();
    sim.setRegister(0x04, 42000); // pack mV
    await sim.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    await sim.write(encodeReadHolding(170, 0x04, 1));
    const resp = await sim.read(100);
    const regs = decodeReadHolding(170, 1, resp);
    expect(regs[0]).toBe(42000);
  });
});

describe('scenarioRegisters', () => {
  it('healthy has no fault and a balanced pack', () => {
    const r = scenarioRegisters('healthy');
    expect(r[0x02]).toBe(0);
    expect((r[0x29] ?? 0) - (r[0x2a] ?? 0)).toBeLessThanOrEqual(20);
  });

  it('shutdown sets the fault register and disables discharge', () => {
    const r = scenarioRegisters('shutdown');
    expect(r[0x02]).not.toBe(0);
    expect(r[0x08]).toBe(0);
  });

  it('faulty-cell drives one cell below the low threshold', () => {
    const r = scenarioRegisters('faulty-cell');
    const cells = Array.from({ length: 10 }, (_, i) => r[0x1b + i] ?? 0);
    expect(Math.min(...cells)).toBeLessThan(2500);
  });

  it('imbalanced widens the min/max spread beyond the balance limit', () => {
    const r = scenarioRegisters('imbalanced');
    expect((r[0x29] ?? 0) - (r[0x2a] ?? 0)).toBeGreaterThan(20);
  });
});
