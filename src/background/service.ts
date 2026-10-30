import { applyArchiveIntent, applyIntent, applySessionIntent } from '@/model/reducer';
import { repairModel } from '@/model/backup';
import {
  filtersKey,
  githubFolderOf,
  livePins,
  pullRequestKey,
  syncIntent,
  type PullRequestResult,
} from '@/model/live';
import { canPlace, childrenOf, flattenSpace, orderAtEnd } from '@/model/tree';
import {
  ARCHIVE_AFTER_MS,
  DEFAULT_SPACE_ID,
  emptySnapshot,
  FAVORITES_ID,
  normalizeModel,
  normalizeSession,
  type ArchiveEntry,
  type ArchiveState,
  type Backup,
  type GitHubFilters,
  type Intent,
  type IntentResult,
  type PinItem,
  type RestoreSnapshot,
  type SessionState,
  type SidebarModel,
  type TabDetails,
} from '@/model/types';
import { isSamePage, isSamePath } from '@/model/urls';
import {
  reconcileOrder,
  withNewTab,
  withTabBefore,
  withTabOnTop,
  withTabReplaced,
  withoutTab,
} from '@/platform/today-order';

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
  splitViewId?: number;
  openerTabId?: number;
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
  /** For the GitHub Live Folder. Throws when GitHub can't say. */
  fetchPullRequests(filters: GitHubFilters): Promise<PullRequestResult>;
  /** Runs `run` later (setTimeout in Chrome; tests can run it at once or not at all). */
  defer(run: () => void, ms: number): void;
  now(): number;
  newId(): string;
}

/** How long after a restart restored tabs that match a pin are bound to it. */
const RESTORE_WINDOW_MS = 10_000;
/** How long a pin waits for the tab it asked Chrome to open. */
const OPEN_TIMEOUT_MS = 5_000;
/** Backups: at most one an hour, the last 20 kept, plus one before each import or restore. */
const BACKUP_EVERY_MS = 3600_000;
const BACKUPS_KEPT = 20;
const BACKED_UP: Partial<Record<Intent['type'], Backup['reason']>> = {
  importSidebar: 'import',
  restoreSidebar: 'restore',
};
const SNAPSHOT_DELAY_MS = 2_000;
/** Tab details are saved this long after the last change (the worker lives 30 s past an event). */
const DETAILS_DELAY_MS = 1_000;
/** The Live Folder asks GitHub at most this often, unless something it shows just changed. */
const LIVE_MIN_INTERVAL_MS = 30_000;
/** A pull request just opened takes GitHub's search a moment to show. */
const LIVE_AFTER_PAGE_MS = 4_000;
const GITHUB_PAGE = /^https:\/\/github\.com\//;

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
  /** Tab id → the tab it was opened from, for placing the next one opened from it. */
  private openers = new Map<number, number>();
  /** Archived tabs being reopened where they were, rather than on top of Today. */
  private placing: { url: string; beforeTabId: number | null; expires: number }[] = [];
  private liveRefresh: Promise<void> | null = null;
  private liveRefreshedAt = -Infinity;
  /** The filters changed while GitHub was being asked: ask again after. */
  private liveAgain = false;
  private liveQueued = false;
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
    // Models saved before a setting existed get its default.
    this.model = normalizeModel(model);
    this.archive = archive;
    this.backups = backups;
    // Session storage is empty at the start of every browser session.
    if (session.rev === 0) {
      this.restoringUntil = this.deps.now() + RESTORE_WINDOW_MS;
      this.unmatched = {
        today: Object.fromEntries(
          Object.entries(snapshot.today).map(([s, urls]) => [s, [...urls]]),
        ),
        titles: Object.fromEntries(
          Object.entries(snapshot.titles ?? {}).map(([s, titles]) => [s, [...titles]]),
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
    // Every Today tab belongs to a space: the one it was in before a restart
    // if its URL matches, otherwise its window's space. A renamed one keeps its name.
    const tabSpaces: Record<string, string> = {};
    const tabTitles: Record<string, string> = {};
    for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
      if (bound.has(tab.id)) continue;
      const known = this.session.tabSpaces[tab.id];
      const named = this.session.tabTitles[tab.id];
      if (named) tabTitles[tab.id] = named;
      if (known && this.hasSpace(known)) {
        tabSpaces[tab.id] = known;
        continue;
      }
      const restored = this.matchSnapshot(tab.url);
      tabSpaces[tab.id] = restored?.spaceId ?? this.activeSpaceOf(tab.windowId);
      if (restored?.title && !named) tabTitles[tab.id] = restored.title;
    }
    this.writeSession({ ...this.session, orders, tabSpaces, tabTitles });

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
    const titles: Record<string, (string | null)[]> = {};
    for (const order of Object.values(this.session.orders)) {
      for (const tabId of order) {
        const space = this.session.tabSpaces[tabId];
        const url = urls.get(tabId);
        if (!space || !url) continue;
        (snapshot.today[space] ??= []).push(url);
        (titles[space] ??= []).push(this.session.tabTitles[tabId] ?? null);
      }
    }
    if (Object.values(titles).flat().some(Boolean)) snapshot.titles = titles;
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

  async handleIntent(received: Intent): Promise<IntentResult> {
    await this.ready;
    const intent = this.checked(received);
    if (!intent) return this.revisions();
    const tabId = 'itemId' in intent ? this.session.bindings[intent.itemId] : undefined;
    const item = 'itemId' in intent ? this.model.items[intent.itemId] : undefined;
    const restoring =
      intent.type === 'restoreArchived'
        ? this.archive.entries.filter((entry) => intent.entryIds.includes(entry.id))
        : [];

    // State changes first, synchronously, so intents apply in arrival order; side effects after.
    const before = this.model;
    const model = applyIntent(this.model, intent, this.session);
    // Imports and restores always keep a backup of what came before.
    if (model !== this.model) this.writeModel(model, BACKED_UP[intent.type]);
    const windowOf = (id: number) => this.details[id]?.windowId;
    const session = applySessionIntent(this.session, intent, windowOf, before);
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
      case 'restoreArchived': {
        const { beforeTabId } = intent;
        if (beforeTabId !== undefined) {
          // A batch is stored top-down: each above the same tab keeps that order.
          for (const entry of restoring) {
            const expires = this.deps.now() + OPEN_TIMEOUT_MS;
            this.placing.push({ url: entry.url, beforeTabId, expires });
            await this.deps.createTab(intent.windowId, entry.url, false);
          }
          break;
        }
        // Entries are newest first and a batch is stored top-down. Opening
        // bottom-up, each on top of Today, recreates the original order.
        for (const entry of [...restoring].reverse()) {
          await this.deps.createTab(intent.windowId, entry.url, false);
        }
        break;
      }
      case 'setActiveSpace':
        if (intent.openNewTab) await this.deps.createTab(intent.windowId, 'chrome://newtab/', true);
        break;
      case 'createLiveFolder':
      case 'setLiveFilters':
        void this.refreshLiveFolder(true);
        break;
      case 'refreshLiveFolder':
        await this.refreshLiveFolder(true);
        break;
      case 'setFolderCollapsed':
        if (!intent.collapsed && item?.kind === 'folder' && item.live)
          void this.refreshLiveFolder();
        break;
    }
    return this.revisions();
  }

  /** Unless `force`d, skips if it asked a moment ago. On failure the folder keeps what it has. */
  async refreshLiveFolder(force = false): Promise<void> {
    await this.ready;
    if (this.liveRefresh) {
      this.liveAgain ||= force;
      return this.liveRefresh;
    }
    const folder = githubFolderOf(this.model);
    if (!folder) return;
    if (!force && this.deps.now() - this.liveRefreshedAt < LIVE_MIN_INTERVAL_MS) return;
    this.liveRefreshedAt = this.deps.now();
    const { filters } = folder.live;
    this.liveRefresh = this.deps
      .fetchPullRequests(filters)
      .then(
        (result) => this.applyPullRequests(folder.id, filters, result),
        () => {},
      )
      .finally(() => {
        this.liveRefresh = null;
        if (!this.liveAgain) return;
        this.liveAgain = false;
        void this.refreshLiveFolder(true);
      });
    return this.liveRefresh;
  }

  private async applyPullRequests(
    folderId: string,
    filters: GitHubFilters,
    result: PullRequestResult,
  ) {
    const folder = githubFolderOf(this.model);
    // Asked for other filters, or the folder went: this answer is out of date.
    if (folder?.id !== folderId || filtersKey(folder.live.filters) !== filtersKey(filters)) return;
    const windowId = Number(Object.keys(this.session.orders)[0] ?? -1);
    const intent = syncIntent(this.model, folder, result, this.deps.newId, windowId);
    if (!intent) return;
    await this.handleIntent(intent);
    this.adoptPullRequestTabs();
  }

  /**
   * Today tabs showing a pull request the Live Folder holds become its row. Only tabs in the
   * folder's own space, so nothing leaves the space on screen.
   */
  private adoptPullRequestTabs() {
    const folder = githubFolderOf(this.model);
    if (!folder) return;
    const bound = new Set(Object.keys(this.session.bindings));
    const waiting = new Map(
      livePins(this.model, folder)
        .filter((pin) => !bound.has(pin.id))
        .map((pin) => [pullRequestKey(pin.url), pin.id]),
    );
    if (!waiting.size) return;
    for (const tabId of Object.values(this.session.orders).flat()) {
      if (this.session.tabSpaces[tabId] !== folder.spaceId) continue;
      const key = pullRequestKey(this.details[tabId]?.url ?? '');
      const itemId = key && waiting.get(key);
      if (!itemId) continue;
      waiting.delete(key);
      this.bind(itemId, tabId);
    }
  }

  /**
   * The first pull request page makes Arc's Live Folder. Later, the folder looks again after a
   * pull request page loads (maybe just opened), or any GitHub page while signed out (sign-in).
   */
  private onGitHubPage(tabId: number, windowId: number, url: string) {
    const folder = githubFolderOf(this.model);
    const pullRequest = pullRequestKey(url) !== undefined;
    if (!folder) {
      if (!pullRequest || !this.model.settings.githubFolder) return;
      const spaceId = this.spaceOfTab(tabId) ?? this.activeSpaceOf(windowId);
      void this.handleIntent({
        type: 'createLiveFolder',
        itemId: this.deps.newId(),
        spaceId,
        order: orderAtEnd(this.model, spaceId, null),
      });
      return;
    }
    if ((!pullRequest && !folder.live.signedOut) || this.liveQueued) return;
    this.liveQueued = true;
    this.deps.defer(() => {
      this.liveQueued = false;
      void this.refreshLiveFolder();
    }, LIVE_AFTER_PAGE_MS);
  }

  /** Chrome's tab menu: pins Today tabs at the end of their space's Pinned section. */
  async pinTabs(tabIds: readonly number[]) {
    await this.ready;
    for (const tabId of tabIds) {
      const details = this.details[tabId];
      if (!details || this.itemOfTab(tabId)) continue;
      const spaceId = this.spaceOfTab(tabId) ?? this.activeSpaceOf(details.windowId);
      await this.handleIntent({
        type: 'pinTab',
        itemId: this.deps.newId(),
        tabId,
        spaceId,
        parentId: null,
        order: orderAtEnd(this.model, spaceId, null),
        url: details.url,
        title: details.title,
      });
    }
  }

  /** Chrome's tab menu: adds tabs to the end of Favorites, while there's room. */
  async favoriteTabs(tabIds: readonly number[]) {
    await this.ready;
    for (const tabId of tabIds) {
      const details = this.details[tabId];
      const itemId = this.itemOfTab(tabId);
      const order = orderAtEnd(this.model, FAVORITES_ID, null);
      if (itemId) {
        if (this.model.items[itemId]?.spaceId === FAVORITES_ID) continue;
        await this.handleIntent({ type: 'moveToSpace', itemId, spaceId: FAVORITES_ID, order });
      } else if (details) {
        await this.handleIntent({
          type: 'pinTab',
          itemId: this.deps.newId(),
          tabId,
          spaceId: FAVORITES_ID,
          parentId: null,
          order,
          url: details.url,
          title: details.title,
        });
      }
    }
  }

  // Shortcuts, when the sidebar isn't open to run them itself.

  /** Arc's next / previous tab, in the sidebar's order. Stops at the ends. */
  async stepTab(windowId: number, tabId: number, delta: -1 | 1) {
    await this.ready;
    const order = this.sidebarOrder(windowId, tabId);
    const next = order[order.indexOf(tabId) + delta];
    if (next !== undefined) await this.deps.activateTab(next);
  }

  /** Arc's ⌘D: pins the tab, or unpins it back to the top of Today. */
  async togglePin(tabId: number, windowId: number) {
    await this.ready;
    const itemId = this.itemOfTab(tabId);
    if (itemId) await this.handleIntent({ type: 'unpin', itemId, windowId });
    else await this.pinTabs([tabId]);
  }

  /** Shows a space in the window, selecting the tab last used there, as the sidebar does. */
  async switchSpace(windowId: number, spaceId: string) {
    await this.ready;
    if (!this.hasSpace(spaceId) || this.activeSpaceOf(windowId) === spaceId) return;
    const open = new Set(Object.keys(this.details).map(Number));
    const pinned = flattenSpace(this.model, spaceId, () => false)
      .map(({ item }) => this.session.bindings[item.id])
      .filter((id): id is number => id !== undefined && open.has(id));
    const today = this.todayOf(windowId, spaceId);
    const last = this.session.lastActive[spaceId];
    const target =
      last !== undefined && (pinned.includes(last) || today.includes(last))
        ? last
        : (pinned[0] ?? today[0]);
    await this.handleIntent({
      type: 'setActiveSpace',
      windowId,
      spaceId,
      openNewTab: target === undefined,
    });
    if (target !== undefined) await this.deps.activateTab(target);
  }

  async switchSpaceBy(windowId: number, delta: -1 | 1) {
    await this.ready;
    const index = this.model.spaces.findIndex((space) => space.id === this.activeSpaceOf(windowId));
    const next = this.model.spaces[index + delta];
    if (next) await this.switchSpace(windowId, next.id);
  }

  /** Arc's Clear: archives the shown space's Today tabs, except ones playing sound. */
  async clearToday(windowId: number) {
    await this.ready;
    const spaceId = this.activeSpaceOf(windowId);
    const tabs = await this.deps.queryTabs();
    const playing = new Set(tabs.filter((tab) => tab.audible).map((tab) => tab.id));
    const clearing = this.todayOf(windowId, spaceId).filter((id) => !playing.has(id));
    if (!clearing.length) return;
    // Closing every tab would close the window; keep one open, as Arc does.
    const inWindow = tabs.filter((tab) => tab.windowId === windowId).length;
    if (clearing.length === inWindow) await this.deps.createTab(windowId, 'chrome://newtab/', true);
    const batchId = this.deps.newId();
    const now = this.deps.now();
    await this.handleIntent({
      type: 'archiveTabs',
      windowId,
      tabs: clearing.map((tabId) => ({
        tabId,
        entry: {
          id: this.deps.newId(),
          url: this.details[tabId]?.url ?? '',
          title: this.session.tabTitles[tabId] ?? this.details[tabId]?.title ?? '',
          spaceId,
          archivedAt: now,
          reason: 'cleared',
          batchId,
        },
      })),
    });
  }

  /** Whether a tab is open in a pinned tab or favorite. */
  isPinned(tabId: number): boolean {
    return this.itemOfTab(tabId) !== undefined;
  }

  spacesOf(windowId: number) {
    return { current: this.activeSpaceOf(windowId), spaces: this.model.spaces };
  }

  /** Chrome's tab menu: Today tabs go to the space's Today, pinned ones to its Pinned. */
  async moveTabsToSpace(tabIds: readonly number[], spaceId: string) {
    await this.ready;
    for (const tabId of tabIds) {
      const itemId = this.itemOfTab(tabId);
      if (itemId) {
        const order = orderAtEnd(this.model, spaceId, null);
        await this.handleIntent({ type: 'moveToSpace', itemId, spaceId, order });
      } else if (this.details[tabId]) {
        await this.handleIntent({ type: 'moveTabToSpace', tabId, spaceId });
      }
    }
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
      title: this.session.tabTitles[tab.id] ?? tab.title,
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
    if (GITHUB_PAGE.test(tab.url)) this.onGitHubPage(tab.id, tab.windowId, tab.url);
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
    const order = this.session.orders[key] ?? [];
    // An archived tab reopened by ⌘Z goes back where it was.
    this.placing = this.placing.filter((p) => p.expires > now);
    const placed = this.placing.findIndex((p) => isSamePage(p.url, tab.url));
    const before = placed === -1 ? undefined : this.placing.splice(placed, 1)[0]!.beforeTabId;
    // A link opened from a Today tab goes just below it, in its space.
    const opener = restored ? undefined : tab.openerTabId;
    if (opener !== undefined) this.openers.set(tab.id, opener);
    const openerSpace =
      opener !== undefined && order.includes(opener) && this.session.tabSpaces[opener];
    this.writeSession({
      ...this.session,
      orders: {
        ...this.session.orders,
        [key]:
          before === undefined
            ? withNewTab(order, tab.id, opener, (id) => this.openers.get(id))
            : withTabBefore(order, tab.id, before),
      },
      tabSpaces: {
        ...this.session.tabSpaces,
        [tab.id]: restored?.spaceId || openerSpace || this.activeSpaceOf(tab.windowId),
      },
      tabTitles: restored?.title
        ? { ...this.session.tabTitles, [tab.id]: restored.title }
        : this.session.tabTitles,
    });
    if (pullRequestKey(tab.url)) this.adoptPullRequestTabs();
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
    // A pin added by its address alone takes its page's title once it loads
    // (Chrome shows the address as the title until then).
    const pin = this.model.items[this.itemOfTab(tabId) ?? ''];
    if (pin?.kind === 'pin' && pin.title === pin.url && isSamePage(url, pin.url)) {
      const named = title && !url.includes(title) && !pin.url.includes(title);
      const keep = { itemId: pin.id, url: pin.url, title };
      if (named) await this.handleIntent({ type: 'replacePinUrl', ...keep });
    }
    if (url === known.url || !GITHUB_PAGE.test(url)) return;
    this.onGitHubPage(tabId, known.windowId, url);
    if (pullRequestKey(url)) this.adoptPullRequestTabs();
  }

  /**
   * A tab still in Today was closed in Chrome (⌘W or tab strip): it's archived, as in Arc.
   * Tabs the sidebar closes have left Today already; a closing window's come back on restart.
   */
  async onTabRemoved(tabId: number, windowId: number, windowClosing = false) {
    await this.ready;
    this.openers.delete(tabId);
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
        title: this.session.tabTitles[tabId] || details.title || details.url,
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
    const { [tabId]: _named, ...tabTitles } = this.session.tabTitles;
    const key = String(windowId);
    const order = this.session.orders[key];
    this.writeSession({
      ...this.session,
      bindings,
      tabSpaces,
      tabTitles,
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
    const { [removedTabId]: name, ...tabTitles } = this.session.tabTitles;
    if (name) tabTitles[addedTabId] = name;
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
    this.writeSession({ ...this.session, bindings, orders, tabSpaces, tabTitles });
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

  /**
   * A split view's tabs sit together in Today, left pane first, in the left one's space, so the
   * sidebar shows them as one row the way they look.
   */
  async onTabSplit(splitViewId: number) {
    await this.ready;
    const pair = (await this.deps.queryTabs())
      .filter((tab) => tab.splitViewId === splitViewId)
      .sort((a, b) => a.index - b.index);
    const [left, right] = pair;
    if (pair.length !== 2 || !left || !right || left.windowId !== right.windowId) return;
    const key = String(left.windowId);
    const order = this.session.orders[key] ?? [];
    if (!order.includes(left.id) || !order.includes(right.id)) return;
    const without = order.filter((id) => id !== right.id);
    const at = without.indexOf(left.id) + 1;
    const aligned = [...without.slice(0, at), right.id, ...without.slice(at)];
    const space = this.session.tabSpaces[left.id];
    const sameSpace = space === undefined || this.session.tabSpaces[right.id] === space;
    if (aligned.join() === order.join() && sameSpace) return;
    this.writeSession({
      ...this.session,
      orders: { ...this.session.orders, [key]: aligned },
      tabSpaces: sameSpace
        ? this.session.tabSpaces
        : { ...this.session.tabSpaces, [right.id]: space },
    });
  }

  async onWindowRemoved(windowId: number) {
    await this.ready;
    const { [String(windowId)]: _closed, ...orders } = this.session.orders;
    this.writeSession({ ...this.session, orders });
  }

  /** A panel can be a step behind and name a space just deleted, so intents are rechecked. */
  private checked(intent: Intent): Intent | undefined {
    switch (intent.type) {
      case 'pinTab':
        // A pin that can't go where it was dropped mustn't take the tab either.
        return canPlace(
          this.model,
          { id: intent.itemId, kind: 'pin' },
          intent.spaceId,
          intent.parentId,
        )
          ? intent
          : undefined;
      case 'unpin': {
        if (intent.spaceId && this.hasSpace(intent.spaceId)) return intent;
        const tabId = this.session.bindings[intent.itemId];
        const windowId = (tabId !== undefined && this.details[tabId]?.windowId) || intent.windowId;
        const home = this.model.items[intent.itemId]?.spaceId;
        const spaceId = home && this.hasSpace(home) ? home : this.activeSpaceOf(windowId);
        return { ...intent, spaceId };
      }
      case 'moveTabToSpace':
      case 'setActiveSpace':
      case 'createLiveFolder':
        return this.hasSpace(intent.spaceId) ? intent : undefined;
      case 'deleteSpace':
        return this.hasSpace(intent.fallbackSpaceId) && intent.fallbackSpaceId !== intent.spaceId
          ? intent
          : undefined;
      case 'restoreSidebar': {
        // A file can hold anything; even a backup may be from an older version.
        const model = repairModel(intent.model);
        return model ? { ...intent, model } : undefined;
      }
      default:
        return intent;
    }
  }

  private hasSpace(spaceId: string) {
    return this.model.spaces.some((space) => space.id === spaceId);
  }

  private activeSpaceOf(windowId: number): string {
    const space = this.session.activeSpaces[String(windowId)];
    return space && this.hasSpace(space) ? space : (this.model.spaces[0]?.id ?? DEFAULT_SPACE_ID);
  }

  /** A space's Today tabs in the window, top first. */
  private todayOf(windowId: number, spaceId: string): number[] {
    return (this.session.orders[String(windowId)] ?? []).filter(
      (id) => this.session.tabSpaces[id] === spaceId,
    );
  }

  /** Open tabs as the sidebar lists them; a closed folder's tabs only when selected. */
  private sidebarOrder(windowId: number, selected: number): number[] {
    const spaceId = this.activeSpaceOf(windowId);
    const window = new Set(
      Object.entries(this.details)
        .filter(([, details]) => details.windowId === windowId)
        .map(([id]) => Number(id)),
    );
    const bound = (itemId: string) => this.session.bindings[itemId];
    const favorites = childrenOf(this.model, FAVORITES_ID, null).map((item) => bound(item.id));
    const pinned = flattenSpace(this.model, spaceId, (item) => bound(item.id) === selected).map(
      ({ item }) => bound(item.id),
    );
    return [...favorites, ...pinned, ...this.todayOf(windowId, spaceId)].filter(
      (id): id is number => id !== undefined && window.has(id),
    );
  }

  private itemOfTab(tabId: number): string | undefined {
    return Object.entries(this.session.bindings).find(([, id]) => id === tabId)?.[0];
  }

  private spaceOfTab(tabId: number): string | undefined {
    const itemId = this.itemOfTab(tabId);
    if (itemId) {
      const spaceId = this.model.items[itemId]?.spaceId;
      // Favorites belong to every space: opening one doesn't switch.
      return spaceId === FAVORITES_ID ? undefined : spaceId;
    }
    return this.session.tabSpaces[tabId];
  }

  /** The space (and name) a restored tab had before the restart; consumes the match. */
  private matchSnapshot(url: string): { spaceId: string; title?: string } | undefined {
    for (const [space, urls] of Object.entries(this.unmatched.today)) {
      const index = urls.findIndex((known) => isSamePage(known, url));
      if (index !== -1 && this.hasSpace(space)) {
        urls.splice(index, 1);
        const title = this.unmatched.titles?.[space]?.splice(index, 1)[0];
        return { spaceId: space, ...(title && { title }) };
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

  private writeModel(model: SidebarModel, reason?: Backup['reason']) {
    const previous = this.model;
    this.model = { ...model, rev: previous.rev + 1 };
    void this.deps.saveModel(this.model);
    this.backUp(previous, reason);
  }

  private backUp(model: SidebarModel, reason?: Backup['reason']) {
    const now = this.deps.now();
    const latest = this.backups[0];
    if (Object.keys(model.items).length === 0) return;
    if (!reason && latest && now - latest.savedAt < BACKUP_EVERY_MS) return;
    const backup: Backup = reason ? { savedAt: now, model, reason } : { savedAt: now, model };
    this.backups = [backup, ...this.backups].slice(0, BACKUPS_KEPT);
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
