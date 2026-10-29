import { generateNKeysBetween } from 'fractional-indexing';
import { closePin, closeTodayTabs, moveItemToSpace, moveTabsToSpace } from '@/app/actions';
import { copyText } from '@/app/command/run';
import type { Ghost } from '@/app/drag/drag';
import type { DragSource } from '@/app/drag/targets';
import type { MenuEntry } from '@/app/rows/RowMenu';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import { showToast } from '@/app/toast/toast';
import { copiedText, linksText, type Link } from '@/model/links';
import { childrenOf, flattenSpace, orderAtEnd, orderBefore } from '@/model/tree';
import type { PinItem } from '@/model/types';
import type { TabInfo } from '@/platform/types';
import {
  clearSelection,
  isSelectable,
  rowKey,
  selectRange,
  splitKey,
  tabsOfKey,
  toggleRow,
  useSelection,
  type RowKey,
} from '@/state/selection';
import { dispatch, newId, useSidebar } from '@/state/sidebar';
import { selectTodayIds, useTabs } from '@/state/tabs';
import { startEditing } from '@/state/ui';

/**
 * What can be done to several rows at once (Arc: Copy URLs, New Folder, move, close).
 * Each acts top to bottom: pinned tabs first, then Today's.
 */

/** ⌘- or ⇧-click on `row`: the rows it counts are the ones drawn on the shown space. */
export function selectFrom(row: HTMLElement, key: RowKey, range: boolean) {
  const page = row.closest('[data-active-page]') ?? document;
  const rows = [...page.querySelectorAll<HTMLElement>('[data-nav-row]')].filter(
    (each) => isSelectable(each.dataset.navRow!) && each.dataset.leaving === undefined,
  );
  const keyOf = (each: HTMLElement) => rowKey(each.dataset.navRow!, each.dataset.rowId!);
  const active = rows.find((each) => each.dataset.selected !== undefined);
  const activeKey = active ? keyOf(active) : null;
  if (range) selectRange(rows.map(keyOf), key, activeKey);
  else toggleRow(key, activeKey);
}

interface Picked {
  pins: PinItem[];
  /** Today's tabs, a split row's two included. */
  tabs: TabInfo[];
}

function picked(): Picked {
  const { keys } = useSelection.getState();
  const { model, spaceId } = useSidebar.getState();
  const tabsState = useTabs.getState();
  const pinIds = new Set(
    keys.filter((key) => splitKey(key)[0] === 'pin').map((key) => splitKey(key)[1]),
  );
  const tabIds = new Set(
    keys.filter((key) => splitKey(key)[0] !== 'pin').flatMap((key) => tabsOfKey(key)),
  );
  const pins = flattenSpace(model, spaceId, () => true)
    .map(({ item }) => item)
    .filter((item): item is PinItem => item.kind === 'pin' && pinIds.has(item.id));
  const tabs = selectTodayIds(tabsState)
    .filter((id) => tabIds.has(id))
    .map((id) => tabsState.tabs.get(id)!);
  return { pins, tabs };
}

const openTabOf = (pin: PinItem): TabInfo | undefined => {
  const tabId = useSidebar.getState().session.bindings[pin.id];
  return tabId === undefined ? undefined : useTabs.getState().tabs.get(tabId);
};

/** Pinned tabs that can move: a Live Folder's pull requests stay in it. */
const movable = (pins: PinItem[]) => pins.filter((pin) => !pin.live);

/** Today tabs that can be pinned: not one of a split's two. */
const loose = (tabs: TabInfo[]) => tabs.filter((tab) => tab.splitViewId === undefined);

const count = (n: number) => `${n} ${n === 1 ? 'Tab' : 'Tabs'}`;

export function selectionMenu(): MenuEntry[] {
  const { pins, tabs } = picked();
  const { model, spaceId } = useSidebar.getState();
  const open = tabs.length + pins.filter((pin) => openTabOf(pin)).length;
  const fileable = movable(pins).length + loose(tabs).length;
  return [
    { label: 'Copy URLs', onSelect: () => copySelection() },
    ...(fileable ? [{ label: 'New Folder', onSelect: newFolderWithSelection }] : []),
    ...(loose(tabs).length
      ? [{ label: `Pin ${count(loose(tabs).length)}`, onSelect: pinSelection }]
      : []),
    ...(tabs.length || movable(pins).length
      ? moveToSpaceMenu(model.spaces, spaceId, moveSelectionToSpace)
      : []),
    ...(open
      ? ['separator' as const, { label: `Close ${count(open)}`, onSelect: closeSelection }]
      : []),
  ];
}

/** The selection's addresses, as Arc's Copy URLs: a pinned tab's page if it's open. */
export function selectionLinks(): Link[] {
  const { pins, tabs } = picked();
  return [
    ...pins.map((pin) => {
      const tab = openTabOf(pin);
      return tab ? { url: tab.url, title: tab.title } : { url: pin.url, title: pin.title };
    }),
    ...tabs.map((tab) => ({ url: tab.url, title: tab.title })),
  ];
}

export async function copySelection(markdown = false) {
  const links = selectionLinks();
  if (!links.length) return;
  await copyText(linksText(links, markdown));
  showToast(copiedText(links.length, markdown));
}

/** Closes every open tab in the selection; pinned tabs keep their pins. */
export function closeSelection() {
  const { pins, tabs } = picked();
  clearSelection();
  closeTodayTabs(tabs.map((tab) => tab.id));
  for (const pin of pins) if (openTabOf(pin)) closePin(pin.id);
}

export function pinSelection() {
  const tabs = loose(picked().tabs);
  const { model, spaceId } = useSidebar.getState();
  const last = childrenOf(model, spaceId, null).at(-1);
  const orders = generateNKeysBetween(last?.order ?? null, null, tabs.length);
  clearSelection();
  tabs.forEach((tab, i) => pinInto(tab, null, orders[i]!));
}

/**
 * Arc's New Folder for a selection: the folder takes the first pin's place (else the end of
 * Pinned) and the rows go in; Today tabs get pinned into it.
 */
export function newFolderWithSelection() {
  const { pins: all, tabs: allTabs } = picked();
  const pins = movable(all);
  const tabs = loose(allTabs);
  if (!pins.length && !tabs.length) return;
  const { model, spaceId } = useSidebar.getState();
  const first = pins[0];
  const folderId = newId();
  clearSelection();
  dispatch({
    type: 'createFolder',
    itemId: folderId,
    spaceId,
    parentId: first?.parentId ?? null,
    order: first ? orderBefore(model, first) : orderAtEnd(model, spaceId, null),
    name: 'New Folder',
  });
  const orders = generateNKeysBetween(null, null, pins.length + tabs.length);
  pins.forEach((pin, i) =>
    dispatch({ type: 'move', itemId: pin.id, parentId: folderId, order: orders[i]! }),
  );
  tabs.forEach((tab, i) => pinInto(tab, folderId, orders[pins.length + i]!));
  startEditing(folderId);
}

function pinInto(tab: TabInfo, parentId: string | null, order: string) {
  dispatch({
    type: 'pinTab',
    itemId: newId(),
    tabId: tab.id,
    spaceId: useSidebar.getState().spaceId,
    parentId,
    order,
    url: tab.url,
    title: tab.title,
  });
}

export function moveSelectionToSpace(spaceId: string) {
  const { pins, tabs } = picked();
  clearSelection();
  for (const pin of movable(pins)) moveItemToSpace(pin.id, spaceId);
  moveTabsToSpace(
    tabs.map((tab) => tab.id),
    spaceId,
  );
}

/**
 * Pressing a selected row drags the whole selection under a stacked ghost of the pressed row.
 * Rows that can't move (a Live Folder's) stay behind.
 */
export function selectionDrag(pressed: { ghost: () => Omit<Ghost, 'width'> }): {
  source: DragSource;
  ghost: () => Omit<Ghost, 'width'>;
} | null {
  const { pins: all, tabs } = picked();
  const pins = movable(all);
  const moving = pins.length + tabs.length;
  if (moving < 2) return null;
  return {
    source: {
      kind: 'many',
      itemIds: pins.map((pin) => pin.id),
      tabIds: tabs.map((tab) => tab.id),
      bound: pins.every((pin) => openTabOf(pin)),
      pinnable: loose(tabs).length === tabs.length,
    },
    ghost: () => ({ ...pressed.ghost(), count: moving }),
  };
}
