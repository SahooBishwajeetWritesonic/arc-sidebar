import { applyIntent, applySessionIntent } from '@/model/reducer';
import type { Intent, IntentResult, PinItem, SessionState, SidebarModel } from '@/model/types';
import { isSamePage, isSamePath } from '@/model/urls';
import { reconcileOrder, withTabOnTop, withTabReplaced, withoutTab } from '@/platform/today-order';

export interface LiveTab {
  id: number;
  windowId: number;
  index: number;
  url: string;
}

/** What the service needs from Chrome. The harness passes in-memory fakes. */
export interface ServiceDeps {
  queryTabs(): Promise<LiveTab[]>;
  getTab(tabId: number): Promise<LiveTab | undefined>;
  createTab(windowId: number, url: string): Promise<void>;
  activateTab(tabId: number): Promise<void>;
  navigateTab(tabId: number, url: string): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  loadModel(): Promise<SidebarModel>;
  saveModel(model: SidebarModel): Promise<void>;
  loadSession(): Promise<SessionState>;
  saveSession(session: SessionState): Promise<void>;
  now(): number;
}

/** How long after a restart restored tabs that match a pin are bound to it. */
const RESTORE_WINDOW_MS = 10_000;
/** How long a pin waits for the tab it asked Chrome to open. */
const OPEN_TIMEOUT_MS = 5_000;

/**
 * The only writer of saved state. Public methods wait for the initial load; after that their
 * state changes are synchronous, so events apply in arrival order.
 */
export class SidebarService {
  private model!: SidebarModel;
  private session!: SessionState;
  private restoringUntil = 0;
  private opening: { itemId: string; url: string; expires: number }[] = [];
  readonly ready: Promise<void>;

  constructor(private readonly deps: ServiceDeps) {
    this.ready = this.load();
  }

  private async load() {
    const [model, session, tabs] = await Promise.all([
      this.deps.loadModel(),
      this.deps.loadSession(),
      this.deps.queryTabs(),
    ]);
    this.model = model;
    // Session storage is empty at the start of every browser session.
    if (session.rev === 0) this.restoringUntil = this.deps.now() + RESTORE_WINDOW_MS;

    const live = new Set(tabs.map((tab) => tab.id));
    const bindings: Record<string, number> = {};
    for (const [itemId, tabId] of Object.entries(session.bindings)) {
      if (live.has(tabId) && model.items[itemId]?.kind === 'pin') bindings[itemId] = tabId;
    }
    this.session = { ...session, bindings };
    for (const tab of tabs) this.bindIfRestoredPin(tab);

    const bound = new Set(Object.values(this.session.bindings));
    const stripOrder = new Map<number, number[]>();
    for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
      if (bound.has(tab.id)) continue;
      stripOrder.set(tab.windowId, [...(stripOrder.get(tab.windowId) ?? []), tab.id]);
    }
    const orders: Record<string, number[]> = {};
    for (const [windowId, ids] of stripOrder) {
      orders[windowId] = reconcileOrder(session.orders[windowId] ?? [], ids);
    }
    this.writeSession({ ...this.session, orders });
  }

  snapshot() {
    return { model: this.model, session: this.session };
  }

  async handleIntent(intent: Intent): Promise<IntentResult> {
    await this.ready;
    const tabId = 'itemId' in intent ? this.session.bindings[intent.itemId] : undefined;
    const item = 'itemId' in intent ? this.model.items[intent.itemId] : undefined;

    let windowId = 'windowId' in intent ? intent.windowId : -1;
    if (intent.type === 'unpin' && tabId !== undefined) {
      windowId = (await this.deps.getTab(tabId))?.windowId ?? windowId;
    }

    const model = applyIntent(this.model, intent);
    if (model !== this.model) this.writeModel(model);
    const session = applySessionIntent(this.session, intent, windowId);
    if (session !== this.session) this.writeSession(session);

    switch (intent.type) {
      case 'openPin':
        if (item?.kind !== 'pin') break;
        if (tabId !== undefined) {
          await this.deps.activateTab(tabId);
        } else {
          const expires = this.deps.now() + OPEN_TIMEOUT_MS;
          this.opening.push({ itemId: item.id, url: item.url, expires });
          await this.deps.createTab(intent.windowId, item.url);
        }
        break;
      case 'closePin':
        if (tabId !== undefined) await this.deps.closeTab(tabId);
        break;
      case 'resetPin':
        if (item?.kind === 'pin' && tabId !== undefined)
          await this.deps.navigateTab(tabId, item.url);
        break;
    }
    return { modelRev: this.model.rev, sessionRev: this.session.rev };
  }

  async onTabCreated(tab: LiveTab) {
    await this.ready;
    const now = this.deps.now();
    this.opening = this.opening.filter((o) => o.expires > now);
    const opened = this.opening.findIndex((o) => isSamePage(o.url, tab.url));
    if (opened !== -1) {
      const { itemId } = this.opening.splice(opened, 1)[0]!;
      this.bind(itemId, tab.id);
      return;
    }
    if (this.bindIfRestoredPin(tab)) return;
    this.updateOrder(tab.windowId, (order) => withTabOnTop(order, tab.id));
  }

  async onTabRemoved(tabId: number, windowId: number) {
    await this.ready;
    const bindings = Object.fromEntries(
      Object.entries(this.session.bindings).filter(([, id]) => id !== tabId),
    );
    const key = String(windowId);
    const order = this.session.orders[key];
    this.writeSession({
      ...this.session,
      bindings,
      orders: order
        ? { ...this.session.orders, [key]: withoutTab(order, tabId) }
        : this.session.orders,
    });
  }

  async onTabReplaced(addedTabId: number, removedTabId: number) {
    await this.ready;
    const bindings = Object.fromEntries(
      Object.entries(this.session.bindings).map(([itemId, id]) => [
        itemId,
        id === removedTabId ? addedTabId : id,
      ]),
    );
    const orders = Object.fromEntries(
      Object.entries(this.session.orders).map(([w, order]) => [
        w,
        withTabReplaced(order, removedTabId, addedTabId),
      ]),
    );
    this.writeSession({ ...this.session, bindings, orders });
  }

  async onTabAttached(tabId: number, newWindowId: number) {
    await this.ready;
    if (Object.values(this.session.bindings).includes(tabId)) return;
    this.updateOrder(newWindowId, (order) => withTabOnTop(order, tabId));
  }

  async onTabDetached(tabId: number, oldWindowId: number) {
    await this.ready;
    this.updateOrder(oldWindowId, (order) => withoutTab(order, tabId));
  }

  async onWindowRemoved(windowId: number) {
    await this.ready;
    const { [String(windowId)]: _closed, ...orders } = this.session.orders;
    this.writeSession({ ...this.session, orders });
  }

  private bindIfRestoredPin(tab: LiveTab): boolean {
    if (this.deps.now() > this.restoringUntil) return false;
    const bound = new Set(Object.keys(this.session.bindings));
    const pins = Object.values(this.model.items).filter(
      (item): item is PinItem => item.kind === 'pin' && !bound.has(item.id),
    );
    const pin =
      pins.find((p) => isSamePage(p.url, tab.url)) ?? pins.find((p) => isSamePath(p.url, tab.url));
    if (!pin) return false;
    this.bind(pin.id, tab.id);
    return true;
  }

  private bind(itemId: string, tabId: number) {
    const orders = Object.fromEntries(
      Object.entries(this.session.orders).map(([w, order]) => [w, withoutTab(order, tabId)]),
    );
    this.writeSession({
      ...this.session,
      orders,
      bindings: { ...this.session.bindings, [itemId]: tabId },
    });
  }

  private updateOrder(windowId: number, change: (order: number[]) => number[]) {
    const key = String(windowId);
    this.writeSession({
      ...this.session,
      orders: { ...this.session.orders, [key]: change(this.session.orders[key] ?? []) },
    });
  }

  private writeModel(model: SidebarModel) {
    this.model = { ...model, rev: this.model.rev + 1 };
    void this.deps.saveModel(this.model);
  }

  private writeSession(session: SessionState) {
    this.session = { ...session, rev: (this.session?.rev ?? session.rev) + 1 };
    void this.deps.saveSession(this.session);
  }
}
