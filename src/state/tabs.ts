import { create } from 'zustand';
import { hostname, isSamePage } from '@/model/urls';
import type { Platform, ReloadKind, SitePermissionKind, TabEvent, TabInfo } from '@/platform/types';
import { nextAfterClose, withNewTab } from '@/platform/today-order';

/** The window's live Chrome tabs, plus what the sidebar store tells us about them. */
export interface TabsState {
  ready: boolean;
  windowId: number | null;
  tabs: ReadonlyMap<number, TabInfo>;
  /** Today order from the service (tab ids, top first). */
  order: readonly number[];
  /** Tabs bound to pinned items; they show in Pinned, not Today. */
  bound: ReadonlySet<number>;
  /** Today tab id → space id, from the service. */
  tabSpaces: Readonly<Record<string, string>>;
  /** The space the panel shows. */
  spaceId: string;
  /** URLs of pinned items whose tab is being opened right now. */
  openingUrls: readonly string[];
  activeId: number | null;
  /** The tab that was active before the current one; Arc tints it faintly. */
  previousId: number | null;
  /** Most recently shown first. */
  recent: readonly number[];
}

export const useTabs = create<TabsState>()(() => ({
  ready: false,
  windowId: null,
  tabs: new Map(),
  order: [],
  bound: new Set(),
  tabSpaces: {},
  spaceId: '',
  openingUrls: [],
  activeId: null,
  previousId: null,
  recent: [],
}));

/**
 * Today's rows, top first. Tabs the service hasn't placed yet (it lags Chrome by a few ms) go
 * where it will put them; a tab a pinned item is opening never shows, even for a frame.
 */
export function selectTodayIds(state: TabsState, spaceId: string = state.spaceId): number[] {
  // A tab the service hasn't given a space yet is new, so it is in the shown space.
  const inSpace = (id: number) => (state.tabSpaces[id] ?? state.spaceId) === spaceId;
  const inToday = (id: number) => state.tabs.has(id) && !state.bound.has(id) && inSpace(id);
  const placed = new Set(state.order);
  const openerOf = (id: number) => state.tabs.get(id)?.openerTabId;
  // In the order Chrome opened them, each where the service will put it.
  return [...state.tabs.values()]
    .filter((tab) => !placed.has(tab.id))
    .filter((tab) => !state.openingUrls.some((url) => isSamePage(url, tab.url)))
    .reduce((order, tab) => withNewTab(order, tab.id, tab.openerTabId, openerOf), state.order)
    .filter(inToday);
}

/**
 * A tab with no title yet (still loading, or no <title>) shows its hostname, so no row is
 * blank and nothing pinned or archived from it is untitled.
 */
export const titled = (tab: TabInfo): TabInfo =>
  tab.title.trim() ? tab : { ...tab, title: hostname(tab.url) || tab.url };

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
  let { activeId, previousId, recent } = state;
  const activate = (id: number) => {
    if (id === activeId) return;
    if (activeId !== null && tabs.has(activeId)) previousId = activeId;
    activeId = id;
    recent = [id, ...recent.filter((other) => other !== id)];
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
        edit().set(tab.id, titled(tab));
        break;
      }
      case 'remove':
        closing.delete(event.tabId);
        if (tabs.has(event.tabId)) edit().delete(event.tabId);
        if (activeId === event.tabId) activeId = null;
        if (previousId === event.tabId) previousId = null;
        recent = recent.filter((id) => id !== event.tabId);
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
        recent = recent.map((id) => (id === event.removedTabId ? event.addedTabId : id));
        break;
      }
    }
  }
  return { tabs, activeId, previousId, recent };
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

  const [tabs, recent] = await Promise.all([
    source.queryTabs(windowId),
    source.recentTabs(windowId).catch(() => []),
  ]);
  useTabs.setState({
    ready: true,
    windowId,
    tabs: new Map(tabs.map((tab) => [tab.id, titled(tab)])),
    activeId: tabs.find((tab) => tab.active)?.id ?? null,
    previousId: null,
    recent,
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

/** Selection stays in the space, not where Chrome's tab strip would go. */
export function closeTab(id: number) {
  if (leaveTab(id)) platform?.closeTab(id);
}

/** False if it's already gone. */
export function leaveTab(id: number): boolean {
  return leaveTabs([id]).length > 0;
}

/**
 * If the shown tab goes, the most recently used of `stays` (Today's by default) is shown,
 * before Chrome picks its neighbour. Returns the tabs that were still open.
 */
export function leaveTabs(ids: readonly number[], stays?: readonly number[]): number[] {
  const state = useTabs.getState();
  const present = ids.filter((id) => state.tabs.has(id));
  if (!present.length) return present;
  if (state.activeId !== null && present.includes(state.activeId)) {
    const next = nextAfterClose(stays ?? selectTodayIds(state), present, state.recent);
    if (next !== undefined) activateTab(next);
  }
  forgetTabs(present);
  return present;
}

/** Drops tabs being closed from the panel before Chrome confirms it, in one update. */
export function forgetTabs(ids: readonly number[]) {
  const events = ids.map((tabId): TabEvent => ({ type: 'remove', tabId }));
  useTabs.setState((current) => applyTabEvents(current, events));
  // Ignore late updates for these tabs until Chrome's own 'remove' arrives.
  for (const id of ids) closing.add(id);
}

export const forgetTab = (id: number) => forgetTabs([id]);

export function openNewTab() {
  const { windowId } = useTabs.getState();
  if (windowId !== null) platform?.newTab(windowId);
}

/** Opens an address in a new tab (from the command bar). */
export function openUrl(url: string) {
  const { windowId } = useTabs.getState();
  if (windowId !== null) platform?.openUrl(windowId, url);
}

export function searchWeb(text: string) {
  platform?.searchWeb(text);
}

/** Loads an address in the selected tab instead (the URL bar's ⌘L). */
export function navigateActive(url: string) {
  const { activeId } = useTabs.getState();
  if (activeId !== null) platform?.navigateTab(activeId, url);
}

export function searchInActive(text: string) {
  const { activeId } = useTabs.getState();
  if (activeId !== null) platform?.searchWeb(text, activeId);
}

export function startCapture(tabId: number) {
  return platform?.startCapture(tabId) ?? Promise.resolve(false);
}

export function captureFullPage(tabId: number) {
  return platform?.captureFullPage(tabId) ?? Promise.resolve(null);
}

export function sitePermissions(url: string) {
  return platform?.sitePermissions(url) ?? Promise.resolve([]);
}

export function setSitePermission(
  url: string,
  kind: SitePermissionKind,
  setting: 'allow' | 'block',
) {
  return platform?.setSitePermission(url, kind, setting) ?? Promise.resolve();
}

export function moveToNewWindow(id: number) {
  platform?.moveToNewWindow(id);
}

export function duplicateTab(id: number): Promise<void> {
  return platform?.duplicateTab(id) ?? Promise.resolve();
}

export function historyStep(id: number, by: -1 | 1, inNewTab = false) {
  platform?.historyStep(id, by, inNewTab);
}

export function reloadTab(id: number, how?: ReloadKind) {
  platform?.reloadTab(id, how);
}

export function stopLoading(id: number) {
  platform?.stopLoading(id);
}

export function openInLittleArc(what: { tabId: number } | { url: string }) {
  const { windowId } = useTabs.getState();
  if (windowId !== null) platform?.openInLittleArc(windowId, what);
}

export function splitTabs(left: number, right: number) {
  platform?.splitTabs(left, right);
}

export function unsplit(splitViewId: number) {
  platform?.unsplit(splitViewId);
}

export function openInSplit(tabId: number, url: string) {
  platform?.openInSplit(tabId, url);
}

export function recentTabs() {
  const { windowId } = useTabs.getState();
  return (windowId !== null && platform?.recentTabs(windowId)) || Promise.resolve([]);
}

export function searchHistory(text: string, limit?: number) {
  return platform?.searchHistory(text, limit) ?? Promise.resolve([]);
}

export function fetchText(url: string, signal?: AbortSignal) {
  return platform?.fetchText(url, signal) ?? Promise.resolve(null);
}

export function toggleMuted(id: number) {
  const tab = useTabs.getState().tabs.get(id);
  if (tab) platform?.setMuted(id, !tab.muted);
}
