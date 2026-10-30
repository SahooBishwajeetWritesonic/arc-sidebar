import { generateNKeysBetween } from 'fractional-indexing';
import type { ArcSidebar } from '@/import/arc';
import { planImport, type ImportChoice } from '@/import/plan';
import { toExportFile } from '@/model/backup';
import { githubFolderOf } from '@/model/live';
import {
  childrenOf,
  descendants,
  flattenSpace,
  orderAtEnd,
  orderBefore,
  partnerOf,
} from '@/model/tree';
import {
  FAVORITES_ID,
  FAVORITES_LIMIT,
  type Appearance,
  type ArchiveAfter,
  type ArchiveEntry,
  type GitHubFilters,
  type SidebarModel,
  type SpaceIcon,
  type SpaceTheme,
} from '@/model/types';
import type { TabInfo } from '@/platform/types';
import { dispatch, newId, useSidebar } from '@/state/sidebar';
import {
  activateTab,
  duplicateTab,
  forgetTab,
  forgetTabs,
  leaveTabs,
  openInSplit,
  openNewTab,
  selectTodayIds,
  splitTabs,
  unsplit,
  useTabs,
} from '@/state/tabs';
import { clearSelection } from '@/state/selection';
import { startEditing } from '@/state/ui';
import { orderForDrop, ordersForDrop, type DragSource, type DropTarget } from './drag/targets';
import { showToast, showUndoToast } from './toast/toast';
import { followReopened, pushUndo, undoable } from './undo';

/** What the user can do in the sidebar: mouse, keyboard and context menus all go through here. */

const boundTab = (itemId: string) => useSidebar.getState().session.bindings[itemId];

export function pressPin(itemId: string) {
  const pair = pairOf(itemId);
  if (pair) return pressPinnedSplit(pair, itemId);
  const tabId = boundTab(itemId);
  if (tabId !== undefined && useTabs.getState().tabs.has(tabId)) {
    activateTab(tabId);
  } else {
    dispatch({ type: 'openPin', itemId, windowId: useSidebar.getState().windowId! });
  }
}

// Pinned splits: two pins that name each other (model/tree.ts partnerOf).

/** A pinned split's two pins, left then right; undefined for a pin of its own. */
export function pairOf(itemId: string): [string, string] | undefined {
  const { model } = useSidebar.getState();
  const pin = model.items[itemId];
  const other = pin && partnerOf(model, pin);
  if (!pin || !other) return undefined;
  return pin.order < other.order ? [pin.id, other.id] : [other.id, pin.id];
}

const openTabOf = (itemId: string) => {
  const tabId = boundTab(itemId);
  return tabId !== undefined && useTabs.getState().tabs.has(tabId) ? tabId : undefined;
};

/**
 * Arc's pinned split: opens whichever isn't open, puts them side by side in Chrome
 * (again, if Chrome's split was undone), and selects the one pressed.
 */
export function pressPinnedSplit(pair: readonly [string, string], pressed: string) {
  const { windowId } = useSidebar.getState();
  if (windowId === null) return;
  for (const itemId of pair) {
    if (openTabOf(itemId) === undefined) dispatch({ type: 'openPin', itemId, windowId });
  }
  whenOpen(pair, (left, right) => {
    const { tabs } = useTabs.getState();
    const split = tabs.get(left)?.splitViewId;
    if (split === undefined || tabs.get(right)?.splitViewId !== split) splitTabs(left, right);
    activateTab(pressed === pair[0] ? left : right);
  });
}

/** Calls `then` once both pins' tabs are open; gives up after a few seconds. */
function whenOpen(pair: readonly [string, string], then: (left: number, right: number) => void) {
  let stops: (() => void)[] = [];
  const stop = () => stops.forEach((unsubscribe) => unsubscribe());
  const check = () => {
    const [left, right] = pair.map(openTabOf);
    if (left === undefined || right === undefined) return;
    stop();
    then(left, right);
  };
  const timer = setTimeout(stop, 5000);
  stops = [useTabs.subscribe(check), useSidebar.subscribe(check), () => clearTimeout(timer)];
  check();
}

/** Two pins naming each other, left first; at the end of Pinned unless `at` says where. */
export function pinSplit(
  tabIds: readonly number[],
  at?: { spaceId?: string; parentId: string | null; orders: string[] },
) {
  const { tabs } = useTabs.getState();
  const { model } = useSidebar.getState();
  const spaceId = at?.spaceId ?? useSidebar.getState().spaceId;
  const pair = tabIds.map((id) => tabs.get(id));
  if (pair.length !== 2 || pair.some((tab) => !tab)) return;
  const ids = [newId(), newId()];
  const last = childrenOf(model, spaceId, null).at(-1);
  const orders = at?.orders ?? generateNKeysBetween(last?.order ?? null, null, 2);
  pair.forEach((tab, i) =>
    dispatch({
      type: 'pinTab',
      itemId: ids[i]!,
      tabId: tab!.id,
      spaceId,
      parentId: at?.parentId ?? null,
      order: orders[i]!,
      url: tab!.url,
      title: tab!.title,
      pair: ids[1 - i]!,
    }),
  );
}

/** Arc's Separate All Tabs on a pinned split: two lone pins, out of Chrome's split too. */
export function separatePinnedSplit(pair: readonly [string, string]) {
  dispatch({ type: 'unpairPins', itemIds: [pair[0], pair[1]] });
  const tabId = openTabOf(pair[0]);
  const split = tabId === undefined ? undefined : useTabs.getState().tabs.get(tabId)?.splitViewId;
  if (split !== undefined) unsplit(split);
}

/** Back to Today, still side by side: the right one first, so the left lands above it. */
export function unpinSplit(pair: readonly [string, string]) {
  unpinWithUndo(pair[1]);
  unpinWithUndo(pair[0]);
}

export function closePinnedSplit(pair: readonly [string, string]) {
  for (const itemId of pair) if (openTabOf(itemId) !== undefined) closePin(itemId);
}

export const canFavoriteSplit = () => favoriteCount() + 2 <= FAVORITES_LIMIT;

/** Adds a Today split to the end of Favorites, as one tile. */
export function favoriteSplit(tabIds: readonly number[]) {
  if (!canFavoriteSplit()) return;
  const { model } = useSidebar.getState();
  const last = childrenOf(model, FAVORITES_ID, null).at(-1);
  const orders = generateNKeysBetween(last?.order ?? null, null, 2);
  pinSplit(tabIds, { spaceId: FAVORITES_ID, parentId: null, orders });
}

/** Both pins of a split move together, in order. */
export function favoritePair(pair: readonly [string, string]) {
  if (!canFavoriteSplit()) return;
  for (const itemId of pair) moveItemToSpace(itemId, FAVORITES_ID);
}

export function unfavoritePair(pair: readonly [string, string]) {
  for (const itemId of pair) unfavoriteToPinned(itemId);
}

/** A favorited split dropped somewhere: both go there together, left first. */
function dropPair(pair: readonly [string, string], target: DropTarget, windowId: number) {
  const { model, spaceId } = useSidebar.getState();
  if (target.section === 'today') {
    for (const itemId of pair) {
      dispatch({
        type: 'unpin',
        itemId,
        windowId,
        spaceId: homeSpaceOf(itemId),
        todayBeforeTabId: target.beforeTabId,
      });
    }
    return;
  }
  if (target.section === 'favorites') {
    const orders = ordersForDrop(model, FAVORITES_ID, null, target.beforeId, null, pair, 2);
    pair.forEach((itemId, i) =>
      dispatch({ type: 'moveToSpace', itemId, spaceId: FAVORITES_ID, order: orders[i]! }),
    );
    return;
  }
  if (target.section !== 'pinned') return;
  const { parentId, beforeId, afterId } = target;
  const orders = ordersForDrop(model, spaceId, parentId, beforeId, afterId, pair, 2);
  pair.forEach((itemId, i) =>
    dispatch({ type: 'move', itemId, spaceId, parentId, order: orders[i]! }),
  );
}

/** Closes the pinned tab but keeps the pin, as in Arc. */
export function closePin(itemId: string) {
  const tabId = boundTab(itemId);
  dispatch({ type: 'closePin', itemId });
  // Once unbound, the closing tab would flash into Today; drop it now.
  if (tabId !== undefined) forgetTab(tabId);
}

export function resetPin(itemId: string) {
  const tabId = boundTab(itemId);
  dispatch({ type: 'resetPin', itemId });
  if (tabId !== undefined) activateTab(tabId);
}

/**
 * Arc's ⌘-click on a pinned tab's icon: back to the pinned page, with the
 * page it was on kept in a new tab (a copy, history and all), which you stay on.
 */
export function resetPinKeepingPage(itemId: string) {
  const tabId = openTabOf(itemId);
  if (tabId === undefined) return;
  void duplicateTab(tabId).then(() => resetPin(itemId));
}

export function replacePinUrl(itemId: string) {
  const tabId = boundTab(itemId);
  const tab = tabId === undefined ? undefined : useTabs.getState().tabs.get(tabId);
  if (tab) dispatch({ type: 'replacePinUrl', itemId, url: tab.url, title: tab.title });
}

/** The space whose Today an unpinned item's tab goes to: a favorite's goes to the shown one. */
function homeSpaceOf(itemId: string): string {
  const { model, spaceId } = useSidebar.getState();
  const home = model.items[itemId]?.spaceId;
  return !home || home === FAVORITES_ID ? spaceId : home;
}

export function unpin(itemId: string) {
  const { windowId } = useSidebar.getState();
  dispatch({ type: 'unpin', itemId, windowId: windowId!, spaceId: homeSpaceOf(itemId) });
}

export function pinTab(tabId: number) {
  const tab = useTabs.getState().tabs.get(tabId);
  const { model, spaceId } = useSidebar.getState();
  if (!tab) return;
  undoable(() =>
    dispatch({
      type: 'pinTab',
      itemId: newId(),
      tabId,
      spaceId,
      parentId: null,
      order: orderAtEnd(model, spaceId, null),
      url: tab.url,
      title: tab.title,
    }),
  );
}

export function setFolderCollapsed(itemId: string, collapsed: boolean) {
  dispatch({ type: 'setFolderCollapsed', itemId, collapsed });
}

export function renameItem(itemId: string, title: string) {
  dispatch({ type: 'rename', itemId, title });
}

/** Arc's Rename on a Today tab. The page's own title, or nothing, gives it back. */
export function renameTab(tabId: number, title: string) {
  const name = title.trim();
  const page = useTabs.getState().tabs.get(tabId)?.title;
  dispatch({ type: 'renameTab', tabId, title: name && name !== page ? name : null });
}

export function newFolderWith(itemId: string) {
  const { model } = useSidebar.getState();
  const item = model.items[itemId];
  if (!item) return;
  const folderId = newId();
  dispatch({
    type: 'createFolder',
    itemId: folderId,
    spaceId: item.spaceId,
    parentId: item.parentId,
    order: orderBefore(model, item),
    name: 'New Folder',
    childIds: [item.id],
  });
  startEditing(folderId);
}

export function newFolder(name?: string) {
  const { model, spaceId } = useSidebar.getState();
  const folderId = newId();
  dispatch({
    type: 'createFolder',
    itemId: folderId,
    spaceId,
    parentId: null,
    order: orderAtEnd(model, spaceId, null),
    name: name ?? 'New Folder',
  });
  if (name === undefined) startEditing(folderId);
}

export function deleteFolder(itemId: string) {
  dispatch({ type: 'deleteFolder', itemId });
}

export function setFolderIcon(itemId: string, icon: SpaceIcon | null) {
  dispatch({ type: 'setFolderIcon', itemId, icon });
}

/** Arc's Duplicate: a copy of the folder and everything in it, just below it, closed. */
export function duplicateFolder(itemId: string) {
  const { model } = useSidebar.getState();
  const copied = [itemId, ...descendants(model, itemId).map((item) => item.id)];
  dispatch({
    type: 'duplicateFolder',
    itemId,
    ids: Object.fromEntries(copied.map((id) => [id, newId()])),
  });
}

/** The one GitHub Live Folder, at the end of the shown space's Pinned section. */
export function newLiveFolder() {
  const { model, spaceId } = useSidebar.getState();
  if (githubFolderOf(model)) return;
  const order = orderAtEnd(model, spaceId, null);
  dispatch({ type: 'createLiveFolder', itemId: newId(), spaceId, order });
}

export function setLiveFilters(itemId: string, filters: GitHubFilters) {
  dispatch({ type: 'setLiveFilters', itemId, filters });
}

/** Asks GitHub again now; settles once the folder is up to date. */
export function refreshLiveFolder(itemId: string) {
  return dispatch({ type: 'refreshLiveFolder', itemId });
}

/** Arc doesn't make the Live Folder again until you do; its open tabs go to Today. */
export function deleteLiveFolder(itemId: string) {
  const { model, windowId } = useSidebar.getState();
  const folder = model.items[itemId];
  if (folder?.kind !== 'folder' || windowId === null) return;
  const inside = descendants(model, itemId);
  dispatch({
    type: 'deleteLiveFolder',
    itemId,
    itemIds: inside.map((item) => item.id),
    spaceId: folder.spaceId,
    windowId,
  });
  showUndoToast(`Deleted “${folder.name}”`, () =>
    dispatch({ type: 'restoreItems', items: [folder, ...inside] }),
  );
}

/** ⌘Z puts it back. (A split made by a drop is undone by separating it.) */
export function dropOn(source: DragSource, target: DropTarget) {
  if (target.section === 'split') drop(source, target);
  else undoable(() => drop(source, target));
}

function drop(source: DragSource, target: DropTarget) {
  const { model, spaceId, windowId } = useSidebar.getState();
  if (windowId === null) return;
  if (source.kind === 'many') return dropMany(source, target, windowId);
  const pair = source.kind === 'favorite' ? pairOf(source.itemId) : undefined;
  if (pair) return dropPair(pair, target, windowId);

  if (target.section === 'split') {
    if (source.kind === 'tab') splitTodayTabs(source.tabId, target.withTabId, target.side);
    return;
  }
  if (source.kind === 'split') {
    if (target.section === 'pinned') {
      const { parentId, beforeId, afterId } = target;
      const orders = ordersForDrop(model, spaceId, parentId, beforeId, afterId, [], 2);
      return pinSplit(source.tabIds, { parentId, orders });
    }
    if (target.section !== 'today') return;
    for (const tabId of source.tabIds) {
      dispatch({ type: 'reorderToday', windowId, tabId, beforeTabId: target.beforeTabId });
    }
    return;
  }
  const sourceId = source.kind === 'tab' ? null : source.itemId;

  if (target.section === 'favorites') {
    const order = orderForDrop(model, FAVORITES_ID, null, target.beforeId, null, sourceId);
    if (source.kind === 'tab') {
      const tab = useTabs.getState().tabs.get(source.tabId);
      if (!tab || favoriteCount() >= FAVORITES_LIMIT) return;
      dispatch({
        type: 'pinTab',
        itemId: newId(),
        tabId: source.tabId,
        spaceId: FAVORITES_ID,
        parentId: null,
        order,
        url: tab.url,
        title: tab.title,
      });
    } else if (source.kind !== 'folder') {
      dispatch({ type: 'moveToSpace', itemId: source.itemId, spaceId: FAVORITES_ID, order });
    }
    return;
  }

  if (target.section === 'today') {
    if (source.kind === 'tab') {
      dispatch({
        type: 'reorderToday',
        windowId,
        tabId: source.tabId,
        beforeTabId: target.beforeTabId,
      });
    } else if (source.kind === 'pin' || source.kind === 'favorite') {
      dispatch({
        type: 'unpin',
        itemId: source.itemId,
        windowId,
        spaceId: homeSpaceOf(source.itemId),
        todayBeforeTabId: target.beforeTabId,
      });
    }
    return;
  }

  const order = orderForDrop(
    model,
    spaceId,
    target.parentId,
    target.beforeId,
    target.afterId,
    sourceId,
  );
  if (source.kind === 'tab') {
    const tab = useTabs.getState().tabs.get(source.tabId);
    if (!tab) return;
    dispatch({
      type: 'pinTab',
      itemId: newId(),
      tabId: source.tabId,
      spaceId,
      parentId: target.parentId,
      order,
      url: tab.url,
      title: tab.title,
    });
  } else {
    // A favorite dropped into Pinned joins the shown space.
    dispatch({ type: 'move', itemId: source.itemId, spaceId, parentId: target.parentId, order });
  }
}

/** A dragged selection lands together, in order: Today tabs get pinned, pins get unpinned. */
function dropMany(
  source: Extract<DragSource, { kind: 'many' }>,
  target: DropTarget,
  windowId: number,
) {
  const { model, spaceId } = useSidebar.getState();
  const tabsState = useTabs.getState();
  clearSelection();

  if (target.section === 'today') {
    // The first tab at or below the line that isn't itself moving.
    const ids = selectTodayIds(tabsState);
    const from = target.beforeTabId === null ? ids.length : ids.indexOf(target.beforeTabId);
    const beforeTabId = ids.slice(Math.max(from, 0)).find((id) => !source.tabIds.includes(id));
    for (const itemId of source.itemIds) {
      dispatch({
        type: 'unpin',
        itemId,
        windowId,
        spaceId: homeSpaceOf(itemId),
        todayBeforeTabId: beforeTabId ?? null,
      });
    }
    for (const tabId of source.tabIds) {
      dispatch({ type: 'reorderToday', windowId, tabId, beforeTabId: beforeTabId ?? null });
    }
    return;
  }
  if (target.section !== 'pinned') return;

  const orders = ordersForDrop(
    model,
    spaceId,
    target.parentId,
    target.beforeId,
    target.afterId,
    source.itemIds,
    source.itemIds.length + source.tabIds.length,
  );
  source.itemIds.forEach((itemId, i) =>
    dispatch({ type: 'move', itemId, spaceId, parentId: target.parentId, order: orders[i]! }),
  );
  source.tabIds.forEach((tabId, i) => {
    const tab = tabsState.tabs.get(tabId);
    if (!tab) return;
    dispatch({
      type: 'pinTab',
      itemId: newId(),
      tabId,
      spaceId,
      parentId: target.parentId,
      order: orders[source.itemIds.length + i]!,
      url: tab.url,
      title: tab.title,
    });
  });
}

/** Alt+Up/Down moves a row one place among its siblings: the keyboard's drag and drop. */
export function moveByKeyboard(kind: string, id: string, delta: -1 | 1) {
  undoable(() => moveOneStep(kind, id, delta));
}

function moveOneStep(kind: string, id: string, delta: -1 | 1) {
  const { model, windowId } = useSidebar.getState();
  if (windowId === null) return;

  if (kind === 'tab') {
    const ids = selectTodayIds(useTabs.getState());
    const index = ids.indexOf(Number(id));
    if (index === -1 || index + delta < 0 || index + delta >= ids.length) return;
    const beforeTabId = delta < 0 ? ids[index - 1]! : (ids[index + 2] ?? null);
    dispatch({ type: 'reorderToday', windowId, tabId: Number(id), beforeTabId });
    return;
  }

  const item = model.items[id];
  if (!item) return;
  const siblings = childrenOf(model, item.spaceId, item.parentId);
  const index = siblings.findIndex((sibling) => sibling.id === id);
  const neighbour = siblings[index + delta];
  if (!neighbour) return;
  const order = orderForDrop(
    model,
    item.spaceId,
    item.parentId,
    delta < 0 ? neighbour.id : null,
    delta > 0 ? neighbour.id : null,
    id,
  );
  dispatch({ type: 'move', itemId: id, parentId: item.parentId, order });
}

function archiveEntry(tab: TabInfo, reason: ArchiveEntry['reason'], batchId: string): ArchiveEntry {
  return {
    id: newId(),
    url: tab.url,
    title: useSidebar.getState().session.tabTitles[tab.id] ?? tab.title,
    spaceId: useSidebar.getState().spaceId,
    archivedAt: Date.now(),
    reason,
    batchId,
  };
}

/** Closing a Today tab archives it, as in Arc. */
export function closeTodayTab(tabId: number) {
  closeTodayTabs([tabId]);
}

/** Closes Today tabs together (a split row's two), archiving them as one batch. */
export function closeTodayTabs(tabIds: readonly number[]) {
  const { tabs } = useTabs.getState();
  const { windowId } = useSidebar.getState();
  if (windowId === null) return;
  // Must run before they leave the panel's list.
  const below = stayingBelow(tabIds);
  const closing = leaveTabs(tabIds)
    .map((id) => tabs.get(id))
    .filter((tab): tab is TabInfo => tab !== undefined);
  if (!closing.length) return;
  const batchId = newId();
  const archived = closing.map((tab) => ({
    tabId: tab.id,
    entry: archiveEntry(tab, 'closed', batchId),
  }));
  dispatch({ type: 'archiveTabs', windowId, tabs: archived });
  const entryIds = archived.map(({ entry }) => entry.id);
  pushUndo(() => {
    followReopened(closing);
    restoreArchived(entryIds, below);
  });
}

/** Today's tabs from `from` on that would archive: all but ones playing audio. */
function archivable(from = 0): TabInfo[] {
  const tabsState = useTabs.getState();
  return selectTodayIds(tabsState)
    .slice(from)
    .map((id) => tabsState.tabs.get(id))
    .filter((tab): tab is TabInfo => tab !== undefined && !tab.audible);
}

/** Archives Today tabs as one batch, with an Undo toast that quick repeats add to. */
function archiveWithUndo(tabs: TabInfo[], verb: 'Cleared' | 'Archived') {
  const { windowId } = useSidebar.getState();
  if (windowId === null || !tabs.length) return;
  const batchId = newId();
  const archived = tabs.map((tab) => ({
    tabId: tab.id,
    entry: archiveEntry(tab, 'cleared', batchId),
  }));
  // Undo puts tabs archived from below a tab back there; cleared ones go on top.
  const below = verb === 'Archived' ? stayingBelow(tabs.map((tab) => tab.id)) : undefined;
  forgetTabs(tabs.map((tab) => tab.id));
  dispatch({ type: 'archiveTabs', windowId, tabs: archived });
  const count = (n: number) => `${n} ${n === 1 ? 'tab' : 'tabs'}`;
  const entryIds = archived.map(({ entry }) => entry.id);
  showUndoToast(
    `${verb} ${count(tabs.length)}`,
    () => {
      followReopened(tabs);
      restoreArchived(entryIds, below);
    },
    { key: verb, amount: tabs.length, message: (total) => `${verb} ${count(total)}` },
  );
}

export function clearToday() {
  const tabs = archivable();
  if (!tabs.length) return;
  // Closing every tab would close the window; keep one open, as Arc does.
  if (tabs.length === useTabs.getState().tabs.size) openNewTab();
  archiveWithUndo(tabs, 'Cleared');
}

/** Today tabs below a row (a tab, or a split's two), for Arc's Archive Tabs Below. */
export function tabsBelow(tabIds: readonly number[]): TabInfo[] {
  const ids = selectTodayIds(useTabs.getState());
  return archivable(Math.max(...tabIds.map((id) => ids.indexOf(id))) + 1);
}

export function archiveTabsBelow(tabIds: readonly number[]) {
  archiveWithUndo(tabsBelow(tabIds), 'Archived');
}

/** Reopens archived tabs: at the top of Today, or above `beforeTabId` (null: at the end). */
export function restoreArchived(entryIds: string[], beforeTabId?: number | null) {
  const { windowId } = useSidebar.getState();
  if (windowId === null) return;
  dispatch({
    type: 'restoreArchived',
    windowId,
    entryIds,
    ...(beforeTabId !== undefined && { beforeTabId }),
  });
}

/** The Today tab below the last of these that stays (null: they were at the end). */
function stayingBelow(tabIds: readonly number[]): number | null {
  const ids = selectTodayIds(useTabs.getState());
  const leaving = new Set(tabIds);
  const last = Math.max(...tabIds.map((id) => ids.indexOf(id)));
  return ids.slice(last + 1).find((id) => !leaving.has(id)) ?? null;
}

export function forgetArchived(entryIds: string[]) {
  dispatch({ type: 'forgetArchived', entryIds });
}

export function setArchiveAfter(archiveAfter: ArchiveAfter) {
  dispatch({ type: 'setArchiveAfter', archiveAfter });
}

/**
 * Unpin from the menu. It drops the saved URL and custom name, so it offers
 * Undo: a loaded pin is pinned again from its tab, an unloaded one restored.
 */
export function unpinWithUndo(itemId: string) {
  const { model, session } = useSidebar.getState();
  const item = model.items[itemId];
  if (item?.kind !== 'pin') return;
  const tabId = session.bindings[itemId];
  unpin(itemId);
  showUndoToast(
    `Unpinned “${item.customTitle ?? item.title}”`,
    () => {
      if (tabId === undefined || !useTabs.getState().tabs.has(tabId)) {
        dispatch({ type: 'restoreItems', items: [item] });
        return;
      }
      dispatch({
        type: 'pinTab',
        itemId: item.id,
        tabId,
        spaceId: item.spaceId,
        parentId: item.parentId,
        order: item.order,
        url: item.url,
        title: item.title,
        ...(item.pair && { pair: item.pair }),
      });
      if (item.customTitle) renameItem(item.id, item.customTitle);
    },
    { key: 'unpin', amount: 1, message: (total) => `Unpinned ${total} tabs` },
  );
}

/** Downloads spaces, pins, folders and settings as JSON, for Restore Sidebar. */
export function exportSidebar() {
  const { model } = useSidebar.getState();
  const file = toExportFile(model, new Date());
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `arc-sidebar-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function restoreSidebar(model: SidebarModel) {
  const { model: current, session, windowId } = useSidebar.getState();
  dispatch({ type: 'restoreSidebar', model, windowId: windowId! });
  showUndoToast('Sidebar restored', () =>
    dispatch({
      type: 'restoreSidebar',
      model: current,
      windowId: windowId!,
      bindings: session.bindings,
    }),
  );
}

/** Adds the chosen part of Arc's sidebar. */
export function importFromArc(arc: ArcSidebar, choice: ImportChoice) {
  const { model } = useSidebar.getState();
  const plan = planImport(model, arc, choice, newId);
  if (!plan.spaces.length && !plan.items.length) return;
  dispatch({ type: 'importSidebar', spaces: plan.spaces, items: plan.items });
  const tabs = plan.items.filter((item) => item.kind === 'pin').length;
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  showToast(
    plan.spaces.length
      ? `Imported ${count(plan.spaces.length, 'space')} and ${count(tabs, 'tab')}`
      : `Imported ${count(tabs, 'tab')}`,
  );
}

/**
 * Like Arc, re-selects the space's last-used tab, else its first open pin, else its top
 * Today tab; only an empty space gets a new tab.
 */
export function switchSpace(spaceId: string) {
  const { model, session, windowId, spaceId: current } = useSidebar.getState();
  const tabsState = useTabs.getState();
  if (windowId === null || spaceId === current) return;
  if (!model.spaces.some((space) => space.id === spaceId)) return;

  const isOpen = (tabId: number | undefined): tabId is number =>
    tabId !== undefined && tabsState.tabs.has(tabId);
  const pinnedTabs = flattenSpace(model, spaceId, () => false)
    .map(({ item }) => session.bindings[item.id])
    .filter(isOpen);
  const todayTabs = selectTodayIds(tabsState, spaceId);
  const last = session.lastActive[spaceId];
  const target =
    isOpen(last) && (pinnedTabs.includes(last) || todayTabs.includes(last))
      ? last
      : (pinnedTabs[0] ?? todayTabs[0]);

  dispatch({ type: 'setActiveSpace', windowId, spaceId, openNewTab: target === undefined });
  if (target !== undefined) activateTab(target);
}

/** The space before or after the current one (no wrap-around, as in Arc). */
export function switchSpaceBy(delta: -1 | 1) {
  const { model, spaceId } = useSidebar.getState();
  const index = model.spaces.findIndex((space) => space.id === spaceId);
  const next = model.spaces[index + delta];
  if (next) switchSpace(next.id);
}

export function createSpace(name?: string) {
  const { model, spaceId, windowId } = useSidebar.getState();
  if (windowId === null) return;
  const index = model.spaces.findIndex((space) => space.id === spaceId) + 1;
  const newSpaceId = newId();
  dispatch({
    type: 'createSpace',
    spaceId: newSpaceId,
    name: name ?? `Space ${model.spaces.length + 1}`,
    index,
  });
  dispatch({ type: 'setActiveSpace', windowId, spaceId: newSpaceId, openNewTab: true });
  if (name === undefined) startEditing(newSpaceId);
}

export function renameSpace(spaceId: string, name: string) {
  dispatch({ type: 'renameSpace', spaceId, name });
}

export function setSpaceIcon(spaceId: string, icon: SpaceIcon | null) {
  dispatch({ type: 'setSpaceIcon', spaceId, icon });
}

/** Its pins and folders go with it; its tabs move to a neighbouring space. */
export function deleteSpace(spaceId: string) {
  const { model, windowId } = useSidebar.getState();
  const index = model.spaces.findIndex((space) => space.id === spaceId);
  const space = model.spaces[index];
  const fallback = model.spaces[index - 1] ?? model.spaces[index + 1];
  if (!space || !fallback || windowId === null) return;
  const items = Object.values(model.items).filter((item) => item.spaceId === spaceId);
  dispatch({
    type: 'deleteSpace',
    spaceId,
    fallbackSpaceId: fallback.id,
    itemIds: items.map((item) => item.id),
    windowId,
  });
  showUndoToast(
    `Deleted “${space.name}”`,
    () => dispatch({ type: 'restoreSpace', space, index, items }),
    { key: 'deleteSpace', amount: 1, message: (total) => `Deleted ${total} spaces` },
  );
}

/** Moves a Today tab to another space; if it was selected, its neighbour takes over here. */
export function moveTabToSpace(tabId: number, spaceId: string) {
  const tabsState = useTabs.getState();
  if (tabsState.activeId === tabId) {
    const ids = selectTodayIds(tabsState);
    const index = ids.indexOf(tabId);
    const next = ids[index + 1] ?? ids[index - 1];
    if (next !== undefined) activateTab(next);
  }
  undoable(() => dispatch({ type: 'moveTabToSpace', tabId, spaceId }));
}

export function moveItemToSpace(itemId: string, spaceId: string) {
  const { model } = useSidebar.getState();
  const order = orderAtEnd(model, spaceId, null);
  undoable(() => dispatch({ type: 'moveToSpace', itemId, spaceId, order }));
}

export function setSpaceTheme(spaceId: string, theme: SpaceTheme | null) {
  dispatch({ type: 'setSpaceTheme', spaceId, theme });
}

export function setNavButtons(on: boolean) {
  dispatch({ type: 'setNavButtons', on });
}

export function setAppearance(appearance: Appearance) {
  dispatch({ type: 'setAppearance', appearance });
}

export function favoriteCount(): number {
  const { model } = useSidebar.getState();
  return Object.values(model.items).filter((item) => item.spaceId === FAVORITES_ID).length;
}

export function favoriteTab(tabId: number) {
  const tab = useTabs.getState().tabs.get(tabId);
  const { model } = useSidebar.getState();
  if (!tab || favoriteCount() >= FAVORITES_LIMIT) return;
  undoable(() =>
    dispatch({
      type: 'pinTab',
      itemId: newId(),
      tabId,
      spaceId: FAVORITES_ID,
      parentId: null,
      order: orderAtEnd(model, FAVORITES_ID, null),
      url: tab.url,
      title: tab.title,
    }),
  );
}

export function favoriteItem(itemId: string) {
  if (favoriteCount() >= FAVORITES_LIMIT) return;
  moveItemToSpace(itemId, FAVORITES_ID);
}

export function unfavoriteToPinned(itemId: string) {
  moveItemToSpace(itemId, useSidebar.getState().spaceId);
}

/** Puts a tab on `side` of another in Chrome's split view, and next to it in Today. */
export function splitTodayTabs(tabId: number, withTabId: number, side: 'left' | 'right') {
  const { windowId } = useSidebar.getState();
  if (windowId === null || tabId === withTabId) return;
  const ids = selectTodayIds(useTabs.getState()).filter((id) => id !== tabId);
  const beforeTabId = side === 'left' ? withTabId : (ids[ids.indexOf(withTabId) + 1] ?? null);
  dispatch({ type: 'reorderToday', windowId, tabId, beforeTabId });
  const [left, right] = side === 'left' ? [tabId, withTabId] : [withTabId, tabId];
  splitTabs(left, right);
  activateTab(tabId);
}

/** Arc's "Separate All Tabs": the two go back to being rows of their own. */
export function separateSplit(splitViewId: number) {
  unsplit(splitViewId);
}

/**
 * Arc's Option-click: splits a Today tab with the current one, on its right (the current tab
 * with a copy of itself). Chrome splits only two, so a tab already split is just selected.
 */
export function optionClickTab(tabId: number) {
  const { tabs, activeId, bound } = useTabs.getState();
  const current = activeId === null ? undefined : tabs.get(activeId);
  const tab = tabs.get(tabId);
  const free = (t: TabInfo | undefined) => t && t.splitViewId === undefined && !bound.has(t.id);
  if (!tab || !current || !free(tab) || !free(current)) return activateTab(tabId);
  if (tab.id === current.id) openInSplit(tab.id, tab.url);
  else splitTodayTabs(tab.id, current.id, 'right');
}

export function splitOf(tabId: number): number[] {
  const { tabs } = useTabs.getState();
  const split = tabs.get(tabId)?.splitViewId;
  if (split === undefined) return [tabId];
  return [...tabs.values()].filter((tab) => tab.splitViewId === split).map((tab) => tab.id);
}

export function moveTabsToSpace(tabIds: readonly number[], spaceId: string) {
  for (const tabId of tabIds) moveTabToSpace(tabId, spaceId);
}
