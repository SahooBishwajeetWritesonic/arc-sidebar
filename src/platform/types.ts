import type { Intent, IntentResult, SessionState, SidebarModel } from '@/model/types';

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

/**
 * Everything the panel needs from the browser. The extension implements it
 * over chrome.* (platform/chrome.ts); the dev harness implements it in memory.
 */
export interface Platform {
  currentWindowId(): Promise<number>;
  queryTabs(windowId: number): Promise<TabInfo[]>;
  onTabEvent(listener: (event: TabEvent) => void): () => void;

  /** Saved state, written only by the service. */
  loadModel(): Promise<SidebarModel>;
  onModelChange(listener: (model: SidebarModel) => void): () => void;
  loadSession(): Promise<SessionState>;
  onSessionChange(listener: (session: SessionState) => void): () => void;
  /** Resolves once the service has applied the intent; rejects if it failed. */
  sendIntent(intent: Intent): Promise<IntentResult>;

  activateTab(tabId: number): void;
  closeTab(tabId: number): void;
  newTab(windowId: number): void;
  setMuted(tabId: number, muted: boolean): void;
  faviconUrl(pageUrl: string): string | undefined;
}
