import './style.css';
import { s3Battery } from './devices/s3-battery';
import { renderShell, Session } from './ui/shell';
import { renderDashboard } from './ui/dashboard';
import { renderRawConsole } from './ui/raw-console';
import { renderActionsPanel } from './ui/actions-panel';
import { renderFirmwarePanel } from './ui/firmware-panel';
import { renderLanding } from './ui/landing';
import { SimulatedBmsTransport, type BmsScenario } from './transport/simulated-bms';
import { WebSerialTransport } from './transport/webserial';
import type { Transport } from './transport/types';
import type { DeviceContext } from './devices/types';

const root = document.querySelector<HTMLDivElement>('#app')!;
// Simulation UI (fake battery + fault scenarios) is dev/preview only -
// enable it by adding ?sim to the URL. Normal users only see hardware connect.
const showSimulation = new URLSearchParams(location.search).has('sim');
let session: Session | undefined;
let currentTransport: Transport | undefined;

const expertContainer = document.createElement('div');
expertContainer.style.display = 'none';

const shell = renderShell(root, {
  onConnect: async (mode, scenario) => {
    session?.stop();
    if (currentTransport) {
      try { await currentTransport.close(); } catch { /* already gone */ }
      currentTransport = undefined;
    }
    let transport: Transport;
    try {
      transport = mode === 'simulated'
        ? new SimulatedBmsTransport(scenario as BmsScenario)
        : await WebSerialTransport.request();
    } catch (e) { shell.setStatus((e as Error).message); return; }
    currentTransport = transport;
    session = new Session(s3Battery, transport);
    session.onRegs((regs) => { shell.setStatus('Connected'); renderDashboard(shell.content, s3Battery, regs); });
    session.onError((n) => shell.setStatus('Read error x' + n));
    if (transport instanceof WebSerialTransport) {
      transport.onClose(() => { shell.setStatus('Disconnected'); session?.stop(); });
    }
    shell.setStatus('Connecting…');
    session.start().catch((e) => shell.setStatus('Error: ' + (e as Error).message));
  },
  onExpertToggle: (on) => {
    if (on) {
      expertContainer.replaceChildren();
      if (session) {
        session.pause();
        if (currentTransport) {
          renderRawConsole(expertContainer, currentTransport);
          const ctx: DeviceContext = { client: session.client, transport: currentTransport };
          renderActionsPanel(expertContainer, s3Battery, ctx);
          renderFirmwarePanel(expertContainer, session.client);
        }
      }
      expertContainer.style.display = '';
    } else {
      expertContainer.replaceChildren();
      expertContainer.style.display = 'none';
      if (session) session.resume();
    }
  },
  simulation: showSimulation,
});

// Landing screen: how-to + wiring when Web Serial is available, or a
// supported-browsers message when it isn't. Simulated mode works without serial.
const canUse = 'serial' in navigator || showSimulation;
renderLanding(shell.content, canUse);

root.append(expertContainer);
