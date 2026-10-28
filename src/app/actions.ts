import { childrenOf, orderAtEnd, orderBefore } from '@/model/tree';
import { dispatch, newId, useSidebar } from '@/state/sidebar';
import { activateTab, forgetTab, selectTodayIds, useTabs } from '@/state/tabs';
import { startEditing } from '@/state/ui';
import { orderForDrop, type DragSource, type DropTarget } from './drag/targets';

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
