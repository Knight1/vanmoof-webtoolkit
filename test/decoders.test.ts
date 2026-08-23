import { describe, it, expect } from 'vitest';
import { celsius, milliAmps, volts, flags16, decodeEsn, decodeDate, decodeStateWord, imbalance } from '../src/devices/decoders';

describe('decoders', () => {
  it('celsius from Kelvin*10 offset', () => {
    expect(celsius(2731 + 180)).toBeCloseTo(18.0, 1);
  });
  it('milliAmps signed', () => {
    expect(milliAmps(0xffff)).toBe(-10); // int16(-1) * 10
  });
  it('volts from millivolts', () => {
    expect(volts(42000)).toBe(42);
  });
  it('flags16 decodes set bits and skips RSVD', () => {
    const names = ['DSG', 'RSVD', 'CHG'];
    expect(flags16(0b101, names)).toEqual(['DSG', 'CHG']);
  });
  it('flags16 skips empty-string names', () => {
    const names = ['', '', 'CHG_IN', '', 'Fault', 'CHG'];
    expect(flags16(0b111111, names)).toEqual(['CHG_IN', 'Fault', 'CHG']);
  });
  it('celsius applies the signed int16 cast for values >= 0x8000', () => {
    // 0xffff as int16 is -1, so celsius = (-1 - 2731) / 10 = -273.2.
    // Without the int16 cast this would wrongly read as +6280.4.
    expect(celsius(0xffff)).toBeCloseTo(-273.2, 1);
  });
  it('decodeEsn reads ASCII across registers', () => {
    const regs = new Uint16Array(0x20);
    const esn = 'ABCDEFGHIJKLMN';
    for (let i = 0; i < 7; i++) regs[0x0c + i] = (esn.charCodeAt(i * 2) << 8) | esn.charCodeAt(i * 2 + 1);
    expect(decodeEsn(regs, 0x0c)).toBe(esn);
  });
  it('imbalance is absolute difference', () => {
    expect(imbalance(4102, 4080)).toBe(22);
  });

  it('decodeDate formats per locale (bytes [_, YY, MM, DD])', () => {
    const regs = new Uint16Array(0x20);
    regs[0x13] = (0x00 << 8) | 22;   // year 2022
    regs[0x14] = (3 << 8) | 15;      // March 15
    expect(decodeDate(regs, 0x13, 'de-DE')).toBe('15.03.2022'); // DD.MM.YYYY
    expect(decodeDate(regs, 0x13, 'en-US')).toBe('03/15/2022'); // MM/DD/YYYY
  });

  it('decodeDate returns a placeholder when the date is unset', () => {
    const regs = new Uint16Array(0x20); // all zero
    expect(decodeDate(regs, 0x13, 'en-US')).toBe('-');
  });

  it('decodeStateWord maps register 2 state words', () => {
    expect(decodeStateWord(0x0000)).toBe('Normal');
    expect(decodeStateWord(0x0080)).toBe('OVP1 (cell over-voltage)');
    expect(decodeStateWord(0x0020)).toBe('UVP1 (cell under-voltage)');
    expect(decodeStateWord(0x0002)).toBe('Over-temperature fault');
    expect(decodeStateWord(0xffff)).toBe('MOS Failure - OC latched, secondary fuse FIRED');
    expect(decodeStateWord(0x1234)).toBe('0x1234'); // unknown -> hex
  });
});
