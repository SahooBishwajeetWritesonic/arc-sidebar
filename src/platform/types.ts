import type {
  ArchiveState,
  Backup,
  Intent,
  IntentResult,
  SessionState,
  SidebarModel,
} from '@/model/types';

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
  /** Chrome's split view it's in (two tabs side by side), if any. */
  splitViewId?: number;
  openerTabId?: number;
}

/** A page from Chrome's history, as the command bar uses it. */
export interface HistoryEntry {
  url: string;
  title: string;
  visitCount: number;
  /** Times the address was typed rather than clicked to; drives inline completion. */
  typedCount: number;
  lastVisitTime: number;
}

/** What a page playing sound reports, for the sidebar's media player. */
export interface MediaState {
  playing: boolean;
  /** From the page's Media Session, when it sets one. */
  title?: string;
  artist?: string;
  artwork?: string;
  /** Media Session actions the page handles ('nexttrack', 'previoustrack', …). */
  actions: string[];
}

export type MediaAction = 'play' | 'pause' | 'nexttrack' | 'previoustrack';

/** Site permissions the URL bar's site menu can show and change (Chrome's content settings). */
export type SitePermissionKind =
  | 'javascript'
  | 'images'
  | 'popups'
  | 'notifications'
  | 'location'
  | 'camera'
  | 'microphone'
  | 'automaticDownloads'
  | 'cookies';

export type SitePermissionSetting = 'allow' | 'block' | 'ask' | 'session_only';

export interface SitePermission {
  kind: SitePermissionKind;
  setting: SitePermissionSetting;
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
  loadArchive(): Promise<ArchiveState>;
  onArchiveChange(listener: (archive: ArchiveState) => void): () => void;
  /** The service's rolling copies of the model, newest first. */
  loadBackups(): Promise<Backup[]>;
  /** Why Arc Sync's last try didn't go through, if it didn't. */
  loadSyncProblem(): Promise<string | undefined>;
  /** Resolves once the service has applied the intent; rejects if it failed. */
  sendIntent(intent: Intent): Promise<IntentResult>;

  activateTab(tabId: number): void;
  closeTab(tabId: number): void;
  newTab(windowId: number): void;
  setMuted(tabId: number, muted: boolean): void;
  faviconUrl(pageUrl: string): string | undefined;

  /** The window's tabs, most recently used first (Chrome's lastAccessed). */
  recentTabs(windowId: number): Promise<number[]>;
  searchHistory(text: string): Promise<HistoryEntry[]>;
  /** Opens `url` in a new tab, which lands at the top of Today. */
  openUrl(windowId: number, url: string): void;
  /** Loads `url` in the tab, in place (the URL bar's ⌘L). */
  navigateTab(tabId: number, url: string): void;
  /** Searches with Chrome's default search engine, in a new tab or in `tabId`. */
  searchWeb(text: string, tabId?: number): void;
  /** Copies the tab, history and all, just below it; settles once the copy is open. */
  duplicateTab(tabId: number): Promise<void>;
  /**
   * Back (-1) or forward (1) in the tab's history; `inNewTab` opens that page
   * in a copy of the tab instead, history and all (Arc's ⌘-click).
   */
  historyStep(tabId: number, by: -1 | 1, inNewTab?: boolean): void;
  reloadTab(tabId: number): void;
  stopLoading(tabId: number): void;
  /** Arc's Move to New Window: the tab, as it is, in a new window. */
  moveToNewWindow(tabId: number): void;
  /** Arc's Little Arc: the tab, or a page, in a small window of its own. */
  openInLittleArc(windowId: number, what: { tabId: number } | { url: string }): void;

  /** Shows two tabs side by side in Chrome's split view, `left` on the left. */
  splitTabs(left: number, right: number): void;
  unsplit(splitViewId: number): void;
  /** Opens `url` in a new tab split with `tabId`, on its right. */
  openInSplit(tabId: number, url: string): void;

  /**
   * Opens Arc's capture tool over the tab's page (it copies what you pick);
   * false when Chrome keeps extensions out of the page.
   */
  startCapture(tabId: number): Promise<boolean>;
  /**
   * A PNG of the whole page, through Chrome's debugger (which shows its
   * banner meanwhile); null when Chrome won't let it be captured.
   */
  captureFullPage(tabId: number): Promise<Blob | null>;
  /** The page's site's permissions that differ from Chrome's defaults. */
  sitePermissions(url: string): Promise<SitePermission[]>;
  setSitePermission(
    url: string,
    kind: SitePermissionKind,
    setting: 'allow' | 'block',
  ): Promise<void>;

  /** What the page in `tabId` is playing; null when it can't be asked. */
  mediaState(tabId: number): Promise<MediaState | null>;
  mediaCommand(tabId: number, action: MediaAction): Promise<void>;
}
