import { browser, type Browser } from 'wxt/browser';
import { SidebarService, type LiveTab } from '@/background/service';
import type { Intent } from '@/model/types';
import { modelItem, sessionItem } from '@/platform/storage-items';

function toLiveTab(tab: Browser.tabs.Tab): LiveTab | undefined {
  if (tab.id === undefined) return undefined;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.url || tab.pendingUrl || '',
  };
}

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const service = new SidebarService({
    queryTabs: async () =>
      (await browser.tabs.query({})).map(toLiveTab).filter((tab) => tab !== undefined),
    getTab: async (tabId) => {
      try {
        return toLiveTab(await browser.tabs.get(tabId));
      } catch {
        return undefined; // already closed
      }
    },
    createTab: async (windowId, url) =>
      void (await browser.tabs.create({ windowId, url, active: true })),
    activateTab: async (tabId) => void (await browser.tabs.update(tabId, { active: true })),
    navigateTab: async (tabId, url) => void (await browser.tabs.update(tabId, { url })),
    closeTab: async (tabId) => void (await browser.tabs.remove(tabId).catch(() => {})),
    loadModel: () => modelItem.getValue(),
    saveModel: (model) => modelItem.setValue(model),
    loadSession: () => sessionItem.getValue(),
    saveSession: (session) => sessionItem.setValue(session),
    now: () => Date.now(),
  });

  // Registered synchronously so the events that wake the worker aren't missed.
  browser.tabs.onCreated.addListener((tab) => {
    const live = toLiveTab(tab);
    if (live) void service.onTabCreated(live);
  });
  browser.tabs.onRemoved.addListener(
    (tabId, { windowId }) => void service.onTabRemoved(tabId, windowId),
  );
  browser.tabs.onReplaced.addListener(
    (added, removed) => void service.onTabReplaced(added, removed),
  );
  browser.tabs.onAttached.addListener(
    (tabId, { newWindowId }) => void service.onTabAttached(tabId, newWindowId),
  );
  browser.tabs.onDetached.addListener(
    (tabId, { oldWindowId }) => void service.onTabDetached(tabId, oldWindowId),
  );
  browser.windows.onRemoved.addListener((windowId) => void service.onWindowRemoved(windowId));

  browser.runtime.onMessage.addListener(
    (message: { kind?: string; intent?: Intent }, _sender, sendResponse) => {
      if (message?.kind !== 'intent' || !message.intent) return;
      service
        .handleIntent(message.intent)
        .then(sendResponse, (error: unknown) => sendResponse({ error: String(error) }));
      return true; // keeps the channel open for the async response
    },
  );
});
