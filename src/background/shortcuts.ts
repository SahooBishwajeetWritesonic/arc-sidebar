import { browser, type Browser } from 'wxt/browser';
import type { Command } from '@/command/types';
import type { CommandBarMessage } from '@/platform/command-bar';
import { onCommandBarShortcut } from './command-bar';
import { copyLinks, showNote } from './copy';
import type { SidebarService } from './service';

/**
 * Listed in wxt.config.ts; Chrome takes only four suggested keys. Sidebar actions run in the
 * open sidebar, for its toasts and Undo; otherwise the background does them.
 */
export function onShortcut(
  command: string,
  tab: Browser.tabs.Tab | undefined,
  service: SidebarService,
) {
  if (tab?.id === undefined) return;
  // The command bar must open in the shortcut's own turn (a closed sidebar opens only then).
  if (command === 'command-bar') return onCommandBarShortcut(tab);
  if (command === 'edit-url') return onCommandBarShortcut(tab, { editAddress: true });
  void run(command, tab, tab.id, service);
}

async function run(command: string, tab: Browser.tabs.Tab, tabId: number, service: SidebarService) {
  const { windowId } = tab;
  switch (command) {
    case 'copy-url':
    case 'copy-url-markdown':
      return copyLinks(tab, command === 'copy-url-markdown');
    case 'capture':
      return browser.scripting
        .executeScript({ target: { tabId }, files: ['/capture-tool.js'] })
        .then(
          () => {},
          () => showNote(windowId, 'Chrome doesn’t allow capturing this page'),
        );
    case 'next-tab':
    case 'previous-tab':
      return service.stepTab(windowId, tabId, command === 'next-tab' ? 1 : -1);
    case 'pin-tab': {
      await service.ready;
      const action = service.isPinned(tabId) ? 'unpinTab' : 'pinTab';
      return inSidebarOr(windowId, { type: 'action', action }, () =>
        service.togglePin(tabId, windowId),
      );
    }
    case 'clear-today':
      return inSidebarOr(windowId, { type: 'action', action: 'clearToday' }, () =>
        service.clearToday(windowId),
      );
    case 'next-space':
    case 'previous-space': {
      const next = command === 'next-space';
      return inSidebarOr(
        windowId,
        { type: 'action', action: next ? 'nextSpace' : 'previousSpace' },
        () => service.switchSpaceBy(windowId, next ? 1 : -1),
      );
    }
  }
  const nth = /^space-([1-9])$/.exec(command);
  if (nth) {
    await service.ready;
    const space = service.spacesOf(windowId).spaces[Number(nth[1]) - 1];
    if (!space) return;
    return inSidebarOr(windowId, { type: 'switchSpace', spaceId: space.id }, () =>
      service.switchSpace(windowId, space.id),
    );
  }
}

async function inSidebarOr(windowId: number, command: Command, fallback: () => Promise<void>) {
  const message: CommandBarMessage = { kind: 'command-bar:run', windowId, command };
  const ran = await browser.runtime.sendMessage(message).then(
    (reply) => reply === true,
    () => false,
  );
  if (!ran) await fallback();
}
