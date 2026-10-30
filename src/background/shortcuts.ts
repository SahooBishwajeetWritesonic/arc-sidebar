import { browser, type Browser } from 'wxt/browser';
import type { Command } from '@/command/types';
import type { CommandBarMessage } from '@/platform/command-bar';
import { joinMeeting } from './calendar';
import { commandLook, onCommandBarShortcut, onRecentTabsShortcut } from './command-bar';
import { copyFromShortcut, showNote } from './copy';
import { openLittleArc } from './peek';
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
  const { model, session } = service.snapshot();
  const look = commandLook(model, session, tab.windowId);
  if (command === 'command-bar') return onCommandBarShortcut(tab, { look });
  if (command === 'edit-url') return onCommandBarShortcut(tab, { editAddress: true, look });
  void run(command, tab, tab.id, service);
}

async function run(command: string, tab: Browser.tabs.Tab, tabId: number, service: SidebarService) {
  const { windowId } = tab;
  switch (command) {
    case 'copy-url':
    case 'copy-url-markdown':
      return copyFromShortcut(tab, command === 'copy-url-markdown');
    case 'capture':
      return browser.scripting
        .executeScript({ target: { tabId }, files: ['/capture-tool.js'] })
        .then(
          () => {},
          () => showNote(windowId, 'Chrome doesn’t allow capturing this page'),
        );
    case 'little-arc':
      return openLittleArc(windowId);
    case 'recent-tabs':
      return onRecentTabsShortcut(tab);
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
    case 'join-meeting':
      await service.ready;
      return joinMeeting(windowId, service.snapshot().model.settings.calendar);
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
  // Arc's ⌘1–9: Chrome won't suggest its own keys; set them at chrome://extensions/shortcuts.
  const tabN = /^tab-([1-9])$/.exec(command);
  if (tabN) {
    const target = await service.numberedTab(windowId, tabId, Number(tabN[1]));
    if (!target) return;
    // In the sidebar when it's open, so a pinned split opens side by side.
    const chosen: Command =
      target.kind === 'pin'
        ? { type: 'openPin', itemId: target.itemId }
        : { type: 'switchToTab', tabId: target.tabId };
    return inSidebarOr(windowId, chosen, () => service.selectNumbered(windowId, target));
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
