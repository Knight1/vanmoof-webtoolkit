import { describe, it, expect } from 'vitest';
import {
  encodeReadHolding, encodeWriteSingle, encodeWriteMultiple,
  decodeReadHolding, decodeWriteAck, crc16, ModbusExceptionError,
  ModbusRtuClient,
} from '../src/protocol/modbus-rtu';
import { SimulatedBmsTransport } from '../src/transport/simulated-bms';
import type { Transport, SerialParams } from '../src/transport/types';

function frameWithCrc(body: number[]): Uint8Array {
  const c = crc16(new Uint8Array(body));
  return new Uint8Array([...body, c & 0xff, (c >> 8) & 0xff]);
}

/** Minimal fake Transport that always answers a read with a 5-byte Modbus exception frame. */
class ExceptionTransport implements Transport {
  isOpen = false;
  async open(_params: SerialParams): Promise<void> { this.isOpen = true; }
  async close(): Promise<void> { this.isOpen = false; }
  async write(_bytes: Uint8Array): Promise<void> { /* no-op */ }
  async read(_timeoutMs: number): Promise<Uint8Array> {
    return frameWithCrc([170, 0x83, 0x02]); // unit, func|0x80, illegal-data-address
  }
}

describe('modbus frames', () => {
  it('encodes a read-holding request', () => {
    const f = encodeReadHolding(170, 0x0002, 1);
    expect(Array.from(f.subarray(0, 6))).toEqual([170, 3, 0, 2, 0, 1]);
  });

  it('decodes a read-holding response', () => {
    const resp = frameWithCrc([170, 3, 2, 0x12, 0x34]);
    const regs = decodeReadHolding(170, 1, resp);
    expect(regs[0]).toBe(0x1234);
  });

  it('throws typed exception on error response', () => {
    const resp = frameWithCrc([170, 0x83, 0x02]);
    expect(() => decodeReadHolding(170, 1, resp)).toThrow(ModbusExceptionError);
  });

  it('encodes write-single and accepts its echo ack', () => {
    const req = encodeWriteSingle(170, 0x08, 1);
    expect(() => decodeWriteAck(req)).not.toThrow();
  });

  it('encodes write-multiple byte count', () => {
    const f = encodeWriteMultiple(170, 0x0c, [0x4142, 0x4344]);
    expect(f[6]).toBe(4);
  });
});

describe('ModbusRtuClient', () => {
  it('reads a register block from the simulator', async () => {
    const sim = new SimulatedBmsTransport();
    sim.setRegister(0x04, 41500);
    await sim.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    const client = new ModbusRtuClient(sim, 170);
    const regs = await client.readHolding(0, 6);
    expect(regs[0x04]).toBe(41500);
  });

  it('writes a single register and reads it back', async () => {
    const sim = new SimulatedBmsTransport();
    await sim.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    const client = new ModbusRtuClient(sim, 170);
    await client.writeSingle(0x08, 1);
    const regs = await client.readHolding(0x08, 1);
    expect(regs[0]).toBe(1);
  });

  it('resolves quickly with ModbusExceptionError on a short exception frame instead of waiting the full timeout', async () => {
    const t = new ExceptionTransport();
    await t.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    // Large timeout + several retries — if collect() waited for minLen bytes
    // (which never arrive, since the exception frame is only 5 bytes), this
    // test would take retries * timeoutMs (i.e. many seconds) to fail.
    const client = new ModbusRtuClient(t, 170, { timeoutMs: 3000, retries: 5 });
    const start = Date.now();
    await expect(client.readHolding(0, 46)).rejects.toBeInstanceOf(ModbusExceptionError);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
