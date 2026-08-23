import { describe, it, expect } from 'vitest';
import { crc16 } from '../src/protocol/modbus-rtu';

describe('crc16', () => {
  it('matches the known Modbus vector for 01 03 00 00 00 01', () => {
    const crc = crc16(new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]));
    expect(crc & 0xff).toBe(0x84);        // low byte on the wire
    expect((crc >> 8) & 0xff).toBe(0x0a); // high byte on the wire
  });
});
