import type { SerialParams, Transport } from '../transport/types';
import type { ModbusRtuClient } from '../protocol/modbus-rtu';

export type FieldGroup =
  | 'Status' | 'Voltages' | 'Cells' | 'Temperatures'
  | 'Capacity' | 'Identity' | 'Protection' | 'Records';

export interface Field {
  addr: number;
  name: string;
  group: FieldGroup;
  unit?: string;
  decode(regs: Uint16Array): string;
}

export interface DeviceContext {
  client: ModbusRtuClient;
  transport: Transport;
  arg?: string;
}

export interface DeviceAction {
  id: string;
  name: string;
  danger: 'low' | 'medium' | 'high';
  confirm: string;
  kind: 'modbus-write' | 'ascii-shell';
  run(ctx: DeviceContext): Promise<string>;
}

export interface CellPack {
  addr: number;              // first per-cell voltage register
  count: number;             // number of series groups reported
  parallel: number;          // cells wired in parallel per group (label only)
  minMv: number;             // empty threshold (fill = 0%)
  maxMv: number;             // full threshold (fill = 100%)
  packLabel: string;         // e.g. "10S4P"
  layout?: 'string' | 'u';   // physical arrangement; default 'string'
  packVoltageAddr?: number;  // optional register holding pack voltage (mV)
}

export interface Device {
  id: string;
  name: string;
  serial: SerialParams;
  unitId: number;
  reads: { addr: number; qty: number }[];
  fields: Field[];
  actions: DeviceAction[];
  cells?: CellPack;
}
