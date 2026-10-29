import { applyArchiveIntent, applyIntent, applySessionIntent } from '@/model/reducer';
import {
  ARCHIVE_AFTER_MS,
  DEFAULT_SPACE_ID,
  defaultSettings,
  emptySnapshot,
  FAVORITES_ID,
  normalizeSession,
  type ArchiveEntry,
  type ArchiveState,
  type Backup,
  type Intent,
  type IntentResult,
  type PinItem,
  type RestoreSnapshot,
  type SessionState,
  type SidebarModel,
  type TabDetails,
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
  loadSnapshot(): Promise<RestoreSnapshot>;
  saveSnapshot(snapshot: RestoreSnapshot): Promise<void>;
  loadTabDetails(): Promise<TabDetails>;
  saveTabDetails(details: TabDetails): Promise<void>;
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
/** Tab details are saved this long after the last change (the worker lives 30 s past an event). */
const DETAILS_DELAY_MS = 1_000;

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
  /** What was open before a restart and isn't matched to a tab yet. */
  private unmatched: RestoreSnapshot = emptySnapshot();
  private snapshotQueued = false;
  private details: TabDetails = {};
  private detailsQueued = false;
  /** Today tabs closed while the worker was stopped, with their spaces; onRemoved is coming. */
  private vanished = new Map<number, string | undefined>();
  private opening: { itemId: string; url: string; expires: number }[] = [];
  readonly ready: Promise<void>;

  constructor(private readonly deps: ServiceDeps) {
    this.ready = this.load();
  }

  private async load() {
    const [model, stored, archive, backups, snapshot, details, tabs] = await Promise.all([
      this.deps.loadModel(),
      this.deps.loadSession(),
      this.deps.loadArchive(),
      this.deps.loadBackups(),
      this.deps.loadSnapshot(),
      this.deps.loadTabDetails(),
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
      this.unmatched = {
        today: Object.fromEntries(
          Object.entries(snapshot.today).map(([s, urls]) => [s, [...urls]]),
        ),
        pins: { ...snapshot.pins },
        takenAt: snapshot.takenAt,
      };
    }

    const live = new Set(tabs.map((tab) => tab.id));
    const bindings: Record<string, number> = {};
    for (const [itemId, tabId] of Object.entries(session.bindings)) {
      if (live.has(tabId) && model.items[itemId]?.kind === 'pin') bindings[itemId] = tabId;
    }
    this.session = { ...session, bindings };
    // Exact matches first, so a looser one can't take a pin from its own tab.
    for (const tab of tabs) this.bindIfRestoredPin(tab, true);
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

    // A Today tab already gone closed while the worker was stopped (maybe what woke it):
    // keep its saved details until its onRemoved arrives.
    for (const id of Object.values(session.orders).flat()) {
      if (!live.has(id)) this.vanished.set(id, session.tabSpaces[id]);
    }
    this.details = Object.fromEntries([
      ...Object.entries(details).filter(([id]) => this.vanished.has(Number(id))),
      ...tabs.map(
        (tab) =>
          [String(tab.id), { url: tab.url, title: tab.title, windowId: tab.windowId }] as const,
      ),
    ]);
  }

  /** Saves what is open, for matching restored tabs after a restart. */
  async takeSnapshot() {
    await this.ready;
    this.snapshotQueued = false;
    const urls = new Map((await this.deps.queryTabs()).map((tab) => [tab.id, tab.url]));
    const snapshot: RestoreSnapshot = { today: {}, pins: {}, takenAt: this.deps.now() };
    for (const order of Object.values(this.session.orders)) {
      for (const tabId of order) {
        const space = this.session.tabSpaces[tabId];
        const url = urls.get(tabId);
        if (space && url) (snapshot.today[space] ??= []).push(url);
      }
    }
    for (const [itemId, tabId] of Object.entries(this.session.bindings)) {
      const url = urls.get(tabId);
      if (url) snapshot.pins[itemId] = url;
    }
    await this.deps.saveSnapshot(snapshot);
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
    // An import is big enough to always keep a backup of what came before.
    if (model !== this.model) this.writeModel(model, intent.type === 'importSidebar');
    const session = applySessionIntent(this.session, intent, (id) => this.details[id]?.windowId);
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
    this.details = {
      ...this.details,
      [tab.id]: { url: tab.url, title: tab.title, windowId: tab.windowId },
    };
    this.queueDetails();
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

  async onTabUpdated(tabId: number, change: { url?: string; title?: string }) {
    await this.ready;
    const known = this.details[tabId];
    if (!known) return; // a tab that has closed since
    const url = change.url ?? known.url;
    const title = change.title ?? known.title;
    if (known.url === url && known.title === title) return;
    this.details = { ...this.details, [tabId]: { ...known, url, title } };
    this.queueDetails();
  }

  /**
   * A tab still in Today was closed in Chrome (⌘W or tab strip): it's archived, as in Arc.
   * Tabs the sidebar closes have left Today already; a closing window's come back on restart.
   */
  async onTabRemoved(tabId: number, windowId: number, windowClosing = false) {
    await this.ready;
    const details = this.details[tabId];
    if (details) {
      const { [tabId]: _closed, ...rest } = this.details;
      this.details = rest;
      this.queueDetails();
    }
    const vanished = this.vanished.has(tabId);
    const spaceId = vanished ? this.vanished.get(tabId) : this.session.tabSpaces[tabId];
    this.vanished.delete(tabId);
    const inToday =
      vanished || Object.values(this.session.orders).some((order) => order.includes(tabId));
    if (inToday && !windowClosing && details && /^(https?|file):/.test(details.url)) {
      const entry: ArchiveEntry = {
        id: this.deps.newId(),
        url: details.url,
        title: details.title || details.url,
        spaceId: spaceId && this.hasSpace(spaceId) ? spaceId : this.activeSpaceOf(windowId),
        archivedAt: this.deps.now(),
        reason: 'closed',
        batchId: this.deps.newId(),
      };
      this.writeArchive(
        applyArchiveIntent(this.archive, {
          type: 'archiveTabs',
          windowId,
          tabs: [{ tabId, entry }],
        }),
      );
    }

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
    const { [removedTabId]: details, ...rest } = this.details;
    if (details) {
      this.details = { ...rest, [addedTabId]: details };
      this.queueDetails();
    }
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
    const known = this.details[tabId];
    if (known) {
      this.details = { ...this.details, [tabId]: { ...known, windowId: newWindowId } };
      this.queueDetails();
    }
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
    for (const [space, urls] of Object.entries(this.unmatched.today)) {
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

  /**
   * Prefers the pin last open on this page. Loose matches skip former Today pages, and only
   * without a snapshot (first run) may any pin match: else Today tabs could take over pins.
   */
  private bindIfRestoredPin(tab: LiveTab, exactOnly = false): boolean {
    if (this.deps.now() > this.restoringUntil) return false;
    if (Object.values(this.session.bindings).includes(tab.id)) return false;
    const bound = new Set(Object.keys(this.session.bindings));
    const free = Object.values(this.model.items).filter(
      (item): item is PinItem => item.kind === 'pin' && !bound.has(item.id),
    );
    const { pins: open, today, takenAt } = this.unmatched;
    const wasOpen = free.filter((pin) => open[pin.id] !== undefined);
    const wasToday = Object.values(today).some((urls) => urls.some((u) => isSamePage(u, tab.url)));
    const candidates = exactOnly || wasToday ? [] : takenAt ? wasOpen : free;
    const pin =
      wasOpen.find((p) => isSamePage(open[p.id]!, tab.url)) ??
      candidates.find((p) => isSamePage(p.url, tab.url)) ??
      candidates.find((p) => isSamePath(p.url, tab.url));
    if (!pin) return false;
    delete open[pin.id];
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

  private writeModel(model: SidebarModel, alwaysBackUp = false) {
    const previous = this.model;
    this.model = { ...model, rev: previous.rev + 1 };
    void this.deps.saveModel(this.model);
    this.backUp(previous, alwaysBackUp);
  }

  /** Copies the model as it was before a change, at most hourly unless `always`. */
  private backUp(model: SidebarModel, always = false) {
    const now = this.deps.now();
    const latest = this.backups[0];
    if (Object.keys(model.items).length === 0) return;
    if (!always && latest && now - latest.savedAt < BACKUP_EVERY_MS) return;
    this.backups = [{ savedAt: now, model }, ...this.backups].slice(0, BACKUPS_KEPT);
    void this.deps.saveBackups(this.backups);
  }

  private writeSession(session: SessionState) {
    this.session = { ...session, rev: (this.session?.rev ?? session.rev) + 1 };
    void this.deps.saveSession(this.session);
    if (!this.snapshotQueued) {
      this.snapshotQueued = true;
      this.deps.defer(() => void this.takeSnapshot(), SNAPSHOT_DELAY_MS);
    }
  }

  private queueDetails() {
    if (this.detailsQueued) return;
    this.detailsQueued = true;
    this.deps.defer(() => {
      this.detailsQueued = false;
      void this.deps.saveTabDetails(this.details);
    }, DETAILS_DELAY_MS);
  }

  private writeArchive(archive: ArchiveState) {
    this.archive = { ...archive, rev: this.archive.rev + 1 };
    void this.deps.saveArchive(this.archive);
  }
}
