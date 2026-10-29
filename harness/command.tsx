import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CommandHost } from '@/app/command/CommandBar';
import { CommandPage } from '@/app/command/CommandPage';
import { CLOSE_MESSAGE } from '@/platform/command-bar';
import { connect } from '@/state/connect';
import type { FakePlatform } from './fake-platform';
import type { HarnessPanel } from './panel';
import '@/app/global.css';

// The command bar over the "page", as the overlay script frames it in Chrome. It reaches the
// sidebar frame directly here, where the extension sends a message.

const harness = window.parent as Window & { harnessPlatform: FakePlatform };
const panel = () =>
  harness.document.querySelector<HTMLIFrameElement>('iframe[title="Sidebar"]')?.contentWindow as
    (Window & { harnessPanel?: HarnessPanel }) | null;

void connect(harness.harnessPlatform);
const host: CommandHost = {
  close: () => harness.postMessage(CLOSE_MESSAGE, '*'),
  runInSidebar: async (command) => {
    const sidebar = panel()?.harnessPanel;
    if (!sidebar) return false;
    sidebar.runInSidebar(command);
    return true;
  },
};

// ⌥T again closes it, as the shortcut does in Chrome.
addEventListener('keydown', (event) => {
  if (event.altKey && event.code === 'KeyT') host.close();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommandPage host={host} sidebarOpen={!!panel()?.harnessPanel} />
  </StrictMode>,
);
