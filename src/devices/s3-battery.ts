import type { Device, Field } from './types';
import { celsius, milliAmps, volts, flags16, decodeEsn, decodeDate, imbalance } from './decoders';

const FAULT = ['DOTP','DUTP','COTP','CUTP','DOCP1','DOCP2','COCP1','COCP2',
  'OVP1','OVP2','UVP1','UVP2','PDOCP','PDSCP','MOTP','SCP'];
const WARN = ['DOTPW','DUTPW','COTPW','CUTPW','DOCPW','RSVD','COCPW','RSVD',
  'OVP1W','RSVD','UVP1W','SOC','PDOCPW','RSVD','MOTPW','RSVD'];

// Full, human-readable names for the 16 protection/fault flags (bit order = FAULT).
const FAULT_NAMES: Record<string, string> = {
  DOTP: 'Discharge Over-Temperature Protection',
  DUTP: 'Discharge Under-Temperature Protection',
  COTP: 'Charge Over-Temperature Protection',
  CUTP: 'Charge Under-Temperature Protection',
  DOCP1: 'Discharge Over-Current Protection 1',
  DOCP2: 'Discharge Over-Current Protection 2',
  COCP1: 'Charge Over-Current Protection 1',
  COCP2: 'Charge Over-Current Protection 2',
  OVP1: 'Over-Voltage Protection 1',
  OVP2: 'Over-Voltage Protection 2',
  UVP1: 'Under-Voltage Protection 1',
  UVP2: 'Under-Voltage Protection 2',
  PDOCP: 'Peak Discharge Over-Current Protection',
  PDSCP: 'Peak Discharge Short-Circuit Protection',
  MOTP: 'MOSFET Over-Temperature Protection',
  SCP: 'Short-Circuit Protection',
};
const faultName = (abbr: string): string => FAULT_NAMES[abbr] ?? abbr;

const f = (addr: number, name: string, group: Field['group'],
  decode: Field['decode'], unit?: string): Field => ({ addr, name, group, decode, unit });

const reg = (regs: Uint16Array, a: number) => regs[a] ?? 0;

const fields: Field[] = [
  f(0x02, 'Fault status', 'Status', (r) => reg(r,0x02) === 0 ? 'OK' : flags16(reg(r,0x02), FAULT).map(faultName).join(', ')),
  f(0x28, 'Warnings', 'Status', (r) => { const w = flags16(reg(r,0x28), WARN); return w.length ? w.join(', ') : 'None'; }),
  f(0x07, 'Charging', 'Status', (r) => flags16(reg(r,0x07), ['','','','','','','','','','','','','','CHG_IN','Fault','CHG']).join(', ') || 'idle'),
  f(0x08, 'Discharging', 'Status', (r) => (reg(r,0x08) & 0x8000) ? 'on' : 'off'),
  f(0x00, 'Run state', 'Status', (r) => {
    const v = reg(r, 0x00);
    return v === 0x0100 ? 'Running (AP)' : '0x' + v.toString(16).padStart(4, '0');
  }),

  f(0x04, 'Pack voltage', 'Voltages', (r) => String(volts(reg(r,0x04))), 'V'),
  f(0x06, 'Current', 'Voltages', (r) => String(milliAmps(reg(r,0x06))), 'mA'),
  f(0x05, 'RSOC', 'Capacity', (r) => String(reg(r,0x05)), '%'),
  f(0x18, 'Absolute SOC', 'Capacity', (r) => String(reg(r,0x18)), '%'),
  f(0x16, 'Full-charge capacity', 'Capacity', (r) => String(reg(r,0x16)), 'mAh'),
  f(0x17, 'Remaining capacity', 'Capacity', (r) => String(reg(r,0x17)), 'mAh'),
  f(0x19, 'Cycle count', 'Capacity', (r) => String(reg(r,0x19))),

  ...Array.from({ length: 10 }, (_, i) =>
    f(0x1b + i, `Cell ${i + 1}`, 'Cells', (r) => String(reg(r, 0x1b + i)), 'mV')),
  f(0x29, 'Max cell', 'Cells', (r) => String(reg(r,0x29)), 'mV'),
  f(0x2a, 'Min cell', 'Cells', (r) => String(reg(r,0x2a)), 'mV'),
  f(0x2b, 'Imbalance', 'Cells', (r) => String(imbalance(reg(r,0x29), reg(r,0x2a))), 'mV'),

  f(0x03, 'Battery temp', 'Temperatures', (r) => celsius(reg(r,0x03)).toFixed(1), '°C'),
  f(0x25, 'Temp sensor 1', 'Temperatures', (r) => celsius(reg(r,0x25)).toFixed(1), '°C'),
  f(0x26, 'Temp sensor 2', 'Temperatures', (r) => celsius(reg(r,0x26)).toFixed(1), '°C'),
  f(0x27, 'Discharge MOS temp', 'Temperatures', (r) => celsius(reg(r,0x27)).toFixed(1), '°C'),

  f(0x0a, 'Hardware version', 'Identity', (r) => '0x' + reg(r,0x0a).toString(16).padStart(4,'0')),
  f(0x0b, 'Software version', 'Identity', (r) => '0x' + reg(r,0x0b).toString(16).padStart(4,'0')),
  f(0x2c, 'Bootloader version', 'Identity', (r) => '0x' + reg(r,0x2c).toString(16).padStart(4,'0')),
  f(0x0c, 'Serial number', 'Identity', (r) => decodeEsn(r, 0x0c)),
  f(0x13, 'Manufacture date', 'Identity', (r) => decodeDate(r, 0x13)),

  ...FAULT.map((abbr, i) =>
    f(0x47 + i, faultName(abbr), 'Protection', (r) => String(reg(r, 0x47 + i)))),
];

export const s3Battery: Device = {
  id: 's3-battery',
  name: 'S3 / S4 Battery (DynaPack BMS)',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  unitId: 170,
  reads: [{ addr: 0, qty: 92 }],
  cells: { addr: 0x1b, count: 10, parallel: 4, minMv: 2500, maxMv: 4300, packLabel: '10S4P', layout: 'string', packVoltageAddr: 0x04 },
  fields,
  actions: [
    { id: 'discharge-on', name: 'Enable discharge', danger: 'medium', kind: 'modbus-write',
      confirm: 'Enable the discharge MOSFET (write 0x08=1)?',
      run: (c) => c.client.writeSingle(0x08, 1).then(() => 'Discharge enabled') },
    { id: 'discharge-off', name: 'Disable discharge', danger: 'medium', kind: 'modbus-write',
      confirm: 'Disable the discharge MOSFET (write 0x08=0)? Battery output stops.',
      run: (c) => c.client.writeSingle(0x08, 0).then(() => 'Discharge disabled') },
    { id: 'charge-mos-on', name: 'Charge MOS on', danger: 'medium', kind: 'modbus-write',
      confirm: 'Enable the charge MOSFET (write 0x1A=1)?',
      run: (c) => c.client.writeSingle(0x1a, 1).then(() => 'Charge MOS on') },
    { id: 'charge-mos-off', name: 'Charge MOS off', danger: 'medium', kind: 'modbus-write',
      confirm: 'Disable the charge MOSFET (write 0x1A=0)?',
      run: (c) => c.client.writeSingle(0x1a, 0).then(() => 'Charge MOS off') },
    { id: 'debug-on', name: 'Debug on', danger: 'low', kind: 'modbus-write',
      confirm: 'Enable BMS debug mode (write 0x09=1)?',
      run: (c) => c.client.writeSingle(0x09, 1).then(() => 'Debug on') },
    { id: 'debug-off', name: 'Debug off', danger: 'low', kind: 'modbus-write',
      confirm: 'Disable BMS debug mode (write 0x09=0)?',
      run: (c) => c.client.writeSingle(0x09, 0).then(() => 'Debug off') },
    { id: 'ship-mode', name: 'Ship mode', danger: 'high', kind: 'modbus-write',
      confirm: 'Enter ship mode (write 0x01=0)? Battery output is disabled.',
      run: (c) => c.client.writeSingle(0x01, 0).then(() => 'Ship mode set') },
    { id: 'reset-mcu', name: 'Reset MCU', danger: 'high', kind: 'modbus-write',
      confirm: 'Reset the BMS microcontroller (write 0x80=0)?',
      run: (c) => c.client.writeSingle(0x80, 0).then(() => 'MCU reset sent') },
    { id: 'reset-esn-modbus', name: 'Reset serial number (Modbus)', danger: 'high', kind: 'modbus-write',
      confirm: 'Clear the serial number (ESN) via Modbus (write 0x0A=0)?',
      run: (c) => c.client.writeSingle(0x0a, 0).then(() => 'Serial number reset (Modbus)') },
    { id: 'clear-pf', name: 'Clear Power Failure', danger: 'high', kind: 'ascii-shell',
      confirm: 'Send "PF=0" to clear Power Failure? Only do this if the cells are physically sound.',
      run: (c) => sendAscii(c.transport, 'PF=0') },
    { id: 'clear-log', name: 'Clear log', danger: 'medium', kind: 'ascii-shell',
      confirm: 'Send "Log Clear" to erase the BMS log?',
      run: (c) => sendAscii(c.transport, 'Log Clear') },
    { id: 'reset-esn-serial', name: 'Reset serial number (UART)', danger: 'high', kind: 'ascii-shell',
      confirm: 'Send "Reset ESN" over UART to clear the serial number?',
      run: (c) => sendAscii(c.transport, 'Reset ESN') },
    { id: 'reset-bms', name: 'Reset BMS (factory)', danger: 'high', kind: 'ascii-shell',
      confirm: 'Send "Reset BMS V0106"? Removes serial number, calibration and cycle count.',
      run: (c) => sendAscii(c.transport, 'Reset BMS V0106') },
  ],
};

async function sendAscii(t: import('../transport/types').Transport, cmd: string): Promise<string> {
  await t.write(new TextEncoder().encode(cmd));
  const reply = await t.read(2000);
  return reply.length ? new TextDecoder().decode(reply).trim() : '(no reply)';
}
