import {
  reconcileOrder,
  todayOrderKey,
  withTabOnTop,
  withTabReplaced,
  withoutTab,
} from '@/platform/today-order';

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Listeners register synchronously so events that wake the worker aren't missed;
  // each awaits the initial load, and sharing that promise keeps arrival order.
  const orders = new Map<number, number[]>();
  const ready = load();

  async function load() {
    const [stored, tabs] = await Promise.all([
      browser.storage.session.get(null),
      browser.tabs.query({}),
    ]);
    const liveByWindow = new Map<number, number[]>();
    for (const tab of tabs.sort((a, b) => a.index - b.index)) {
      if (tab.id === undefined) continue;
      liveByWindow.set(tab.windowId, [...(liveByWindow.get(tab.windowId) ?? []), tab.id]);
    }
    for (const [windowId, liveIds] of liveByWindow) {
      const saved = stored[todayOrderKey(windowId)];
      orders.set(windowId, reconcileOrder(Array.isArray(saved) ? saved : [], liveIds));
    }
    const stale = Object.keys(stored).filter(
      (key) => key.startsWith('today:') && !liveByWindow.has(Number(key.slice(6))),
    );
    await browser.storage.session.remove(stale);
    await Promise.all([...orders.keys()].map(save));
  }

  function save(windowId: number) {
    const order = orders.get(windowId);
    return order
      ? browser.storage.session.set({ [todayOrderKey(windowId)]: order })
      : browser.storage.session.remove(todayOrderKey(windowId));
  }

  async function update(windowId: number, change: (order: number[]) => number[]) {
    await ready;
    orders.set(windowId, change(orders.get(windowId) ?? []));
    void save(windowId);
  }

  browser.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) void update(tab.windowId, (o) => withTabOnTop(o, tab.id!));
  });
  browser.tabs.onRemoved.addListener((tabId, { windowId }) => {
    void update(windowId, (o) => withoutTab(o, tabId));
  });
  browser.tabs.onAttached.addListener((tabId, { newWindowId }) => {
    void update(newWindowId, (o) => withTabOnTop(o, tabId));
  });
  browser.tabs.onDetached.addListener((tabId, { oldWindowId }) => {
    void update(oldWindowId, (o) => withoutTab(o, tabId));
  });
  browser.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
    await ready;
    for (const [windowId, order] of orders) {
      if (!order.includes(removedTabId)) continue;
      orders.set(windowId, withTabReplaced(order, removedTabId, addedTabId));
      void save(windowId);
    }
  });
  browser.windows.onRemoved.addListener(async (windowId) => {
    await ready;
    orders.delete(windowId);
    void save(windowId);
  });
});
