import { create } from 'zustand';
import { isSamePage } from '@/model/urls';
import type { Platform, TabEvent, TabInfo } from '@/platform/types';

/** The window's live Chrome tabs, plus what the sidebar store tells us about them. */
export interface TabsState {
  ready: boolean;
  windowId: number | null;
  tabs: ReadonlyMap<number, TabInfo>;
  /** Today order from the service (tab ids, top first). */
  order: readonly number[];
  /** Tabs bound to pinned items; they show in Pinned, not Today. */
  bound: ReadonlySet<number>;
  /** URLs of pinned items whose tab is being opened right now. */
  openingUrls: readonly string[];
  activeId: number | null;
  /** The tab that was active before the current one; Arc tints it faintly. */
  previousId: number | null;
}

export const useTabs = create<TabsState>()(() => ({
  ready: false,
  windowId: null,
  tabs: new Map(),
  order: [],
  bound: new Set(),
  openingUrls: [],
  activeId: null,
  previousId: null,
}));

/**
 * Today's rows, top first. Tabs the service hasn't placed yet (it lags Chrome by a few ms) go
 * where it will put them; a tab a pinned item is opening never shows, even for a frame.
 */
export function selectTodayIds(state: TabsState): number[] {
  const inToday = (id: number) => state.tabs.has(id) && !state.bound.has(id);
  const ordered = state.order.filter(inToday);
  const placed = new Set(state.order);
  const pending = [...state.tabs.values()]
    .filter((tab) => !placed.has(tab.id) && inToday(tab.id))
    .filter((tab) => !state.openingUrls.some((url) => isSamePage(url, tab.url)))
    .map((tab) => tab.id)
    .reverse();
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

export async function connectTabs(source: Platform, windowId: number): Promise<() => void> {
  platform = source;
  // Listen before querying so nothing that happens in between is lost.
  const early: TabEvent[] = [];
  let live = false;
  const off = source.onTabEvent((event) => (live ? enqueue(event) : early.push(event)));

  const tabs = await source.queryTabs(windowId);
  useTabs.setState({
    ready: true,
    windowId,
    tabs: new Map(tabs.map((tab) => [tab.id, tab])),
    activeId: tabs.find((tab) => tab.active)?.id ?? null,
    previousId: null,
  });
  live = true;
  early.forEach(enqueue);
  return off;
}

export function faviconFor(pageUrl: string): string | undefined {
  return platform?.faviconUrl(pageUrl);
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
 * Closes a Today tab. Like Arc, selection moves to the row below (or above,
 * for the last row) at once, rather than wherever Chrome's tab strip would go.
 */
export function closeTab(id: number) {
  if (leaveTab(id)) platform?.closeTab(id);
}

/**
 * The panel side of closing a Today tab: selection moves to its neighbour
 * and the row goes at once. Returns false if the tab is already gone.
 */
export function leaveTab(id: number): boolean {
  const state = useTabs.getState();
  if (!state.tabs.has(id)) return false;
  if (state.activeId === id) {
    const ids = selectTodayIds(state);
    const index = ids.indexOf(id);
    const next = ids[index + 1] ?? ids[index - 1];
    if (next !== undefined) activateTab(next);
  }
  forgetTab(id);
  return true;
}

/** Drops a tab the panel is closing, before Chrome confirms it. */
export function forgetTab(id: number) {
  useTabs.setState((current) => applyTabEvents(current, [{ type: 'remove', tabId: id }]));
  // Ignore late updates for this tab until Chrome's own 'remove' arrives.
  closing.add(id);
}

export function openNewTab() {
  const { windowId } = useTabs.getState();
  if (windowId !== null) platform?.newTab(windowId);
}

export function toggleMuted(id: number) {
  const tab = useTabs.getState().tabs.get(id);
  if (tab) platform?.setMuted(id, !tab.muted);
}
