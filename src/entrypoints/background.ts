import { browser, type Browser } from 'wxt/browser';
import { onCommandBarHello, onCommandBarShortcut } from '@/background/command-bar';
import { fetchGitHubJson, fetchPullRequests } from '@/background/github';
import { SidebarService, type LiveTab } from '@/background/service';
import type { Intent } from '@/model/types';
import type { CommandBarMessage } from '@/platform/command-bar';
import {
  archiveItem,
  backupsItem,
  modelItem,
  restoreSnapshotItem,
  sessionItem,
  tabDetailsItem,
} from '@/platform/storage-items';

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
    splitViewId:
      tab.splitViewId !== undefined && tab.splitViewId !== -1 ? tab.splitViewId : undefined,
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
    loadSnapshot: () => restoreSnapshotItem.getValue(),
    saveSnapshot: (snapshot) => restoreSnapshotItem.setValue(snapshot),
    loadTabDetails: () => tabDetailsItem.getValue(),
    saveTabDetails: (details) => tabDetailsItem.setValue(details),
    fetchPullRequests: (filters) => fetchPullRequests(filters, fetchGitHubJson),
    defer: (run, ms) => void setTimeout(run, ms),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });

  // Registered synchronously so the events that wake the worker aren't missed.
  browser.tabs.onCreated.addListener((tab) => {
    const live = toLiveTab(tab);
    if (live) void service.onTabCreated(live);
  });
  browser.tabs.onActivated.addListener(
    ({ tabId, windowId }) => void service.onTabActivated(tabId, windowId),
  );
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.splitViewId !== undefined && change.splitViewId !== -1) {
      void service.onTabSplit(change.splitViewId);
    }
    if (change.url === undefined && change.title === undefined) return;
    void service.onTabUpdated(tabId, { url: change.url, title: change.title });
  });
  browser.tabs.onRemoved.addListener(
    (tabId, { windowId, isWindowClosing }) =>
      void service.onTabRemoved(tabId, windowId, isWindowClosing),
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
    if (alarm.name !== AUTO_ARCHIVE_ALARM) return;
    void service.archiveStale();
    void service.takeSnapshot(); // also catches pages navigated since the last change
    void service.refreshLiveFolder();
  });
  void browser.alarms.get(AUTO_ARCHIVE_ALARM).then((alarm) => {
    if (!alarm) void browser.alarms.create(AUTO_ARCHIVE_ALARM, { periodInMinutes: 5 });
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'command-bar') onCommandBarShortcut(tab);
  });

  browser.runtime.onMessage.addListener(
    (message: { kind?: string; intent?: Intent } | CommandBarMessage, sender, sendResponse) => {
      if (message?.kind === 'command-bar:hello' && 'token' in message) {
        sendResponse(onCommandBarHello(message.token, sender));
        return;
      }
      if (message?.kind !== 'intent' || !('intent' in message) || !message.intent) return;
      service
        .handleIntent(message.intent)
        .then(sendResponse, (error: unknown) => sendResponse({ error: String(error) }));
      return true; // keeps the channel open for the async response
    },
  );
});
