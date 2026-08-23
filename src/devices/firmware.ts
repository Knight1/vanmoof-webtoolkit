import type { ModbusRtuClient } from '../protocol/modbus-rtu';

// Registers used by the S3 BMS firmware-update protocol (from the reference tool).
const REG_RUN_STATE = 0x00;    // 0x0100 = running
const REG_RESET_MCU = 0x80;    // write 0 to reset after flashing
const REG_FW_CRC = 0x81;       // read: low byte 0=ok, 1=CRC error, 2=no file
const REG_FW_DATA = 0x82;      // write [4-byte BE offset][<=32 data bytes] as fn 0x10
const REG_ERASE_SHADOW = 0x95; // write 0 to erase shadow flash first
const CHUNK = 32;
const RUNNING = 0x0100;

export interface FlashCallbacks {
  onProgress?(written: number, total: number): void;
  onLog?(msg: string): void;
}

export interface FlashOptions {
  rebootTimeoutMs?: number;
  pollIntervalMs?: number;
}

export class FirmwareCrcError extends Error {}
export class FirmwareRebootTimeout extends Error {}

/** Pack bytes into big-endian 16-bit register values (padding an odd tail). */
function bytesToRegs(payload: Uint8Array): number[] {
  const n = payload.length + (payload.length % 2);
  const regs: number[] = [];
  for (let i = 0; i < n; i += 2) {
    regs.push(((payload[i] ?? 0) << 8) | (payload[i + 1] ?? 0));
  }
  return regs;
}

/**
 * Flash a .bin firmware image to the S3 BMS over Modbus:
 *   1. erase shadow flash (0x95=0)
 *   2. write 32-byte chunks as [offset u32 BE][data] to 0x82 (fn 0x10)
 *   3. verify CRC (read 0x81)
 *   4. reset the MCU (0x80=0)
 *   5. poll run-state 0x00 until 0x0100 (running)
 *
 * The caller must ensure nothing else uses the serial link during the flash.
 */
export async function flashFirmware(
  client: ModbusRtuClient,
  bytes: Uint8Array,
  cb: FlashCallbacks = {},
  opts: FlashOptions = {},
): Promise<void> {
  const total = bytes.length;
  if (total === 0) throw new Error('Firmware file is empty');
  const log = (m: string) => cb.onLog?.(m);

  log(`Firmware: ${total} bytes, ${Math.ceil(total / CHUNK)} chunks.`);

  // 1. erase shadow flash
  log('Step 1/4: erasing shadow flash (0x95=0)…');
  await client.writeSingle(REG_ERASE_SHADOW, 0);

  // 2. write firmware in 32-byte chunks
  log('Step 2/4: writing firmware…');
  let written = 0;
  while (written < total) {
    const size = Math.min(CHUNK, total - written);
    const payload = new Uint8Array(4 + size);
    payload[0] = (written >>> 24) & 0xff;
    payload[1] = (written >>> 16) & 0xff;
    payload[2] = (written >>> 8) & 0xff;
    payload[3] = written & 0xff;
    payload.set(bytes.subarray(written, written + size), 4);
    await client.writeMultiple(REG_FW_DATA, bytesToRegs(payload));
    written += size;
    cb.onProgress?.(written, total);
  }

  // 3. verify CRC
  log('Step 3/4: verifying CRC (0x81)…');
  const crc = ((await client.readHolding(REG_FW_CRC, 1))[0] ?? 0xffff) & 0xff;
  if (crc === 1) throw new FirmwareCrcError('CRC check failed - firmware data may be corrupted.');
  if (crc === 2) throw new FirmwareCrcError('CRC check returned "no file" - the BMS did not receive the firmware.');
  if (crc !== 0) throw new FirmwareCrcError(`CRC check returned unknown status ${crc}.`);
  log('CRC OK.');

  // 4. reset MCU (the reset itself may drop the reply - that is expected)
  log('Step 4/4: resetting MCU (0x80=0)…');
  try {
    await client.writeSingle(REG_RESET_MCU, 0);
  } catch {
    log('Reset issued (link dropped during reboot, as expected).');
  }

  // 5. wait for the BMS to come back up
  log('Waiting for the BMS to reboot…');
  const deadline = Date.now() + (opts.rebootTimeoutMs ?? 180000);
  const interval = opts.pollIntervalMs ?? 2000;
  while (Date.now() < deadline) {
    try {
      if ((await client.readHolding(REG_RUN_STATE, 1))[0] === RUNNING) {
        log('BMS rebooted - firmware update complete.');
        return;
      }
    } catch {
      // still rebooting
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new FirmwareRebootTimeout('Timed out waiting for the BMS to reboot after flashing.');
}
