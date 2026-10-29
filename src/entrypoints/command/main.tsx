import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { CommandHost } from '@/app/command/CommandBar';
import { CommandPage } from '@/app/command/CommandPage';
import { RecentTabs } from '@/app/command/RecentTabs';
import { CLOSE_MESSAGE, type CommandBarMessage, type HelloReply } from '@/platform/command-bar';
import { chromePlatform } from '@/platform/chrome';
import { connect } from '@/state/connect';
import '@/app/global.css';

const send = (message: CommandBarMessage) => browser.runtime.sendMessage(message);

/** Works only when framed by the overlay script, which hands it a one-time token. */
async function start() {
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  const hello = (await send({ kind: 'command-bar:hello', token }).catch(
    () => null,
  )) as HelloReply | null;
  const windowId = hello?.windowId;
  if (!hello?.ok || windowId === undefined) return;

  void connect(chromePlatform);
  const host: CommandHost = {
    close: () => parent.postMessage(CLOSE_MESSAGE, '*'),
    runInSidebar: (command) =>
      send({ kind: 'command-bar:run', windowId, command }).then(
        (reply) => reply === true,
        () => false,
      ),
  };
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {hello.switcher ? (
        <RecentTabs host={host} />
      ) : (
        <CommandPage host={host} sidebarOpen={hello.sidebarOpen ?? false} address={hello.address} />
      )}
    </StrictMode>,
  );
}

void start();
