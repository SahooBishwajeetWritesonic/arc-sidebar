import { create } from 'zustand';
import type { Platform, TabEvent, TabInfo } from '@/platform/types';

export interface TabsState {
  ready: boolean;
  windowId: number | null;
  tabs: ReadonlyMap<number, TabInfo>;
  /** Today's tab ids, top first, as the background worker ordered them. */
  order: readonly number[];
  activeId: number | null;
  /** The tab that was active before the current one; Arc tints it faintly. */
  previousId: number | null;
}

export const useTabs = create<TabsState>()(() => ({
  ready: false,
  windowId: null,
  tabs: new Map(),
  order: [],
  activeId: null,
  previousId: null,
}));

/**
 * Tabs the worker hasn't ordered yet (it writes a few ms after Chrome's event) go on
 * top, newest first, which is where the worker will put them.
 */
export function selectTodayIds(state: TabsState): number[] {
  const ordered = state.order.filter((id) => state.tabs.has(id));
  const placed = new Set(ordered);
  const pending = [...state.tabs.keys()].filter((id) => !placed.has(id)).reverse();
  return [...pending, ...ordered];
}

/** Tabs closed from the panel that Chrome hasn't reported removed yet. */
const closing = new Set<number>();

export function applyTabEvents(state: TabsState, events: readonly TabEvent[]): Partial<TabsState> {
  let tabs = state.tabs;
  let copied = false;
  const edit = () => {
    if (!copied) {
      tabs = new Map(tabs);
      copied = true;
    }
    return tabs as Map<number, TabInfo>;
  };
  let { activeId, previousId } = state;
  const activate = (id: number) => {
    if (id === activeId) return;
    if (activeId !== null && tabs.has(activeId)) previousId = activeId;
    activeId = id;
  };

  for (const event of events) {
    switch (event.type) {
      case 'upsert': {
        const { tab } = event;
        if (closing.has(tab.id)) break;
        if (tab.windowId !== state.windowId) {
          if (tabs.has(tab.id)) edit().delete(tab.id);
          break;
        }
        // Activation comes only from 'activate' events: a late update can
        // still say active: true for a tab the user has already left.
        edit().set(tab.id, tab);
        break;
      }
      case 'remove':
        closing.delete(event.tabId);
        if (tabs.has(event.tabId)) edit().delete(event.tabId);
        if (activeId === event.tabId) activeId = null;
        if (previousId === event.tabId) previousId = null;
        break;
      case 'activate':
        if (event.windowId === state.windowId) activate(event.tabId);
        break;
      case 'replace': {
        const tab = tabs.get(event.removedTabId);
        if (tab) {
          edit().delete(event.removedTabId);
          edit().set(event.addedTabId, { ...tab, id: event.addedTabId });
        }
        if (activeId === event.removedTabId) activeId = event.addedTabId;
        if (previousId === event.removedTabId) previousId = event.addedTabId;
        break;
      }
    }
  }
  return { tabs, activeId, previousId };
}

let platform: Platform | undefined;
let queue: TabEvent[] = [];
let frame = 0;

function enqueue(event: TabEvent) {
  queue.push(event);
  frame ||= requestAnimationFrame(flush);
}

function flush() {
  frame = 0;
  const events = queue;
  queue = [];
  useTabs.setState((state) => applyTabEvents(state, events));
}

export async function connectTabs(source: Platform): Promise<() => void> {
  platform = source;
  // Listen before querying so nothing that happens in between is lost.
  const early: TabEvent[] = [];
  let live = false;
  const offTabs = source.onTabEvent((event) => (live ? enqueue(event) : early.push(event)));

  const windowId = await source.currentWindowId();
  let latestOrder: number[] | null = null;
  const offOrder = source.onTodayOrderChange(windowId, (order) => {
    latestOrder = order;
    if (live) useTabs.setState({ order });
  });

  const [tabs, storedOrder] = await Promise.all([
    source.queryTabs(windowId),
    source.getTodayOrder(windowId),
  ]);
  useTabs.setState({
    ready: true,
    windowId,
    tabs: new Map(tabs.map((tab) => [tab.id, tab])),
    order: latestOrder ?? (storedOrder.length ? storedOrder : tabs.map((tab) => tab.id)),
    activeId: tabs.find((tab) => tab.active)?.id ?? null,
    previousId: null,
  });
  live = true;
  early.forEach(enqueue);

  return () => {
    offTabs();
    offOrder();
  };
}

export function faviconFor(tab: TabInfo): string | undefined {
  return platform?.faviconUrl(tab);
}

export function activateTab(id: number) {
  const { activeId, tabs } = useTabs.getState();
  if (id === activeId || !tabs.has(id)) return;
  useTabs.setState((state) =>
    applyTabEvents(state, [{ type: 'activate', tabId: id, windowId: state.windowId! }]),
  );
  platform?.activateTab(id);
}

/**
 * Like Arc, selection moves at once to the row below (or above, for the last row),
 * rather than wherever Chrome's tab strip would go.
 */
export function closeTab(id: number) {
  const state = useTabs.getState();
  if (!state.tabs.has(id)) return;
  if (state.activeId === id) {
    const ids = selectTodayIds(state);
    const index = ids.indexOf(id);
    const next = ids[index + 1] ?? ids[index - 1];
    if (next !== undefined) activateTab(next);
  }
  useTabs.setState((current) => applyTabEvents(current, [{ type: 'remove', tabId: id }]));
  // Ignore late updates for this tab until Chrome's own 'remove' arrives.
  closing.add(id);
  platform?.closeTab(id);
}

export function openNewTab() {
  const { windowId } = useTabs.getState();
  if (windowId !== null) platform?.newTab(windowId);
}

export function toggleMuted(id: number) {
  const tab = useTabs.getState().tabs.get(id);
  if (tab) platform?.setMuted(id, !tab.muted);
}
