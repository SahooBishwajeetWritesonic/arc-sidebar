import { isSamePage } from '@/model/urls';
import {
  FAVORITES_ID,
  FAVORITES_LIMIT,
  type Appearance,
  type PinItem,
  type SessionState,
  type SidebarModel,
} from '@/model/types';
import type { TabInfo } from '@/platform/types';
import type { ActionId, Result } from './types';

/** What the bar knows about the window it was opened in. */
export interface CommandContext {
  model: SidebarModel;
  session: SessionState;
  /** The space the window shows. */
  spaceId: string;
  tabs: ReadonlyMap<number, TabInfo>;
  activeId: number | null;
  /** The tab before the active one, suggested first. */
  previousId: number | null;
  /** The shown space's Today tabs, top first. */
  todayIds: readonly number[];
  /** Whether this window's sidebar is open; some actions only work there. */
  sidebarOpen: boolean;
  archiveCount: number;
}

/** The pinned item (or favorite) the tab belongs to, if any. */
export function pinOf(ctx: Pick<CommandContext, 'model' | 'session'>, tabId: number | null) {
  if (tabId === null) return undefined;
  for (const [itemId, bound] of Object.entries(ctx.session.bindings)) {
    const item = ctx.model.items[itemId];
    if (bound === tabId && item?.kind === 'pin') return item;
  }
  return undefined;
}

interface ActionSpec {
  action: ActionId;
  title: string;
  /** Other words people type for it. */
  words?: string;
  spaceId?: string;
  appearance?: Appearance;
  prompt?: Result['prompt'];
  pick?: Result['pick'];
}

const action = (spec: ActionSpec): Result & { words: string } => ({
  key: ['action', spec.action, spec.spaceId ?? spec.appearance ?? ''].join(':'),
  command: {
    type: 'action',
    action: spec.action,
    ...(spec.spaceId && { spaceId: spec.spaceId }),
    ...(spec.appearance && { appearance: spec.appearance }),
  },
  title: spec.title,
  hint: '',
  words: spec.words ?? '',
  ...(spec.prompt && { prompt: spec.prompt }),
  ...(spec.pick && { pick: spec.pick }),
});

/** The actions that make sense now, current tab first, in the order Tab lists them. */
export function availableActions(ctx: CommandContext): (Result & { words: string })[] {
  const { model, spaceId, sidebarOpen } = ctx;
  const tab = ctx.activeId === null ? undefined : ctx.tabs.get(ctx.activeId);
  const pin: PinItem | undefined = pinOf(ctx, ctx.activeId);
  const favorites = Object.values(model.items).filter((item) => item.spaceId === FAVORITES_ID);
  const roomInFavorites = favorites.length < FAVORITES_LIMIT;
  const otherSpaces = model.spaces.filter(
    (space) => space.id !== (pin && pin.spaceId !== FAVORITES_ID ? pin.spaceId : spaceId),
  );
  const list: (Result & { words: string })[] = [];
  const add = (spec: ActionSpec) => list.push(action(spec));

  if (tab) {
    if (!pin) {
      add({ action: 'pinTab', title: 'Pin Tab' });
      if (roomInFavorites) add({ action: 'favoriteTab', title: 'Favorite Tab', words: 'add' });
      add({ action: 'archiveTab', title: 'Archive Tab', words: 'close' });
      add({
        action: 'renameTab',
        title: 'Rename Current Tab…',
        prompt: { label: 'Rename tab', initial: ctx.session.tabTitles[tab.id] ?? tab.title },
      });
    } else if (pin.spaceId === FAVORITES_ID) {
      add({ action: 'unfavoriteTab', title: 'Remove from Favorites', words: 'unfavorite' });
      add({ action: 'closeTab', title: 'Close Tab' });
    } else {
      add({ action: 'unpinTab', title: 'Unpin Tab' });
      if (roomInFavorites) add({ action: 'favoriteTab', title: 'Favorite Tab', words: 'add' });
      add({ action: 'closeTab', title: 'Close Tab' });
      add({
        action: 'renameTab',
        title: 'Rename Current Tab…',
        prompt: { label: 'Rename tab', initial: pin.customTitle ?? tab.title },
      });
    }
    if (pin && !isSamePage(tab.url, pin.url)) {
      add({ action: 'resetTab', title: 'Reset Tab', words: 'pinned url back' });
      add({ action: 'replacePin', title: 'Replace Pin with Current Page', words: 'url' });
    }
    if (pin?.spaceId !== FAVORITES_ID) {
      for (const space of otherSpaces) {
        add({ action: 'moveToSpace', title: `Move to ${space.name}`, spaceId: space.id });
      }
    }
    // Chrome splits two tabs; the sidebar shows Today pairs.
    if (tab.splitViewId !== undefined) {
      add({ action: 'removeSplit', title: 'Remove Split View', words: 'separate unsplit' });
    } else if (!pin) {
      add({
        action: 'splitView',
        title: 'Add Split View…',
        words: 'side by side',
        pick: { label: 'Split with' },
      });
    }
    add({ action: 'copyUrl', title: 'Copy Current URL', words: 'link address' });
    add({ action: 'copyMarkdown', title: 'Copy URL as Markdown', words: 'link' });
    add({ action: 'duplicateTab', title: 'Duplicate Current Tab' });
  }

  if (ctx.todayIds.length) {
    add({ action: 'clearToday', title: 'Clear Today', words: 'archive close all tabs' });
  }
  add({ action: 'pasteUrl', title: 'Paste URL as New Tab', words: 'clipboard open link' });
  const space = model.spaces.find((s) => s.id === spaceId);
  const inSpace = Object.values(model.items).filter((item) => item.spaceId === spaceId);
  if (inSpace.some((item) => item.kind === 'pin' && awayFromPin(ctx, item))) {
    add({ action: 'resetSpace', title: 'Reset Space', words: 'pinned tabs urls back' });
  }
  if (inSpace.length) {
    add({
      action: 'togglePinned',
      title: space?.pinnedCollapsed ? 'Expand Pinned' : 'Collapse Pinned',
      words: 'fold hide show section',
    });
  }
  const index = model.spaces.findIndex((s) => s.id === spaceId);
  if (index < model.spaces.length - 1) {
    add({ action: 'nextSpace', title: 'Select Next Space', words: 'switch' });
  }
  if (index > 0) add({ action: 'previousSpace', title: 'Select Previous Space', words: 'switch' });
  add({
    action: 'newSpace',
    title: 'New Space…',
    words: 'create add',
    prompt: { label: 'Name the space', initial: `Space ${model.spaces.length + 1}` },
  });
  add({
    action: 'newFolder',
    title: 'New Folder…',
    words: 'create add',
    prompt: { label: 'Name the folder', initial: 'New Folder' },
  });

  const appearance = model.settings.appearance;
  if (appearance !== 'dark') {
    add({ action: 'appearance', title: 'Switch to Dark Mode', appearance: 'dark', words: 'theme' });
  }
  if (appearance !== 'light') {
    add({
      action: 'appearance',
      title: 'Switch to Light Mode',
      appearance: 'light',
      words: 'theme',
    });
  }
  if (appearance !== 'auto') {
    add({
      action: 'appearance',
      title: 'Match System Appearance',
      appearance: 'auto',
      words: 'auto theme light dark mode',
    });
  }

  // These open something in the sidebar, so they need it open.
  if (sidebarOpen) {
    if (tab) {
      add({ action: 'revealTab', title: 'Reveal Tab in Sidebar', words: 'show find scroll' });
    }
    add({ action: 'viewArchive', title: 'View Archive', words: 'library archived closed' });
    add({ action: 'viewDownloads', title: 'View Downloads', words: 'library files saved' });
    if (ctx.archiveCount) {
      add({ action: 'clearArchive', title: 'Clear Archive…', words: 'library archived empty' });
    }
    add({ action: 'editTheme', title: 'Edit Theme…', words: 'colour color gradient' });
    add({ action: 'restoreSidebar', title: 'Restore Sidebar…', words: 'backup data' });
    add({ action: 'exportSidebar', title: 'Export Sidebar…', words: 'backup save download' });
    add({ action: 'importArc', title: 'Import from Arc…', words: 'arc' });
  }
  return list;
}

/** Whether a pinned tab is open on another page than the one it's pinned to. */
function awayFromPin(ctx: CommandContext, pin: PinItem): boolean {
  const tabId = ctx.session.bindings[pin.id];
  const tab = tabId === undefined ? undefined : ctx.tabs.get(tabId);
  return tab !== undefined && !isSamePage(tab.url, pin.url);
}
