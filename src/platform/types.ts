/** The slice of a Chrome tab the sidebar renders. */
export interface TabInfo {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  loading: boolean;
  active: boolean;
  audible: boolean;
  muted: boolean;
  discarded: boolean;
}

/** Chrome's tab events, normalised to the few shapes the panel cares about. */
export type TabEvent =
  | { type: 'upsert'; tab: TabInfo }
  | { type: 'remove'; tabId: number }
  | { type: 'activate'; tabId: number; windowId: number }
  | { type: 'replace'; addedTabId: number; removedTabId: number };

/** The UI's browser API: chrome.* in the extension, in memory in the dev harness. */
export interface Platform {
  currentWindowId(): Promise<number>;
  queryTabs(windowId: number): Promise<TabInfo[]>;
  onTabEvent(listener: (event: TabEvent) => void): () => void;
  /** Tab ids, top first; the background worker owns this order. */
  getTodayOrder(windowId: number): Promise<number[]>;
  onTodayOrderChange(windowId: number, listener: (order: number[]) => void): () => void;
  activateTab(tabId: number): void;
  closeTab(tabId: number): void;
  newTab(windowId: number): void;
  setMuted(tabId: number, muted: boolean): void;
  faviconUrl(tab: TabInfo): string | undefined;
}
