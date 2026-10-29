import { browser } from 'wxt/browser';
import { runInSidebar } from '@/app/command/sidebar';
import { REQUEST_TTL_MS, type CommandBarMessage, type PingReply } from '@/platform/command-bar';
import { commandBarRequestItem } from '@/platform/storage-items';
import { editAddress, setCommandBar, toggleCommandBar, useUi } from '@/state/ui';

/** When the sidebar has focus, the shortcut opens the bar here rather than over the page. */
export function serveCommandBar(windowId: number): () => void {
  const handled = new Set<string>();
  const toggleOnce = (requestId: string, address?: string) => {
    if (handled.has(requestId)) return;
    handled.add(requestId);
    if (address === undefined) toggleCommandBar();
    // The same shortcut again closes it, as Arc's ⌘L does.
    else if (useUi.getState().commandBar) setCommandBar(false);
    else editAddress(address);
  };

  const listener = (
    message: CommandBarMessage,
    _sender: unknown,
    sendResponse: (reply: unknown) => void,
  ) => {
    if (!('windowId' in message) || message.windowId !== windowId) return;
    switch (message.kind) {
      case 'command-bar:ping':
        sendResponse({ focused: document.hasFocus() } satisfies PingReply);
        break;
      case 'command-bar:toggle':
        toggleOnce(message.requestId, message.address);
        sendResponse(true);
        break;
      case 'command-bar:run':
        runInSidebar(message.command);
        sendResponse(true);
        break;
    }
  };
  browser.runtime.onMessage.addListener(listener);

  // Opened by the shortcut on a page Chrome protects: show the bar it asked for.
  void commandBarRequestItem.getValue().then((request) => {
    if (request?.windowId === windowId && Date.now() - request.at < REQUEST_TTL_MS) {
      toggleOnce(request.id, request.address);
    }
  });
  return () => browser.runtime.onMessage.removeListener(listener);
}
