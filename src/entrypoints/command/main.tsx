import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { CommandBarHandle, CommandHost } from '@/app/command/CommandBar';
import { CommandPage } from '@/app/command/CommandPage';
import { RecentTabs } from '@/app/command/RecentTabs';
import {
  CLOSE_MESSAGE,
  type CommandBarMessage,
  type CommandBarPost,
  type HelloReply,
  type Typed,
} from '@/platform/command-bar';
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
  // Drawn: the page hands over what was typed into its stand-in (again if
  // more was typed meanwhile), until it lets this take the keyboard.
  const onMount = (bar: CommandBarHandle) => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as Partial<CommandBarPost & Typed> | null;
      if (event.source !== parent || data?.arcCommandBar !== 'typed') return;
      if (typeof data.text !== 'string') return;
      const at = (value: unknown) => (typeof value === 'number' ? value : data.text!.length);
      bar.carryOn({
        text: data.text,
        start: at(data.start),
        end: at(data.end),
        submit: data.submit === true,
      });
      parent.postMessage({ arcCommandBar: 'carried' } satisfies CommandBarPost, '*');
    };
    addEventListener('message', onMessage);
    parent.postMessage({ arcCommandBar: 'ready' } satisfies CommandBarPost, '*');
  };

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {hello.switcher ? (
        <RecentTabs host={host} />
      ) : (
        <CommandPage
          host={host}
          sidebarOpen={hello.sidebarOpen ?? false}
          address={hello.address}
          onMount={onMount}
        />
      )}
    </StrictMode>,
  );
}

void start();
