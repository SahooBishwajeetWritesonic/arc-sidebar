import { reconcileOrder, withTabOnTop, withoutTab } from '@/platform/today-order';
import type { Platform, TabEvent, TabInfo } from '@/platform/types';

export interface Fixture {
  title: string;
  url: string;
  audible?: boolean;
}

const WINDOW_ID = 1;

/**
 * In-memory Chrome tabs and background worker, with Chrome-like latency: tab events
 * arrive a few ms after the call, the worker's Today order a few ms after that.
 */
export class FakePlatform implements Platform {
  private tabs: TabInfo[] = []; // Chrome's strip order
  private order: number[] = [];
  private nextId = 1;
  private tabListeners = new Set<(event: TabEvent) => void>();
  private orderListeners = new Set<(order: number[]) => void>();

  constructor(fixtures: Fixture[]) {
    this.tabs = fixtures.map((fixture, i) => this.makeTab(fixture, i === 0));
    this.order = reconcileOrder(
      [],
      this.tabs.map((tab) => tab.id),
    );
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

  async getTodayOrder() {
    return [...this.order];
  }

  onTodayOrderChange(_windowId: number, listener: (order: number[]) => void) {
    this.orderListeners.add(listener);
    return () => void this.orderListeners.delete(listener);
  }

  activateTab(tabId: number) {
    const current = this.tabs.find((tab) => tab.active);
    if (current?.id === tabId) return;
    for (const tab of this.tabs) tab.active = tab.id === tabId;
    this.emit({ type: 'activate', tabId, windowId: WINDOW_ID });
  }

  closeTab(tabId: number) {
    const index = this.tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const [closed] = this.tabs.splice(index, 1);
    this.emit({ type: 'remove', tabId });
    this.setOrder(withoutTab(this.order, tabId));
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

  faviconUrl(tab: TabInfo) {
    if (!/^https?:/.test(tab.url)) return undefined;
    return `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32`;
  }

  // Simulation helpers for the harness controls

  openTab(fixture: Fixture) {
    const tab = this.makeTab(fixture, false);
    this.tabs.push(tab);
    this.emit({ type: 'upsert', tab: { ...tab } });
    this.setOrder(withTabOnTop(this.order, tab.id));
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

  activeTabId() {
    return this.tabs.find((tab) => tab.active)?.id;
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

  private simulateLoad(tabId: number) {
    this.patch(tabId, { loading: true, favIconUrl: undefined });
    setTimeout(
      () => this.patch(tabId, { loading: false, favIconUrl: 'loaded' }),
      600 + Math.random() * 900,
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
    setTimeout(() => this.tabListeners.forEach((listener) => listener(event)), 4);
  }

  private setOrder(order: number[]) {
    this.order = order;
    setTimeout(() => this.orderListeners.forEach((listener) => listener([...order])), 12);
  }
}
