import { describe, it, expect } from 'vitest';
import { flashFirmware, FirmwareCrcError } from '../src/devices/firmware';
import { SimulatedBmsTransport } from '../src/transport/simulated-bms';
import { ModbusRtuClient } from '../src/protocol/modbus-rtu';

const serial = { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 } as const;
const fast = { rebootTimeoutMs: 1000, pollIntervalMs: 5 };

function image(n: number): Uint8Array {
  return new Uint8Array(n).map((_, i) => i & 0xff);
}

describe('flashFirmware', () => {
  it('erases, writes all chunks, verifies CRC and reboots', async () => {
    const sim = new SimulatedBmsTransport();
    await sim.open(serial);
    const client = new ModbusRtuClient(sim, 170);

    let lastWritten = 0;
    const logs: string[] = [];
    await flashFirmware(
      client,
      image(70), // 70 bytes → chunks of 32, 32, 6
      { onProgress: (w) => { lastWritten = w; }, onLog: (m) => logs.push(m) },
      fast,
    );

    expect(lastWritten).toBe(70);
    expect(logs.join('\n')).toContain('firmware update complete');
  });

  it('rejects with FirmwareCrcError when the BMS reports a bad CRC', async () => {
    const sim = new SimulatedBmsTransport('fw-crc-error'); // seeds reg 0x81 = 1
    await sim.open(serial);
    const client = new ModbusRtuClient(sim, 170);

    await expect(flashFirmware(client, image(64), {}, fast)).rejects.toBeInstanceOf(FirmwareCrcError);
  });

  it('rejects an empty firmware image', async () => {
    const sim = new SimulatedBmsTransport();
    await sim.open(serial);
    const client = new ModbusRtuClient(sim, 170);
    await expect(flashFirmware(client, new Uint8Array(0), {}, fast)).rejects.toThrow(/empty/);
  });
});
