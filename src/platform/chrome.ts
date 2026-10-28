import { browser, type Browser } from 'wxt/browser';
import { todayOrderKey } from './today-order';
import type { Platform, TabEvent, TabInfo } from './types';

function toTabInfo(tab: Browser.tabs.Tab): TabInfo | undefined {
  if (tab.id === undefined || tab.id === browser.tabs.TAB_ID_NONE) return undefined;
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || tab.pendingUrl || tab.url || 'New Tab',
    url: tab.url || tab.pendingUrl || '',
    favIconUrl: tab.favIconUrl,
    loading: tab.status === 'loading',
    active: tab.active,
    audible: tab.audible ?? false,
    muted: tab.mutedInfo?.muted ?? false,
    discarded: tab.discarded,
  };
}

function readOrder(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : [];
}

export const chromePlatform: Platform = {
  async currentWindowId() {
    return (await browser.windows.getCurrent()).id!;
  },

  async queryTabs(windowId) {
    const tabs = await browser.tabs.query({ windowId });
    return tabs.map(toTabInfo).filter((tab): tab is TabInfo => tab !== undefined);
  },

  onTabEvent(listener) {
    const upsert = (tab: Browser.tabs.Tab) => {
      const info = toTabInfo(tab);
      if (info) listener({ type: 'upsert', tab: info });
    };
    const onUpdated = (_id: number, _change: unknown, tab: Browser.tabs.Tab) => upsert(tab);
    const onRemoved = (tabId: number) => listener({ type: 'remove', tabId });
    const onActivated = ({ tabId, windowId }: { tabId: number; windowId: number }) =>
      listener({ type: 'activate', tabId, windowId } satisfies TabEvent);
    const onReplaced = (addedTabId: number, removedTabId: number) =>
      listener({ type: 'replace', addedTabId, removedTabId });
    // A tab dragged in from another window: fetch it so the panel can render it.
    const onAttached = (tabId: number) => void browser.tabs.get(tabId).then(upsert, () => {});
    const onDetached = (tabId: number) => listener({ type: 'remove', tabId });

    browser.tabs.onCreated.addListener(upsert);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onReplaced.addListener(onReplaced);
    browser.tabs.onAttached.addListener(onAttached);
    browser.tabs.onDetached.addListener(onDetached);
    return () => {
      browser.tabs.onCreated.removeListener(upsert);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onReplaced.removeListener(onReplaced);
      browser.tabs.onAttached.removeListener(onAttached);
      browser.tabs.onDetached.removeListener(onDetached);
    };
  },

  async getTodayOrder(windowId) {
    const key = todayOrderKey(windowId);
    return readOrder((await browser.storage.session.get(key))[key]);
  },

  onTodayOrderChange(windowId, listener) {
    const key = todayOrderKey(windowId);
    const onChanged = (changes: Record<string, Browser.storage.StorageChange>) => {
      if (key in changes) listener(readOrder(changes[key]?.newValue));
    };
    browser.storage.session.onChanged.addListener(onChanged);
    return () => browser.storage.session.onChanged.removeListener(onChanged);
  },

  activateTab(tabId) {
    void browser.tabs.update(tabId, { active: true });
  },

  closeTab(tabId) {
    void browser.tabs.remove(tabId);
  },

  newTab(windowId) {
    void browser.tabs.create({ windowId, active: true });
  },

  setMuted(tabId, muted) {
    void browser.tabs.update(tabId, { muted });
  },

  faviconUrl(tab) {
    if (!tab.url) return undefined;
    const params = new URLSearchParams({ pageUrl: tab.url, size: '32' });
    return `chrome-extension://${browser.runtime.id}/_favicon/?${params}`;
  },
};
