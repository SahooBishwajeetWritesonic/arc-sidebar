import { generateNKeysBetween } from 'fractional-indexing';
import { SidebarService, type LiveTab } from '@/background/service';
import {
  DEFAULT_SPACE_ID,
  emptyModel,
  emptySession,
  type Intent,
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
  private model: SidebarModel = read(localStorage, MODEL_KEY, emptyModel());
  private session: SessionState = read(sessionStorage, SESSION_KEY, emptySession());
  private tabListeners = new Set<(event: TabEvent) => void>();
  private modelListeners = new Set<(model: SidebarModel) => void>();
  private sessionListeners = new Set<(session: SessionState) => void>();
  readonly service: SidebarService;

  constructor(fixtures: Fixture[]) {
    this.tabs = fixtures.map((fixture, i) => this.makeTab(fixture, i === 0));
    this.service = new SidebarService({
      queryTabs: async () => this.tabs.map((tab, index) => this.live(tab, index)),
      getTab: async (tabId) => {
        const index = this.tabs.findIndex((tab) => tab.id === tabId);
        return index === -1 ? undefined : this.live(this.tabs[index]!, index);
      },
      createTab: async (_windowId, url) => this.openTab({ title: new URL(url).hostname, url }),
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
      now: () => Date.now(),
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

  async sendIntent(intent: Intent) {
    await new Promise((resolve) => setTimeout(resolve, 6)); // message hop
    return this.service.handleIntent(intent);
  }

  activateTab(tabId: number) {
    const current = this.tabs.find((tab) => tab.active);
    if (current?.id === tabId || !this.tabs.some((tab) => tab.id === tabId)) return;
    for (const tab of this.tabs) tab.active = tab.id === tabId;
    this.emit({ type: 'activate', tabId, windowId: WINDOW_ID });
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

  openTab(fixture: Fixture) {
    const tab = this.makeTab(fixture, false);
    this.tabs.push(tab);
    this.emit({ type: 'upsert', tab: { ...tab } });
    void this.service.onTabCreated(this.live(tab, this.tabs.length - 1));
    this.activateTab(tab.id);
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

  activeTabId() {
    return this.tabs.find((tab) => tab.active)?.id;
  }

  /** Forgets the session, as a Chrome restart does, and reloads. */
  restartChrome() {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  resetEverything() {
    localStorage.removeItem(MODEL_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  /** First run: pin two tabs and put two more in a folder, through the service. */
  private async seed() {
    await this.service.ready;
    if (Object.keys(this.model.items).length > 0) return;
    const [gmail, calendar, linear, github] = this.tabs;
    if (!gmail || !calendar || !linear || !github) return;
    const keys = generateNKeysBetween(null, null, 3);
    const pin = (tab: TabInfo, order: string, parentId: string | null): Intent => ({
      type: 'pinTab',
      itemId: crypto.randomUUID(),
      tabId: tab.id,
      spaceId: DEFAULT_SPACE_ID,
      parentId,
      order,
      url: tab.url,
      title: tab.title,
    });
    const folderId = crypto.randomUUID();
    await this.service.handleIntent(pin(gmail, keys[0]!, null));
    await this.service.handleIntent(pin(calendar, keys[1]!, null));
    await this.service.handleIntent({
      type: 'createFolder',
      itemId: folderId,
      spaceId: DEFAULT_SPACE_ID,
      parentId: null,
      order: keys[2]!,
      name: 'Dev',
    });
    const inner = generateNKeysBetween(null, null, 2);
    await this.service.handleIntent(pin(linear, inner[0]!, folderId));
    await this.service.handleIntent(pin(github, inner[1]!, folderId));
  }

  private live(tab: TabInfo, index: number): LiveTab {
    return { id: tab.id, windowId: tab.windowId, index, url: tab.url };
  }

  private makeTab(fixture: Fixture, active: boolean): TabInfo {
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
