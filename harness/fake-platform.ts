import { generateNKeysBetween } from 'fractional-indexing';
import { SidebarService, type LiveTab } from '@/background/service';
import {
  DEFAULT_SPACE_ID,
  defaultSettings,
  emptyArchive,
  emptyModel,
  emptySession,
  emptySnapshot,
  type Appearance,
  type ArchiveState,
  type Backup,
  type Intent,
  type Item,
  type PinItem,
  type SessionState,
  type SidebarModel,
} from '@/model/types';
import type { Platform, TabEvent, TabInfo } from '@/platform/types';

export interface Fixture {
  title: string;
  url: string;
  audible?: boolean;
}

const WINDOW_ID = 1;
const MODEL_KEY = 'harness:model';
const SESSION_KEY = 'harness:session';
const ARCHIVE_KEY = 'harness:archive';
const BACKUPS_KEY = 'harness:backups';
const SNAPSHOT_KEY = 'harness:restoreSnapshot';
const DETAILS_KEY = 'harness:tabDetails';

/** ?theme=light|dark|system, so screenshots can pick a theme; dark by default. */
export function startingAppearance(): Appearance {
  const theme = new URLSearchParams(location.search).get('theme');
  return theme === 'light' ? 'light' : theme === 'system' ? 'auto' : 'dark';
}

function read<T>(storage: Storage, key: string, fallback: T): T {
  try {
    return JSON.parse(storage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

/**
 * An in-memory Chrome running the real SidebarService, with Chrome-like event latency.
 * Pins persist in localStorage; the session in sessionStorage, so "Restart Chrome" can clear it.
 */
export class FakePlatform implements Platform {
  private tabs: TabInfo[] = []; // Chrome's strip order
  private nextId = 1;
  private model: SidebarModel = read(localStorage, MODEL_KEY, {
    ...emptyModel(),
    // So the harness setting it on load isn't a change (with a backup).
    settings: { ...defaultSettings(), appearance: startingAppearance() },
  });
  private session: SessionState = read(sessionStorage, SESSION_KEY, emptySession());
  private archive: ArchiveState = read(localStorage, ARCHIVE_KEY, emptyArchive());
  private backups: Backup[] = read(localStorage, BACKUPS_KEY, []);
  /** When each tab was last viewed, like Chrome's tab.lastAccessed. */
  private accessed = new Map<number, number>();
  private archiveListeners = new Set<(archive: ArchiveState) => void>();
  /** Titles seen per URL, so a reopened tab gets its page title back. */
  private titles = new Map<string, string>([['chrome://newtab/', 'New Tab']]);
  private tabListeners = new Set<(event: TabEvent) => void>();
  private modelListeners = new Set<(model: SidebarModel) => void>();
  private sessionListeners = new Set<(session: SessionState) => void>();
  readonly service: SidebarService;

  constructor(fixtures: Fixture[]) {
    this.tabs = fixtures.map((fixture, i) => this.makeTab(fixture, i === 0));
    this.service = new SidebarService({
      queryTabs: async () => this.tabs.map((tab, index) => this.live(tab, index)),
      createTab: async (_windowId, url, active) =>
        this.openTab({ title: this.titles.get(url) ?? new URL(url).hostname, url }, active),
      activateTab: async (tabId) => this.activateTab(tabId),
      navigateTab: async (tabId, url) => this.navigate(tabId, url),
      closeTab: async (tabId) => this.closeTab(tabId),
      loadModel: async () => this.model,
      saveModel: async (model) => {
        this.model = model;
        localStorage.setItem(MODEL_KEY, JSON.stringify(model));
        this.later(12, () => this.modelListeners.forEach((listener) => listener(model)));
      },
      loadSession: async () => this.session,
      saveSession: async (session) => {
        this.session = session;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        this.later(12, () => this.sessionListeners.forEach((listener) => listener(session)));
      },
      loadArchive: async () => this.archive,
      saveArchive: async (archive) => {
        this.archive = archive;
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
        this.later(12, () => this.archiveListeners.forEach((listener) => listener(archive)));
      },
      loadBackups: async () => this.backups,
      saveBackups: async (backups) => {
        this.backups = backups;
        localStorage.setItem(BACKUPS_KEY, JSON.stringify(backups));
      },
      now: () => Date.now(),
      loadSnapshot: async () => read(localStorage, SNAPSHOT_KEY, emptySnapshot()),
      saveSnapshot: async (snapshot) =>
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)),
      loadTabDetails: async () => read(sessionStorage, DETAILS_KEY, {}),
      saveTabDetails: async (details) =>
        sessionStorage.setItem(DETAILS_KEY, JSON.stringify(details)),
      defer: (run, ms) => void setTimeout(run, ms),
      newId: () => crypto.randomUUID(),
    });
    void this.seed();
  }

  async currentWindowId() {
    return WINDOW_ID;
  }

  async queryTabs() {
    return this.tabs.map((tab) => ({ ...tab }));
  }

  onTabEvent(listener: (event: TabEvent) => void) {
    this.tabListeners.add(listener);
    return () => void this.tabListeners.delete(listener);
  }

  async loadModel() {
    await this.service.ready;
    return this.model;
  }

  onModelChange(listener: (model: SidebarModel) => void) {
    this.modelListeners.add(listener);
    return () => void this.modelListeners.delete(listener);
  }

  async loadSession() {
    await this.service.ready;
    return this.session;
  }

  onSessionChange(listener: (session: SessionState) => void) {
    this.sessionListeners.add(listener);
    return () => void this.sessionListeners.delete(listener);
  }

  async loadArchive() {
    await this.service.ready;
    return this.archive;
  }

  onArchiveChange(listener: (archive: ArchiveState) => void) {
    this.archiveListeners.add(listener);
    return () => void this.archiveListeners.delete(listener);
  }

  async sendIntent(intent: Intent) {
    await new Promise((resolve) => setTimeout(resolve, 6)); // message hop
    return this.service.handleIntent(intent);
  }

  activateTab(tabId: number) {
    const current = this.tabs.find((tab) => tab.active);
    if (current?.id === tabId || !this.tabs.some((tab) => tab.id === tabId)) return;
    for (const tab of this.tabs) tab.active = tab.id === tabId;
    this.accessed.set(tabId, Date.now());
    this.emit({ type: 'activate', tabId, windowId: WINDOW_ID });
    void this.service.onTabActivated(tabId, WINDOW_ID);
  }

  closeTab(tabId: number) {
    const index = this.tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const [closed] = this.tabs.splice(index, 1);
    this.emit({ type: 'remove', tabId });
    void this.service.onTabRemoved(tabId, WINDOW_ID);
    if (closed?.active) {
      // Chrome picks its own next tab; the panel usually got there first.
      const next = this.tabs[index] ?? this.tabs[index - 1];
      if (next) this.activateTab(next.id);
    }
  }

  newTab() {
    this.openTab({ title: 'New Tab', url: 'chrome://newtab/' });
  }

  setMuted(tabId: number, muted: boolean) {
    this.patch(tabId, { muted });
  }

  faviconUrl(pageUrl: string) {
    if (!/^https?:/.test(pageUrl)) return undefined;
    return `https://www.google.com/s2/favicons?domain=${new URL(pageUrl).hostname}&sz=32`;
  }

  // Simulation helpers for the harness controls

  openTab(fixture: Fixture, active = true) {
    const tab = this.makeTab(fixture, false);
    this.tabs.push(tab);
    this.emit({ type: 'upsert', tab: { ...tab } });
    void this.service.onTabCreated(this.live(tab, this.tabs.length - 1));
    if (active) this.activateTab(tab.id);
    if (/^https?:/.test(tab.url)) this.simulateLoad(tab.id);
  }

  closeRandom() {
    const tab = this.randomTab();
    if (tab) this.closeTab(tab.id);
  }

  reloadRandom() {
    const tab = this.randomTab();
    if (tab) this.simulateLoad(tab.id);
  }

  toggleAudibleRandom() {
    const tab = this.tabs.find((t) => t.audible) ?? this.randomTab();
    if (tab) this.patch(tab.id, { audible: !tab.audible, muted: false });
  }

  /** Follows a link inside the active tab, so a pinned tab shows its "/". */
  navigateActive() {
    const tab = this.tabs.find((t) => t.active);
    if (!tab || !/^https?:/.test(tab.url)) return;
    const url = new URL(tab.url);
    url.pathname = `/page-${Math.floor(Math.random() * 1000)}`;
    this.navigate(tab.id, url.href, `Another page on ${url.hostname}`);
  }

  /** Pretends nobody has looked at the inactive tabs for `hours`. */
  ageTabs(hours: number) {
    const then = Date.now() - hours * 3600_000;
    for (const tab of this.tabs) if (!tab.active) this.accessed.set(tab.id, then);
  }

  runAutoArchive() {
    return this.service.archiveStale();
  }

  activeTabId() {
    return this.tabs.find((tab) => tab.active)?.id;
  }

  /** Forgets the session, as a Chrome restart does, and reloads. */
  restartChrome() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DETAILS_KEY);
    location.reload();
  }

  resetEverything() {
    localStorage.removeItem(MODEL_KEY);
    localStorage.removeItem(ARCHIVE_KEY);
    localStorage.removeItem(BACKUPS_KEY);
    localStorage.removeItem(SNAPSHOT_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DETAILS_KEY);
    location.reload();
  }

  /**
   * First run: pins two tabs and puts two in a folder in one change, so no backup is taken of
   * a half-seeded sidebar; pinning each tab after that only binds it.
   */
  private async seed() {
    await this.service.ready;
    if (Object.keys(this.model.items).length > 0) return;
    const [gmail, calendar, linear, github] = this.tabs;
    if (!gmail || !calendar || !linear || !github) return;
    const keys = generateNKeysBetween(null, null, 3);
    const inner = generateNKeysBetween(null, null, 2);
    const folderId = crypto.randomUUID();
    const folder: Item = {
      kind: 'folder',
      id: folderId,
      spaceId: DEFAULT_SPACE_ID,
      parentId: null,
      order: keys[2]!,
      name: 'Dev',
      collapsed: false,
    };
    const pins = (
      [
        [gmail, keys[0]!, null],
        [calendar, keys[1]!, null],
        [linear, inner[0]!, folderId],
        [github, inner[1]!, folderId],
      ] as const
    ).map(([tab, order, parentId]): PinItem & { tabId: number } => ({
      kind: 'pin',
      id: crypto.randomUUID(),
      spaceId: DEFAULT_SPACE_ID,
      parentId,
      order,
      url: tab.url,
      title: tab.title,
      tabId: tab.id,
    }));
    await this.service.handleIntent({
      type: 'importSidebar',
      spaces: [],
      items: [folder, ...pins.map(({ tabId: _tab, ...pin }) => pin)],
    });
    for (const { tabId, id, spaceId, parentId, order, url, title } of pins) {
      await this.service.handleIntent({
        type: 'pinTab',
        itemId: id,
        tabId,
        spaceId,
        parentId,
        order,
        url,
        title,
      });
    }
  }

  private live(tab: TabInfo, index: number): LiveTab {
    return {
      id: tab.id,
      windowId: tab.windowId,
      index,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      audible: tab.audible,
      lastAccessed: this.accessed.get(tab.id),
    };
  }

  private makeTab(fixture: Fixture, active: boolean): TabInfo {
    this.accessed.set(this.nextId, Date.now());
    this.titles.set(fixture.url, fixture.title);
    return {
      id: this.nextId++,
      windowId: WINDOW_ID,
      title: fixture.title,
      url: fixture.url,
      favIconUrl: undefined,
      loading: false,
      active,
      audible: fixture.audible ?? false,
      muted: false,
      discarded: false,
    };
  }

  private navigate(tabId: number, url: string, title?: string) {
    this.patch(tabId, { url, title: title ?? new URL(url).hostname });
    this.simulateLoad(tabId);
  }

  private simulateLoad(tabId: number) {
    this.patch(tabId, { loading: true, favIconUrl: undefined });
    this.later(600 + Math.random() * 900, () =>
      this.patch(tabId, { loading: false, favIconUrl: 'loaded' }),
    );
  }

  private patch(tabId: number, change: Partial<TabInfo>) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    Object.assign(tab, change);
    this.emit({ type: 'upsert', tab: { ...tab } });
    if ('url' in change || 'title' in change) {
      void this.service.onTabUpdated(tabId, { url: tab.url, title: tab.title });
    }
  }

  private randomTab() {
    return this.tabs[Math.floor(Math.random() * this.tabs.length)];
  }

  private emit(event: TabEvent) {
    this.later(4, () => this.tabListeners.forEach((listener) => listener(event)));
  }

  private later(ms: number, run: () => void) {
    setTimeout(run, ms);
  }
}
