import { browser, type Browser } from 'wxt/browser';
import { SidebarService, type LiveTab } from '@/background/service';
import type { Intent } from '@/model/types';
import { archiveItem, backupsItem, modelItem, sessionItem } from '@/platform/storage-items';

const AUTO_ARCHIVE_ALARM = 'auto-archive';

function toLiveTab(tab: Browser.tabs.Tab): LiveTab | undefined {
  if (tab.id === undefined) return undefined;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || tab.url || '',
    active: tab.active,
    audible: tab.audible ?? false,
    lastAccessed: tab.lastAccessed,
  };
}

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const service = new SidebarService({
    queryTabs: async () =>
      (await browser.tabs.query({})).map(toLiveTab).filter((tab) => tab !== undefined),
    createTab: async (windowId, url, active) =>
      void (await browser.tabs.create({ windowId, url, active })),
    activateTab: async (tabId) => void (await browser.tabs.update(tabId, { active: true })),
    navigateTab: async (tabId, url) => void (await browser.tabs.update(tabId, { url })),
    closeTab: async (tabId) => void (await browser.tabs.remove(tabId).catch(() => {})),
    loadModel: () => modelItem.getValue(),
    saveModel: (model) => modelItem.setValue(model),
    loadSession: () => sessionItem.getValue(),
    saveSession: (session) => sessionItem.setValue(session),
    loadArchive: () => archiveItem.getValue(),
    saveArchive: (archive) => archiveItem.setValue(archive),
    loadBackups: () => backupsItem.getValue(),
    saveBackups: (backups) => backupsItem.setValue(backups),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
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

  // Chrome can drop alarms on restart, so recreate it each time the worker starts.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_ARCHIVE_ALARM) void service.archiveStale();
  });
  void browser.alarms.get(AUTO_ARCHIVE_ALARM).then((alarm) => {
    if (!alarm) void browser.alarms.create(AUTO_ARCHIVE_ALARM, { periodInMinutes: 5 });
  });

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
