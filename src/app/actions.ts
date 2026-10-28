import { childrenOf, orderAtEnd, orderBefore } from '@/model/tree';
import type { ArchiveAfter, ArchiveEntry } from '@/model/types';
import type { TabInfo } from '@/platform/types';
import { dispatch, newId, useSidebar } from '@/state/sidebar';
import {
  activateTab,
  forgetTab,
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

export function unpin(itemId: string) {
  dispatch({ type: 'unpin', itemId, windowId: useSidebar.getState().windowId! });
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

export function newFolder() {
  const { model, spaceId } = useSidebar.getState();
  const folderId = newId();
  dispatch({
    type: 'createFolder',
    itemId: folderId,
    spaceId,
    parentId: null,
    order: orderAtEnd(model, spaceId, null),
    name: 'New Folder',
  });
  startEditing(folderId);
}

export function deleteFolder(itemId: string) {
  dispatch({ type: 'deleteFolder', itemId });
}

export function dropOn(source: DragSource, target: DropTarget) {
  const { model, spaceId, windowId } = useSidebar.getState();
  if (windowId === null) return;

  if (target.section === 'today') {
    if (source.kind === 'tab') {
      dispatch({
        type: 'reorderToday',
        windowId,
        tabId: source.tabId,
        beforeTabId: target.beforeTabId,
      });
    } else if (source.kind === 'pin') {
      dispatch({
        type: 'unpin',
        itemId: source.itemId,
        windowId,
        todayBeforeTabId: target.beforeTabId,
      });
    }
    return;
  }

  const sourceId = source.kind === 'tab' ? null : source.itemId;
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
    dispatch({ type: 'move', itemId: source.itemId, parentId: target.parentId, order });
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
  for (const tab of tabs) forgetTab(tab.id);
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

export function exportSidebar() {
  const { model } = useSidebar.getState();
  const data = { app: 'arc-sidebar', format: 1, exportedAt: new Date().toISOString(), model };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `arc-sidebar-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
