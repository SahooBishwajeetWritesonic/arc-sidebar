import { applyArchiveIntent, applyIntent, applySessionIntent } from '@/model/reducer';
import {
  ARCHIVE_AFTER_MS,
  DEFAULT_SPACE_ID,
  defaultSettings,
  FAVORITES_ID,
  normalizeSession,
  type ArchiveEntry,
  type ArchiveState,
  type Backup,
  type Intent,
  type IntentResult,
  type PinItem,
  type SessionState,
  type SidebarModel,
  type TodaySnapshot,
} from '@/model/types';
import { isSamePage, isSamePath } from '@/model/urls';
import { reconcileOrder, withTabOnTop, withTabReplaced, withoutTab } from '@/platform/today-order';

export interface LiveTab {
  id: number;
  windowId: number;
  index: number;
  url: string;
  title: string;
  active: boolean;
  audible: boolean;
  /** When the tab was last viewed (Chrome 121+). */
  lastAccessed?: number;
}

/** What the service needs from Chrome. The harness passes in-memory fakes. */
export interface ServiceDeps {
  queryTabs(): Promise<LiveTab[]>;
  createTab(windowId: number, url: string, active: boolean): Promise<void>;
  activateTab(tabId: number): Promise<void>;
  navigateTab(tabId: number, url: string): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  loadModel(): Promise<SidebarModel>;
  saveModel(model: SidebarModel): Promise<void>;
  loadSession(): Promise<SessionState>;
  saveSession(session: SessionState): Promise<void>;
  loadArchive(): Promise<ArchiveState>;
  saveArchive(archive: ArchiveState): Promise<void>;
  loadBackups(): Promise<Backup[]>;
  saveBackups(backups: Backup[]): Promise<void>;
  loadTodaySnapshot(): Promise<TodaySnapshot>;
  saveTodaySnapshot(snapshot: TodaySnapshot): Promise<void>;
  /** Runs `run` later (setTimeout in Chrome; tests can run it at once or not at all). */
  defer(run: () => void, ms: number): void;
  now(): number;
  newId(): string;
}

/** How long after a restart restored tabs that match a pin are bound to it. */
const RESTORE_WINDOW_MS = 10_000;
/** How long a pin waits for the tab it asked Chrome to open. */
const OPEN_TIMEOUT_MS = 5_000;
const BACKUP_EVERY_MS = 3600_000;
const BACKUPS_KEPT = 20;
const SNAPSHOT_DELAY_MS = 2_000;

/**
 * The only writer of saved state. Public methods wait for the initial load; after that their
 * state changes are synchronous, so events apply in arrival order.
 */
export class SidebarService {
  private model!: SidebarModel;
  private session!: SessionState;
  private archive!: ArchiveState;
  private backups: Backup[] = [];
  private restoringUntil = 0;
  /** Today URLs per space from before a restart, not yet matched to a tab. */
  private unmatched: TodaySnapshot = {};
  private snapshotQueued = false;
  private opening: { itemId: string; url: string; expires: number }[] = [];
  readonly ready: Promise<void>;

  constructor(private readonly deps: ServiceDeps) {
    this.ready = this.load();
  }

  private async load() {
    const [model, stored, archive, backups, snapshot, tabs] = await Promise.all([
      this.deps.loadModel(),
      this.deps.loadSession(),
      this.deps.loadArchive(),
      this.deps.loadBackups(),
      this.deps.loadTodaySnapshot(),
      this.deps.queryTabs(),
    ]);
    const session = normalizeSession(stored);
    // Models saved before settings existed get the defaults.
    this.model = { ...model, settings: { ...defaultSettings(), ...model.settings } };
    this.archive = archive;
    this.backups = backups;
    // Session storage is empty at the start of every browser session.
    if (session.rev === 0) {
      this.restoringUntil = this.deps.now() + RESTORE_WINDOW_MS;
      this.unmatched = Object.fromEntries(
        Object.entries(snapshot).map(([s, urls]) => [s, [...urls]]),
      );
    }

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
    // A Today tab's space: its pre-restart one if the URL matches, else its window's.
    const tabSpaces: Record<string, string> = {};
    for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
      if (bound.has(tab.id)) continue;
      const known = this.session.tabSpaces[tab.id];
      tabSpaces[tab.id] =
        known && this.hasSpace(known)
          ? known
          : (this.matchSnapshot(tab.url) ?? this.activeSpaceOf(tab.windowId));
    }
    this.writeSession({ ...this.session, orders, tabSpaces });
  }

  /** Saves each space's Today URLs, top first, for matching after a restart. */
  async snapshotToday() {
    await this.ready;
    this.snapshotQueued = false;
    const urls = new Map((await this.deps.queryTabs()).map((tab) => [tab.id, tab.url]));
    const snapshot: TodaySnapshot = {};
    for (const order of Object.values(this.session.orders)) {
      for (const tabId of order) {
        const space = this.session.tabSpaces[tabId];
        const url = urls.get(tabId);
        if (space && url) (snapshot[space] ??= []).push(url);
      }
    }
    await this.deps.saveTodaySnapshot(snapshot);
  }

  snapshot() {
    return {
      model: this.model,
      session: this.session,
      archive: this.archive,
      backups: this.backups,
    };
  }

  async handleIntent(intent: Intent): Promise<IntentResult> {
    await this.ready;
    const tabId = 'itemId' in intent ? this.session.bindings[intent.itemId] : undefined;
    const item = 'itemId' in intent ? this.model.items[intent.itemId] : undefined;
    const restoring =
      intent.type === 'restoreArchived'
        ? this.archive.entries.filter((entry) => intent.entryIds.includes(entry.id))
        : [];

    // State changes first, synchronously, so intents apply in arrival order; side effects after.
    const model = applyIntent(this.model, intent);
    if (model !== this.model) this.writeModel(model);
    const session = applySessionIntent(this.session, intent);
    if (session !== this.session) this.writeSession(session);
    const archive = applyArchiveIntent(this.archive, intent);
    if (archive !== this.archive) this.writeArchive(archive);

    switch (intent.type) {
      case 'openPin':
        if (item?.kind !== 'pin') break;
        if (tabId !== undefined) {
          await this.deps.activateTab(tabId);
        } else {
          const expires = this.deps.now() + OPEN_TIMEOUT_MS;
          this.opening.push({ itemId: item.id, url: item.url, expires });
          await this.deps.createTab(intent.windowId, item.url, true);
        }
        break;
      case 'closePin':
        if (tabId !== undefined) await this.deps.closeTab(tabId);
        break;
      case 'resetPin':
        if (item?.kind === 'pin' && tabId !== undefined) {
          await this.deps.navigateTab(tabId, item.url);
        }
        break;
      case 'archiveTabs':
        await Promise.all(intent.tabs.map(({ tabId: id }) => this.deps.closeTab(id)));
        break;
      case 'restoreArchived':
        // Entries are newest first and a batch is stored top-down. Opening
        // bottom-up, each on top of Today, recreates the original order.
        for (const entry of [...restoring].reverse()) {
          await this.deps.createTab(intent.windowId, entry.url, false);
        }
        break;
      case 'setActiveSpace':
        if (intent.openNewTab) await this.deps.createTab(intent.windowId, 'chrome://newtab/', true);
        break;
    }
    return this.revisions();
  }

  async archiveStale(): Promise<number> {
    await this.ready;
    const now = this.deps.now();
    const limit = ARCHIVE_AFTER_MS[this.model.settings.archiveAfter];
    const bound = new Set(Object.values(this.session.bindings));
    const inToday = new Set(Object.values(this.session.orders).flat());
    const stale = (await this.deps.queryTabs()).filter(
      (tab) =>
        inToday.has(tab.id) &&
        !bound.has(tab.id) &&
        !tab.active &&
        !tab.audible &&
        tab.lastAccessed !== undefined &&
        now - tab.lastAccessed > limit,
    );
    if (!stale.length) return 0;

    const batchId = this.deps.newId();
    const entries: ArchiveEntry[] = stale.map((tab) => ({
      id: this.deps.newId(),
      url: tab.url,
      title: tab.title,
      spaceId: this.model.spaces[0]?.id ?? 'default',
      archivedAt: now,
      reason: 'auto',
      batchId,
    }));
    const windowId = stale[0]!.windowId;
    await this.handleIntent({
      type: 'archiveTabs',
      windowId,
      tabs: stale.map((tab, i) => ({ tabId: tab.id, entry: entries[i]! })),
    });
    return stale.length;
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
    const restored =
      this.deps.now() <= this.restoringUntil ? this.matchSnapshot(tab.url) : undefined;
    const key = String(tab.windowId);
    this.writeSession({
      ...this.session,
      orders: {
        ...this.session.orders,
        [key]: withTabOnTop(this.session.orders[key] ?? [], tab.id),
      },
      tabSpaces: {
        ...this.session.tabSpaces,
        [tab.id]: restored ?? this.activeSpaceOf(tab.windowId),
      },
    });
  }

  /** Chrome activated a tab, maybe from its own tab strip: the sidebar follows to its space. */
  async onTabActivated(tabId: number, windowId: number) {
    await this.ready;
    const space = this.spaceOfTab(tabId);
    if (!space) return;
    const key = String(windowId);
    if (this.session.activeSpaces[key] === space && this.session.lastActive[space] === tabId)
      return;
    this.writeSession({
      ...this.session,
      activeSpaces: { ...this.session.activeSpaces, [key]: space },
      lastActive: { ...this.session.lastActive, [space]: tabId },
    });
  }

  async onTabRemoved(tabId: number, windowId: number) {
    await this.ready;
    const bindings = Object.fromEntries(
      Object.entries(this.session.bindings).filter(([, id]) => id !== tabId),
    );
    const { [tabId]: _gone, ...tabSpaces } = this.session.tabSpaces;
    const key = String(windowId);
    const order = this.session.orders[key];
    this.writeSession({
      ...this.session,
      bindings,
      tabSpaces,
      orders: order
        ? { ...this.session.orders, [key]: withoutTab(order, tabId) }
        : this.session.orders,
    });
  }

  async onTabReplaced(addedTabId: number, removedTabId: number) {
    await this.ready;
    const { [removedTabId]: space, ...tabSpaces } = this.session.tabSpaces;
    if (space) tabSpaces[addedTabId] = space;
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
    this.writeSession({ ...this.session, bindings, orders, tabSpaces });
  }

  async onTabAttached(tabId: number, newWindowId: number) {
    await this.ready;
    if (Object.values(this.session.bindings).includes(tabId)) return;
    const key = String(newWindowId);
    this.writeSession({
      ...this.session,
      orders: {
        ...this.session.orders,
        [key]: withTabOnTop(this.session.orders[key] ?? [], tabId),
      },
      tabSpaces: { ...this.session.tabSpaces, [tabId]: this.activeSpaceOf(newWindowId) },
    });
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

  private hasSpace(spaceId: string) {
    return this.model.spaces.some((space) => space.id === spaceId);
  }

  private activeSpaceOf(windowId: number): string {
    const space = this.session.activeSpaces[String(windowId)];
    return space && this.hasSpace(space) ? space : (this.model.spaces[0]?.id ?? DEFAULT_SPACE_ID);
  }

  private spaceOfTab(tabId: number): string | undefined {
    const itemId = Object.entries(this.session.bindings).find(([, id]) => id === tabId)?.[0];
    if (itemId) {
      const spaceId = this.model.items[itemId]?.spaceId;
      // Favorites belong to every space: opening one doesn't switch.
      return spaceId === FAVORITES_ID ? undefined : spaceId;
    }
    return this.session.tabSpaces[tabId];
  }

  /** The space a restored tab was in before the restart, consuming the match. */
  private matchSnapshot(url: string): string | undefined {
    for (const [space, urls] of Object.entries(this.unmatched)) {
      const index = urls.findIndex((known) => isSamePage(known, url));
      if (index !== -1 && this.hasSpace(space)) {
        urls.splice(index, 1);
        return space;
      }
    }
    return undefined;
  }

  private revisions(): IntentResult {
    return { modelRev: this.model.rev, sessionRev: this.session.rev, archiveRev: this.archive.rev };
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
    const previous = this.model;
    this.model = { ...model, rev: previous.rev + 1 };
    void this.deps.saveModel(this.model);
    this.backUp(previous);
  }

  /** Copies the model as it was before a change, at most hourly. */
  private backUp(model: SidebarModel) {
    const now = this.deps.now();
    const latest = this.backups[0];
    if (Object.keys(model.items).length === 0) return;
    if (latest && now - latest.savedAt < BACKUP_EVERY_MS) return;
    this.backups = [{ savedAt: now, model }, ...this.backups].slice(0, BACKUPS_KEPT);
    void this.deps.saveBackups(this.backups);
  }

  private writeSession(session: SessionState) {
    this.session = { ...session, rev: (this.session?.rev ?? session.rev) + 1 };
    void this.deps.saveSession(this.session);
    if (!this.snapshotQueued) {
      this.snapshotQueued = true;
      this.deps.defer(() => void this.snapshotToday(), SNAPSHOT_DELAY_MS);
    }
  }

  private writeArchive(archive: ArchiveState) {
    this.archive = { ...archive, rev: this.archive.rev + 1 };
    void this.deps.saveArchive(this.archive);
  }
}
