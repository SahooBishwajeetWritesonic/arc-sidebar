import {
  clearToday,
  closePin,
  closeTodayTab,
  createSpace,
  favoriteItem,
  favoriteTab,
  moveItemToSpace,
  moveTabToSpace,
  newFolder,
  pinTab,
  pressPin,
  renameItem,
  replacePinUrl,
  resetPin,
  separateSplit,
  setAppearance,
  splitTodayTabs,
  switchSpace,
  switchSpaceBy,
  unfavoriteToPinned,
  unpinWithUndo,
} from '@/app/actions';
import { pinOf } from '@/command/actions';
import { linksText } from '@/model/links';
import type { Command } from '@/command/types';
import { useSidebar } from '@/state/sidebar';
import { activateTab, duplicateTab, openInSplit, openUrl, searchWeb, useTabs } from '@/state/tabs';

/**
 * Runs a command bar row in this page: the sidebar, or the bar's own frame
 * when the sidebar isn't open. Actions apply to the window's current tab.
 */
export function runCommand(command: Command) {
  switch (command.type) {
    case 'openUrl':
      return openUrl(command.url);
    case 'search':
      return searchWeb(command.text);
    case 'switchToTab':
      return activateTab(command.tabId);
    case 'openPin':
      return pressPin(command.itemId);
    case 'switchSpace':
      return switchSpace(command.spaceId);
    case 'action':
      return runAction(command);
  }
}

function runAction(command: Extract<Command, { type: 'action' }>) {
  const { activeId, tabs } = useTabs.getState();
  const tab = activeId === null ? undefined : tabs.get(activeId);
  const pin = pinOf(useSidebar.getState(), activeId);
  const name = command.text?.trim();

  switch (command.action) {
    case 'pinTab':
      if (tab && !pin) pinTab(tab.id);
      break;
    case 'unpinTab':
      if (pin) unpinWithUndo(pin.id);
      break;
    case 'favoriteTab':
      if (pin) favoriteItem(pin.id);
      else if (tab) favoriteTab(tab.id);
      break;
    case 'unfavoriteTab':
      if (pin) unfavoriteToPinned(pin.id);
      break;
    case 'moveToSpace':
      if (!command.spaceId) break;
      if (pin) moveItemToSpace(pin.id, command.spaceId);
      else if (tab) moveTabToSpace(tab.id, command.spaceId);
      break;
    case 'archiveTab':
      if (tab && !pin) closeTodayTab(tab.id);
      break;
    case 'closeTab':
      if (pin) closePin(pin.id);
      break;
    case 'copyUrl':
    case 'copyMarkdown':
      // Without tracking parameters, as Arc's Copy URL.
      if (tab) copyText(linksText([tab], command.action === 'copyMarkdown'));
      break;
    case 'duplicateTab':
      if (tab) duplicateTab(tab.id);
      break;
    case 'resetTab':
      if (pin) resetPin(pin.id);
      break;
    case 'replacePin':
      if (pin) replacePinUrl(pin.id);
      break;
    case 'renameTab':
      if (pin && name) renameItem(pin.id, name);
      break;
    case 'splitView':
      // The picked tab or page goes on the right, as Arc's "Add Split View".
      if (!tab || pin) break;
      if (command.tabId !== undefined) splitTodayTabs(command.tabId, tab.id, 'right');
      else if (command.url) openInSplit(tab.id, command.url);
      break;
    case 'removeSplit':
      if (tab?.splitViewId !== undefined) separateSplit(tab.splitViewId);
      break;
    case 'nextSpace':
      switchSpaceBy(1);
      break;
    case 'previousSpace':
      switchSpaceBy(-1);
      break;
    case 'newSpace':
      createSpace(name || undefined);
      break;
    case 'newFolder':
      newFolder(name || undefined);
      break;
    case 'clearToday':
      clearToday();
      break;
    case 'appearance':
      if (command.appearance) setAppearance(command.appearance);
      break;
    default:
      // The rest open something in the sidebar; see runInSidebar.
      break;
  }
}

/**
 * Copies from a focused page (the bar, on Return). The async clipboard needs the frame to be
 * allowed it; the old copy command doesn't.
 */
export function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {
    const field = document.createElement('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  });
}
