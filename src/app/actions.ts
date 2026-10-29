import type { ArcSidebar } from '@/import/arc';
import { planImport, type ImportChoice } from '@/import/plan';
import { toExportFile } from '@/model/backup';
import { childrenOf, flattenSpace, orderAtEnd, orderBefore } from '@/model/tree';
import {
  FAVORITES_ID,
  FAVORITES_LIMIT,
  type Appearance,
  type ArchiveAfter,
  type ArchiveEntry,
  type SidebarModel,
  type SpaceIcon,
  type SpaceTheme,
} from '@/model/types';
import type { TabInfo } from '@/platform/types';
import { dispatch, newId, useSidebar } from '@/state/sidebar';
import {
  activateTab,
  forgetTab,
  forgetTabs,
  leaveTab,
  openNewTab,
  selectTodayIds,
  useTabs,
} from '@/state/tabs';
import { startEditing } from '@/state/ui';
import { orderForDrop, type DragSource, type DropTarget } from './drag/targets';
import { showToast } from './toast/toast';

/** What the user can do in the sidebar: mouse, keyboard and context menus all go through here. */

const boundTab = (itemId: string) => useSidebar.getState().session.bindings[itemId];

export function pressPin(itemId: string) {
  const tabId = boundTab(itemId);
  if (tabId !== undefined && useTabs.getState().tabs.has(tabId)) {
    activateTab(tabId);
  } else {
    dispatch({ type: 'openPin', itemId, windowId: useSidebar.getState().windowId! });
  }
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
  dispatch({
    type: 'pinTab',
    itemId: newId(),
    tabId,
    spaceId,
    parentId: null,
    order: orderAtEnd(model, spaceId, null),
    url: tab.url,
    title: tab.title,
  });
}

export function setFolderCollapsed(itemId: string, collapsed: boolean) {
  dispatch({ type: 'setFolderCollapsed', itemId, collapsed });
}

export function renameItem(itemId: string, title: string) {
  dispatch({ type: 'rename', itemId, title });
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

export function dropOn(source: DragSource, target: DropTarget) {
  const { model, spaceId, windowId } = useSidebar.getState();
  if (windowId === null) return;
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

/** Alt+Up/Down moves a row one place among its siblings: the keyboard's drag and drop. */
export function moveByKeyboard(kind: string, id: string, delta: -1 | 1) {
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
    title: tab.title,
    spaceId: useSidebar.getState().spaceId,
    archivedAt: Date.now(),
    reason,
    batchId,
  };
}

/** Closing a Today tab archives it, as in Arc. */
export function closeTodayTab(tabId: number) {
  const tab = useTabs.getState().tabs.get(tabId);
  const { windowId } = useSidebar.getState();
  if (!tab || windowId === null || !leaveTab(tabId)) return;
  dispatch({
    type: 'archiveTabs',
    windowId,
    tabs: [{ tabId, entry: archiveEntry(tab, 'closed', newId()) }],
  });
}

export function clearToday() {
  const tabsState = useTabs.getState();
  const { windowId } = useSidebar.getState();
  if (windowId === null) return;
  const tabs = selectTodayIds(tabsState)
    .map((id) => tabsState.tabs.get(id))
    .filter((tab): tab is TabInfo => tab !== undefined && !tab.audible);
  if (!tabs.length) return;

  // Closing every tab would close the window; keep one open, as Arc does.
  if (tabs.length === tabsState.tabs.size) openNewTab();
  const batchId = newId();
  const archived = tabs.map((tab) => ({
    tabId: tab.id,
    entry: archiveEntry(tab, 'cleared', batchId),
  }));
  forgetTabs(tabs.map((tab) => tab.id));
  dispatch({ type: 'archiveTabs', windowId, tabs: archived });
  showToast(`Cleared ${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'}`, {
    label: 'Undo',
    run: () => restoreArchived(archived.map(({ entry }) => entry.id)),
  });
}

export function restoreArchived(entryIds: string[]) {
  const { windowId } = useSidebar.getState();
  if (windowId !== null) dispatch({ type: 'restoreArchived', windowId, entryIds });
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
  showToast(`Unpinned “${item.customTitle ?? item.title}”`, {
    label: 'Undo',
    run: () => {
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
      });
      if (item.customTitle) renameItem(item.id, item.customTitle);
    },
  });
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
  showToast('Sidebar restored', {
    label: 'Undo',
    run: () =>
      dispatch({
        type: 'restoreSidebar',
        model: current,
        windowId: windowId!,
        bindings: session.bindings,
      }),
  });
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
  showToast(`Deleted “${space.name}”`, {
    label: 'Undo',
    run: () => dispatch({ type: 'restoreSpace', space, index, items }),
  });
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
  dispatch({ type: 'moveTabToSpace', tabId, spaceId });
}

export function moveItemToSpace(itemId: string, spaceId: string) {
  const { model } = useSidebar.getState();
  dispatch({ type: 'moveToSpace', itemId, spaceId, order: orderAtEnd(model, spaceId, null) });
}

export function setSpaceTheme(spaceId: string, theme: SpaceTheme | null) {
  dispatch({ type: 'setSpaceTheme', spaceId, theme });
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
  dispatch({
    type: 'pinTab',
    itemId: newId(),
    tabId,
    spaceId: FAVORITES_ID,
    parentId: null,
    order: orderAtEnd(model, FAVORITES_ID, null),
    url: tab.url,
    title: tab.title,
  });
}

export function favoriteItem(itemId: string) {
  if (favoriteCount() >= FAVORITES_LIMIT) return;
  moveItemToSpace(itemId, FAVORITES_ID);
}

export function unfavoriteToPinned(itemId: string) {
  moveItemToSpace(itemId, useSidebar.getState().spaceId);
}
