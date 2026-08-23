import type { Transport } from '../transport/types';

export class ModbusCrcError extends Error {}
export class ModbusFrameError extends Error {}
export class ModbusExceptionError extends Error {
  constructor(public code: number) { super(`Modbus exception 0x${code.toString(16)}`); }
}

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc;
}

function withCrc(body: number[]): Uint8Array {
  const crc = crc16(new Uint8Array(body));
  return new Uint8Array([...body, crc & 0xff, (crc >> 8) & 0xff]);
}

function checkCrc(frame: Uint8Array): void {
  if (frame.length < 4) throw new ModbusFrameError('frame too short');
  const body = frame.subarray(0, frame.length - 2);
  const crc = crc16(body);
  const lo = frame[frame.length - 2]!, hi = frame[frame.length - 1]!;
  if ((crc & 0xff) !== lo || ((crc >> 8) & 0xff) !== hi) throw new ModbusCrcError('bad CRC');
}

function checkException(frame: Uint8Array, func: number): void {
  if ((frame[1]! & 0x80) !== 0) throw new ModbusExceptionError(frame[2]!);
  if (frame[1] !== func) throw new ModbusFrameError(`unexpected function 0x${frame[1]!.toString(16)}`);
}

export function encodeReadHolding(unit: number, addr: number, qty: number): Uint8Array {
  return withCrc([unit, 0x03, (addr >> 8) & 0xff, addr & 0xff, (qty >> 8) & 0xff, qty & 0xff]);
}

export function encodeWriteSingle(unit: number, addr: number, value: number): Uint8Array {
  return withCrc([unit, 0x06, (addr >> 8) & 0xff, addr & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

export function encodeWriteMultiple(unit: number, addr: number, values: number[]): Uint8Array {
  const body = [unit, 0x10, (addr >> 8) & 0xff, addr & 0xff,
    (values.length >> 8) & 0xff, values.length & 0xff, values.length * 2];
  for (const v of values) body.push((v >> 8) & 0xff, v & 0xff);
  return withCrc(body);
}

export function decodeReadHolding(unit: number, qty: number, frame: Uint8Array): Uint16Array {
  checkCrc(frame);
  if (frame[0] !== unit) throw new ModbusFrameError('wrong unit id');
  checkException(frame, 0x03);
  const byteCount = frame[2]!;
  if (byteCount !== qty * 2) throw new ModbusFrameError('unexpected byte count');
  const regs = new Uint16Array(qty);
  for (let i = 0; i < qty; i++) regs[i] = (frame[3 + i * 2]! << 8) | frame[4 + i * 2]!;
  return regs;
}

export function decodeWriteAck(frame: Uint8Array): void {
  checkCrc(frame);
  if ((frame[1]! & 0x80) !== 0) throw new ModbusExceptionError(frame[2]!);
}

export class ModbusTimeoutError extends Error {}

export class ModbusRtuClient {
  private timeoutMs: number;
  private retries: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private t: Transport, private unitId: number,
    opts: { timeoutMs?: number; retries?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 3000;
    this.retries = opts.retries ?? 5;
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private async collect(minLen: number): Promise<Uint8Array> {
    const deadline = Date.now() + this.timeoutMs;
    const buf: number[] = [];
    while (Date.now() < deadline) {
      const chunk = await this.t.read(deadline - Date.now());
      if (chunk.length) buf.push(...chunk);
      if (buf.length >= 5 && (buf[1]! & 0x80) !== 0) return new Uint8Array(buf);
      if (buf.length >= minLen) return new Uint8Array(buf);
    }
    if (buf.length) return new Uint8Array(buf);
    throw new ModbusTimeoutError('no response');
  }

  readHolding(addr: number, qty: number): Promise<Uint16Array> {
    return this.serialize(async () => {
      let lastErr: unknown;
      for (let i = 0; i < this.retries; i++) {
        try {
          await this.t.write(encodeReadHolding(this.unitId, addr, qty));
          const resp = await this.collect(3 + qty * 2 + 2);
          return decodeReadHolding(this.unitId, qty, resp);
        } catch (e) { lastErr = e; }
      }
      throw lastErr ?? new ModbusTimeoutError('read failed');
    });
  }

  writeSingle(addr: number, value: number): Promise<void> {
    return this.serialize(async () => {
      await this.t.write(encodeWriteSingle(this.unitId, addr, value));
      const resp = await this.collect(8);
      decodeWriteAck(resp);
    });
  }

  writeMultiple(addr: number, values: number[]): Promise<void> {
    return this.serialize(async () => {
      await this.t.write(encodeWriteMultiple(this.unitId, addr, values));
      const resp = await this.collect(8);
      decodeWriteAck(resp);
    });
  }
}
