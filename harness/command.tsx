import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CommandHost } from '@/app/command/CommandBar';
import { CommandPage } from '@/app/command/CommandPage';
import { RecentTabs } from '@/app/command/RecentTabs';
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

const switcher = new URLSearchParams(location.search).has('switcher');

// ⌥T again closes the bar; ⌃. again steps down the recent tabs. In Chrome that shortcut goes to
// the background, which tells the page, which tells the frame.
addEventListener('keydown', (event) => {
  if (!switcher && event.altKey && event.code === 'KeyT') host.close();
  if (switcher && event.ctrlKey && event.code === 'Period') {
    event.preventDefault();
    harness.postMessage({ harnessSwitcher: 'again' }, '*');
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {switcher ? (
      <RecentTabs host={host} />
    ) : (
      <CommandPage host={host} sidebarOpen={!!panel()?.harnessPanel} />
    )}
  </StrictMode>,
);
