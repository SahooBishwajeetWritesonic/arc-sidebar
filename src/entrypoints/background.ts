import { browser, type Browser } from 'wxt/browser';
import { refreshCalendar, watchCalendar } from '@/background/calendar';
import { onCommandBarHello } from '@/background/command-bar';
import { cropVisibleTab } from '@/background/crop';
import { chromeHistory, toHistoryEntry } from '@/background/chrome-history';
import { HistoryIndex } from '@/background/history';
import { fetchGitHubJson, fetchPullRequests } from '@/background/github';
import { SidebarService, type LiveTab } from '@/background/service';
import {
  isPeekMessage,
  onBindingsChanged,
  onFocusChanged,
  onKeepItemClick,
  onPeekMessage,
  onWindowRemoved,
  syncKeepItem,
} from '@/background/peek';
import { noteRecording } from '@/background/recording';
import { onShortcut } from '@/background/shortcuts';
import { chromeSyncStore } from '@/background/sync-storage';
import { buildTabMenu, onTabMenuClick } from '@/background/tab-menu';
import type { Intent } from '@/model/types';
import type { CommandBarMessage } from '@/platform/command-bar';
import type {
  CaptureMessage,
  CaptureReply,
  HistoryMessage,
  PickMessage,
} from '@/platform/messages';
import type { RecordingMessage } from '@/platform/recording';
import { learnPick as learn } from '@/command/picks';
import {
  archiveItem,
  backupsItem,
  modelItem,
  picksItem,
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
    openerTabId: tab.openerTabId,
  };
}

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const history = new HistoryIndex(chromeHistory);
  browser.history.onVisited.addListener((item) => {
    const page = toHistoryEntry(item);
    if (page) history.visited(page);
  });
  browser.history.onVisitRemoved.addListener(({ allHistory, urls }) =>
    history.removed(allHistory ? 'all' : (urls ?? [])),
  );
  // One write at a time, so quick picks all count.
  let picking = Promise.resolve();
  const learnPick = (typed: string, target: string) => {
    picking = picking
      .then(async () =>
        picksItem.setValue(learn(await picksItem.getValue(), typed, target, Date.now())),
      )
      .catch(() => {});
  };

  const service = new SidebarService({
    queryTabs: async () =>
      (await browser.tabs.query({})).map(toLiveTab).filter((tab) => tab !== undefined),
    createTab: async (windowId, url, active) =>
      void (await browser.tabs.create({ windowId, url, active })),
    activateTab: async (tabId) => void (await browser.tabs.update(tabId, { active: true })),
    navigateTab: async (tabId, url) => void (await browser.tabs.update(tabId, { url })),
    closeTab: async (tabId) => void (await browser.tabs.remove(tabId).catch(() => {})),
    loadModel: () => modelItem.getValue(),
    saveModel: (model) => {
      void buildTabMenu(model.spaces);
      watchCalendar(model.settings.calendar);
      return modelItem.setValue(model);
    },
    loadSession: () => sessionItem.getValue(),
    saveSession: (session) => {
      onBindingsChanged(new Set(Object.values(session.bindings)));
      return sessionItem.setValue(session);
    },
    loadArchive: () => archiveItem.getValue(),
    saveArchive: (archive) => archiveItem.setValue(archive),
    loadBackups: () => backupsItem.getValue(),
    saveBackups: (backups) => backupsItem.setValue(backups),
    loadSnapshot: () => restoreSnapshotItem.getValue(),
    saveSnapshot: (snapshot) => restoreSnapshotItem.setValue(snapshot),
    loadTabDetails: () => tabDetailsItem.getValue(),
    saveTabDetails: (details) => tabDetailsItem.setValue(details),
    sync: chromeSyncStore,
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
  browser.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
    void service.onTabRemoved(tabId, windowId, isWindowClosing);
    noteRecording(tabId, null);
  });
  browser.tabs.onReplaced.addListener(
    (added, removed) => void service.onTabReplaced(added, removed),
  );
  browser.tabs.onAttached.addListener(
    (tabId, { newWindowId }) => void service.onTabAttached(tabId, newWindowId),
  );
  browser.tabs.onDetached.addListener(
    (tabId, { oldWindowId }) => void service.onTabDetached(tabId, oldWindowId),
  );
  browser.windows.onRemoved.addListener((windowId) => {
    void service.onWindowRemoved(windowId);
    void onWindowRemoved(windowId);
  });
  browser.windows.onFocusChanged.addListener((windowId) => void onFocusChanged(windowId));
  // Arc Sync: another computer's changes arrive in Chrome's synced storage.
  browser.storage.sync.onChanged.addListener(() => service.queueSync());
  void syncKeepItem();
  // Pages in pinned tabs learn so again, in case they were told while the worker was stopped.
  void service.ready.then(() =>
    onBindingsChanged(new Set(Object.values(service.snapshot().session.bindings))),
  );

  void service.ready.then(() => watchCalendar(service.snapshot().model.settings.calendar));

  // Auto-archive, the Live Folder and Live Calendar: check every few minutes. Alarms
  // can be dropped when Chrome restarts, so make sure it exists each time the worker starts.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== AUTO_ARCHIVE_ALARM) return;
    void service.archiveStale();
    void service.takeSnapshot(); // also catches pages navigated since the last change
    void service.refreshLiveFolder();
    void service.ready.then(() =>
      refreshCalendar(service.snapshot().model.settings.calendar?.feed ?? null),
    );
  });
  void browser.alarms.get(AUTO_ARCHIVE_ALARM).then((alarm) => {
    if (!alarm) void browser.alarms.create(AUTO_ARCHIVE_ALARM, { periodInMinutes: 5 });
  });

  browser.commands.onCommand.addListener((command, tab) => onShortcut(command, tab, service));

  void service.ready.then(() => buildTabMenu(service.snapshot().model.spaces));
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!onKeepItemClick(info, tab)) void onTabMenuClick(info, tab, service);
  });

  browser.runtime.onMessage.addListener(
    (
      message:
        | { kind?: string; intent?: Intent }
        | CommandBarMessage
        | CaptureMessage
        | RecordingMessage
        | HistoryMessage
        | PickMessage,
      sender,
      sendResponse,
    ) => {
      if (isPeekMessage(message)) {
        const bound = () =>
          service.ready.then(() => new Set(Object.values(service.snapshot().session.bindings)));
        return onPeekMessage(message, sender, bound, sendResponse);
      }
      if (message?.kind === 'command-bar:hello' && 'token' in message) {
        sendResponse(onCommandBarHello(message.token, sender));
        return;
      }
      if (message?.kind === 'recording' && 'mic' in message) {
        const { mic, camera } = message;
        if (sender.tab?.id !== undefined) noteRecording(sender.tab.id, { mic, camera });
        return;
      }
      if (message?.kind === 'picks:learn' && 'target' in message) {
        learnPick(message.typed, message.target);
        return;
      }
      if (message?.kind === 'history:search' && 'limit' in message) {
        history.search(message.text, message.limit).then(sendResponse, () => sendResponse([]));
        return true;
      }
      if (message?.kind === 'capture:shot' && 'area' in message) {
        const windowId = sender.tab?.windowId;
        if (windowId === undefined) return;
        cropVisibleTab(windowId, message.area, message.viewportWidth).then(
          (png) => sendResponse({ png } satisfies CaptureReply),
          () => sendResponse({} satisfies CaptureReply),
        );
        return true;
      }
      if (message?.kind !== 'intent' || !('intent' in message) || !message.intent) return;
      service
        .handleIntent(message.intent)
        .then(sendResponse, (error: unknown) => sendResponse({ error: String(error) }));
      return true; // keeps the channel open for the async response
    },
  );
});
