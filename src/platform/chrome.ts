import { browser, type Browser } from 'wxt/browser';
import type { IntentResult } from '@/model/types';
import { archiveItem, backupsItem, modelItem, sessionItem } from './storage-items';
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
    // SPLIT_VIEW_ID_NONE is -1; Chrome before 140 has no split views at all.
    splitViewId:
      tab.splitViewId !== undefined && tab.splitViewId !== -1 ? tab.splitViewId : undefined,
  };
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

  loadModel: () => modelItem.getValue(),
  onModelChange: (listener) => modelItem.watch((model) => listener(model)),
  loadSession: () => sessionItem.getValue(),
  onSessionChange: (listener) => sessionItem.watch((session) => listener(session)),
  loadArchive: () => archiveItem.getValue(),
  onArchiveChange: (listener) => archiveItem.watch((archive) => listener(archive)),
  loadBackups: () => backupsItem.getValue(),

  async sendIntent(intent) {
    const response = (await browser.runtime.sendMessage({ kind: 'intent', intent })) as
      IntentResult | { error: string };
    if ('error' in response) throw new Error(response.error);
    return response;
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

  async searchHistory(text) {
    const items = await browser.history.search({ text, startTime: 0, maxResults: 200 });
    return items.flatMap((item) =>
      item.url
        ? [
            {
              url: item.url,
              title: item.title ?? '',
              visitCount: item.visitCount ?? 0,
              typedCount: item.typedCount ?? 0,
              lastVisitTime: item.lastVisitTime ?? 0,
            },
          ]
        : [],
    );
  },

  openUrl(windowId, url) {
    void browser.tabs.create({ windowId, url, active: true });
  },

  searchWeb(text) {
    // NEW_TAB opens in the focused window: the one the bar was opened in.
    void browser.search.query({ text, disposition: 'NEW_TAB' });
  },

  duplicateTab(tabId) {
    void browser.tabs.duplicate(tabId);
  },

  splitTabs(left, right) {
    void (async () => {
      // Chrome splits two neighbouring tabs: move the right one next to the left.
      const [a, b] = await Promise.all([browser.tabs.get(left), browser.tabs.get(right)]);
      await browser.tabs.move(right, { index: b.index > a.index ? a.index + 1 : a.index });
      await browser.tabs.createSplit([left, right]);
    })().catch((error: unknown) => console.warn("Couldn't split the tabs", error));
  },

  unsplit(splitViewId) {
    void browser.tabs.unsplit(splitViewId).catch(() => {});
  },

  openInSplit(tabId, url) {
    void browser.tabs.create({ url, splitWithTabId: tabId, active: true });
  },

  faviconUrl(pageUrl) {
    if (!pageUrl) return undefined;
    const params = new URLSearchParams({ pageUrl, size: '32' });
    return `chrome-extension://${browser.runtime.id}/_favicon/?${params}`;
  },
};
