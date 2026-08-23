import { describe, it, expect } from 'vitest';
import { WebSerialTransport, type SerialPortLike } from '../src/transport/webserial';

function fakePort(chunks: Uint8Array[]): SerialPortLike {
  let i = 0;
  const written: number[] = [];
  return {
    async open() {},
    async close() {},
    writable: { getWriter: () => ({ write: async (b: Uint8Array) => { written.push(...b); }, releaseLock() {} }) },
    readable: { getReader: () => ({
      read: async () => i < chunks.length ? { value: chunks[i++], done: false } : { value: undefined, done: true },
      releaseLock() {}, cancel: async () => {},
    }) },
    _written: written,
  } as unknown as SerialPortLike;
}

describe('WebSerialTransport', () => {
  it('writes bytes to the port writer', async () => {
    const port = fakePort([]);
    const t = new WebSerialTransport(port);
    await t.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    await t.write(new Uint8Array([1, 2, 3]));
    expect((port as unknown as { _written: number[] })._written).toEqual([1, 2, 3]);
    await t.close();
  });

  it('buffers reader chunks and returns them within the timeout', async () => {
    const port = fakePort([new Uint8Array([0xaa, 0xbb])]);
    const t = new WebSerialTransport(port);
    await t.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    const got = await t.read(50);
    expect(Array.from(got)).toEqual([0xaa, 0xbb]);
    await t.close();
  });

  it('fires onClose when the reader ends unexpectedly while still open (device disconnect)', async () => {
    // fakePort([]) yields { done: true } on the very first read, simulating the
    // reader ending without an app-initiated close().
    const port = fakePort([]);
    const t = new WebSerialTransport(port);
    let closed = false;
    t.onClose(() => { closed = true; });
    await t.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    // Let the pump loop observe `done: true` and run its close handling.
    await new Promise((r) => setTimeout(r, 10));
    expect(closed).toBe(true);
    expect(t.isOpen).toBe(false);
  });

  it('does not fire onClose on an app-initiated close()', async () => {
    // A port whose read() hangs until cancel() rejects it - mirrors a real
    // Web Serial reader, which only settles its pending read when cancelled.
    let rejectRead: ((e: unknown) => void) | undefined;
    const port: SerialPortLike = {
      async open() {},
      async close() {},
      writable: { getWriter: () => ({ write: async () => {}, releaseLock() {} }) },
      readable: {
        getReader: () => ({
          read: () => new Promise((_, reject) => { rejectRead = reject; }),
          releaseLock() {},
          cancel: async () => { rejectRead?.(new Error('cancelled')); },
        }),
      },
    };
    const t = new WebSerialTransport(port);
    let closed = false;
    t.onClose(() => { closed = true; });
    await t.open({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    await t.close();
    expect(closed).toBe(false);
  });
});
