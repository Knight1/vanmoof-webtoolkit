import type { Transport } from '../transport/types';

function parseInput(text: string, mode: 'hex' | 'ascii'): Uint8Array {
  if (mode === 'ascii') return new TextEncoder().encode(text);
  const hex = text.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

export function renderRawConsole(container: HTMLElement, transport: Transport): HTMLElement {
  const wrap = document.createElement('section');
  const log = document.createElement('pre');
  const input = document.createElement('input');
  input.placeholder = 'bytes to send';
  const mode = document.createElement('select');
  for (const m of ['ascii', 'hex']) { const o = document.createElement('option'); o.value = o.textContent = m; mode.append(o); }
  const send = document.createElement('button');
  send.textContent = 'Send';
  send.onclick = async () => {
    const bytes = parseInput(input.value, mode.value as 'hex' | 'ascii');
    await transport.write(bytes);
    log.textContent += `» ${mode.value === 'hex' ? toHex(bytes) : input.value}\n`;
    const reply = await transport.read(2000);
    if (reply.length) log.textContent += `« ${toHex(reply)}  ${new TextDecoder().decode(reply).replace(/[^\x20-\x7e]/g, '.')}\n`;
    log.scrollTop = log.scrollHeight;
  };
  wrap.append(mode, input, send, log);
  container.append(wrap);
  return wrap;
}
