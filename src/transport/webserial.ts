import type { SerialParams, Transport } from './types';

export interface SerialPortLike {
  open(options: { baudRate: number; dataBits: number; parity: string; stopBits: number }): Promise<void>;
  close(): Promise<void>;
  readable: { getReader(): { read(): Promise<{ value?: Uint8Array; done: boolean }>; releaseLock(): void; cancel(): Promise<void> } } | null;
  writable: { getWriter(): { write(b: Uint8Array): Promise<void>; releaseLock(): void } } | null;
}

export class WebSerialTransport implements Transport {
  isOpen = false;
  private buf: number[] = [];
  private reader?: ReturnType<NonNullable<SerialPortLike['readable']>['getReader']>;
  private pump?: Promise<void>;
  private closeCb?: () => void;

  constructor(private port: SerialPortLike) {}

  onClose(cb: () => void): void { this.closeCb = cb; }

  static async request(): Promise<WebSerialTransport> {
    const serial = (navigator as unknown as { serial?: { requestPort(): Promise<SerialPortLike> } }).serial;
    if (!serial) throw new Error('Web Serial not available. Use a Chromium browser over HTTPS or localhost.');
    return new WebSerialTransport(await serial.requestPort());
  }

  async open(p: SerialParams): Promise<void> {
    await this.port.open({ baudRate: p.baudRate, dataBits: p.dataBits, parity: p.parity, stopBits: p.stopBits });
    this.isOpen = true;
    this.reader = this.port.readable!.getReader();
    this.pump = (async () => {
      try {
        while (this.isOpen) {
          const { value, done } = await this.reader!.read();
          if (done) break;
          if (value) this.buf.push(...value);
        }
      } catch { /* reader cancelled on close */ }
      if (this.isOpen) {
        // Loop ended while still "open" → device went away, not an app-initiated close().
        this.isOpen = false;
        this.closeCb?.();
      }
    })();
  }

  async close(): Promise<void> {
    this.isOpen = false;
    try { await this.reader?.cancel(); } catch { /* already gone */ }
    this.reader?.releaseLock();
    await this.pump;
    await this.port.close();
  }

  async write(bytes: Uint8Array): Promise<void> {
    const w = this.port.writable!.getWriter();
    try { await w.write(bytes); } finally { w.releaseLock(); }
  }

  async read(timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buf.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const out = new Uint8Array(this.buf);
    this.buf = [];
    return out;
  }
}
