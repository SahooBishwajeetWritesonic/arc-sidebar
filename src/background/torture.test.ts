import { generateKeyBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import { childrenOf } from '@/model/tree';
import {
  ARCHIVE_LIMIT,
  FAVORITES_ID,
  FAVORITES_LIMIT,
  emptyArchive,
  emptyModel,
  emptySession,
  emptySnapshot,
  type ArchiveState,
  type Backup,
  type SessionState,
  type SidebarModel,
  type TabDetails,
  type RestoreSnapshot,
} from '@/model/types';
import { isSamePage, isSamePath } from '@/model/urls';
import { SidebarService, type LiveTab } from './service';

/**
 * A fake Chrome throws random tab events, stale intents, timers and restarts at the real
 * service; saved state is checked after every step. Seeded, so a failure replays.
 */

// More for a deep run: TORTURE_SEEDS=2000 TORTURE_STEPS=400 npx vitest run torture
const SEEDS = Number(process.env.TORTURE_SEEDS) || 150;
const STEPS = Number(process.env.TORTURE_STEPS) || 160;
const URLS = Array.from({ length: 12 }, (_, i) => `https://site${i}.example.com/page`);

/** mulberry32: small, fast and good enough to drive a fuzzer. */
function random(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(list: readonly T[]): T | undefined => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  };
}

interface Saved {
  model: SidebarModel;
  session: SessionState;
  archive: ArchiveState;
  backups: Backup[];
  snapshot: RestoreSnapshot;
  details: TabDetails;
}

class FakeChrome {
  tabs: LiveTab[] = [];
  windows = [1, 2];
  nextTab = 1;
  nextWindow = 3;
  now = 1_000_000;
  deferred: (() => void)[] = [];
  service!: SidebarService;
  saved: Saved = {
    model: emptyModel(),
    session: emptySession(),
    archive: emptyArchive(),
    backups: [],
    snapshot: emptySnapshot(),
    details: {},
  };
  private nextUuid = 0;

  constructor(readonly log: string[]) {}

  /** Starts a worker on whatever is saved, as Chrome does after stopping one. */
  startWorker() {
    // Timers don't survive the worker.
    this.deferred = [];
    const saved = this.saved;
    this.service = new SidebarService({
      queryTabs: async () => this.tabs.map((tab) => ({ ...tab })),
      createTab: async (windowId, url, active) => {
        const tab = this.addTab(windowId, url, active);
        await this.service.onTabCreated({ ...tab });
      },
      activateTab: async (tabId) => void this.activate(tabId),
      navigateTab: async (tabId, url) => {
        const tab = this.tabs.find((t) => t.id === tabId);
        if (!tab) return;
        tab.url = url;
        await this.service.onTabUpdated(tabId, { url });
      },
      closeTab: async (tabId) => {
        const tab = this.tabs.find((t) => t.id === tabId);
        if (!tab) return;
        this.tabs = this.tabs.filter((t) => t.id !== tabId);
        await this.service.onTabRemoved(tabId, tab.windowId);
      },
      loadModel: async () => saved.model,
      saveModel: async (model) => void (saved.model = model),
      loadSession: async () => saved.session,
      saveSession: async (session) => void (saved.session = session),
      loadArchive: async () => saved.archive,
      saveArchive: async (archive) => void (saved.archive = archive),
      loadBackups: async () => saved.backups,
      saveBackups: async (backups) => void (saved.backups = backups),
      loadSnapshot: async () => saved.snapshot,
      saveSnapshot: async (snapshot) => void (saved.snapshot = snapshot),
      loadTabDetails: async () => saved.details,
      saveTabDetails: async (details) => void (saved.details = details),
      fetchPullRequests: async () => ({ signedIn: false }),
      defer: (run) => void this.deferred.push(run),
      now: () => this.now,
      newId: () => `u${this.nextUuid++}`,
    });
    return this.service.ready;
  }

  addTab(windowId: number, url: string, active: boolean): LiveTab {
    const tab: LiveTab = {
      id: this.nextTab++,
      windowId,
      index: this.tabs.filter((t) => t.windowId === windowId).length,
      url,
      title: url,
      active: false,
      audible: false,
    };
    this.tabs.push(tab);
    if (active) this.activate(tab.id);
    return tab;
  }

  activate(tabId: number) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    for (const other of this.tabs) if (other.windowId === tab.windowId) other.active = false;
    tab.active = true;
  }

  /** Fires pending timers and lets their async work (snapshots) finish. */
  async runTimers() {
    for (const run of this.deferred.splice(0)) run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  uuid() {
    return `p${this.nextUuid++}`;
  }
}

/** Every rule the saved state must follow, whatever happened. */
function checkInvariants(chrome: FakeChrome) {
  const { model, session, archive } = chrome.saved;
  const spaceIds = new Set(model.spaces.map((space) => space.id));
  expect(model.spaces.length, 'at least one space').toBeGreaterThan(0);
  expect(spaceIds.size, 'unique spaces').toBe(model.spaces.length);

  for (const item of Object.values(model.items)) {
    expect(
      spaceIds.has(item.spaceId) || item.spaceId === FAVORITES_ID,
      `${item.id} in a real space`,
    ).toBe(true);
    if (item.parentId !== null) {
      const parent = model.items[item.parentId];
      expect(parent?.kind, `${item.id}'s parent is a folder`).toBe('folder');
      expect(parent?.spaceId, `${item.id} in its parent's space`).toBe(item.spaceId);
    }
    const seen = new Set<string>();
    for (let at: string | null = item.id; at; at = model.items[at]?.parentId ?? null) {
      expect(seen.has(at), `no cycle through ${item.id}`).toBe(false);
      seen.add(at);
    }
  }
  const favorites = childrenOf(model, FAVORITES_ID, null);
  expect(favorites.length).toBeLessThanOrEqual(FAVORITES_LIMIT);
  expect(
    Object.values(model.items).filter((i) => i.spaceId === FAVORITES_ID).length,
    'favorites are top-level pins',
  ).toBe(favorites.filter((i) => i.kind === 'pin').length);

  // Bindings: live tabs, one pin each.
  const live = new Map(chrome.tabs.map((tab) => [tab.id, tab]));
  const boundTabs = Object.values(session.bindings);
  expect(new Set(boundTabs).size, 'a tab is bound to one pin').toBe(boundTabs.length);
  for (const [itemId, tabId] of Object.entries(session.bindings)) {
    expect(model.items[itemId]?.kind, `binding ${itemId} is a pin`).toBe('pin');
    expect(live.has(tabId), `binding ${itemId} → live tab ${tabId}`).toBe(true);
  }

  // Today: every other live tab, once, in its own window, in a real space.
  const bound = new Set(boundTabs);
  const placed = new Map<number, string>();
  for (const [windowId, order] of Object.entries(session.orders)) {
    for (const tabId of order) {
      expect(placed.has(tabId), `tab ${tabId} in Today once`).toBe(false);
      placed.set(tabId, windowId);
      expect(live.has(tabId), `Today tab ${tabId} is live`).toBe(true);
      expect(bound.has(tabId), `Today tab ${tabId} isn't bound`).toBe(false);
    }
  }
  for (const tab of chrome.tabs) {
    if (bound.has(tab.id)) continue;
    expect(placed.get(tab.id), `tab ${tab.id} in its window's Today`).toBe(String(tab.windowId));
    const space = session.tabSpaces[tab.id];
    expect(space !== undefined && spaceIds.has(space), `tab ${tab.id} has a real space`).toBe(true);
  }
  for (const space of Object.values(session.activeSpaces)) {
    expect(spaceIds.has(space), 'windows show real spaces').toBe(true);
  }

  expect(archive.entries.length).toBeLessThanOrEqual(ARCHIVE_LIMIT);
  expect(new Set(archive.entries.map((e) => e.id)).size).toBe(archive.entries.length);
}

/** One random step: a Chrome event, a panel intent, a timer or a restart. */
async function step(chrome: FakeChrome, rand: ReturnType<typeof random>) {
  const { model, session } = chrome.saved;
  const service = chrome.service;
  const windowId = rand.pick(chrome.windows)!;
  const tab = rand.pick(chrome.tabs);
  const todayTabs = Object.values(session.orders).flat();
  const pins = Object.values(model.items).filter((i) => i.kind === 'pin');
  const folders = Object.values(model.items).filter((i) => i.kind === 'folder');
  const spaces = model.spaces.map((s) => s.id);
  const log = (line: string) => chrome.log.push(line);
  chrome.now += rand.int(60_000);

  const roll = rand.int(100);
  if (roll < 14) {
    const url = rand.pick(URLS)!;
    const created = chrome.addTab(windowId, url, rand.chance(0.6));
    log(`open ${created.id} ${url} in ${windowId}`);
    await service.onTabCreated({ ...created });
    if (created.active) await service.onTabActivated(created.id, windowId);
  } else if (roll < 24 && tab) {
    log(`close ${tab.id}`);
    chrome.tabs = chrome.tabs.filter((t) => t.id !== tab.id);
    await service.onTabRemoved(tab.id, tab.windowId);
    if (rand.chance(0.1)) await service.onTabRemoved(tab.id, tab.windowId); // duplicate event
  } else if (roll < 30 && tab) {
    const url = rand.pick(URLS)!;
    log(`navigate ${tab.id} ${url}`);
    tab.url = url;
    await service.onTabUpdated(tab.id, { url });
    if (rand.chance(0.5)) await service.onTabUpdated(tab.id, { title: `Title ${rand.int(9)}` });
  } else if (roll < 35 && tab) {
    log(`activate ${tab.id}`);
    chrome.activate(tab.id);
    await service.onTabActivated(tab.id, tab.windowId);
  } else if (roll < 38 && tab && chrome.windows.length > 1) {
    const to = rand.pick(chrome.windows.filter((w) => w !== tab.windowId))!;
    log(`move ${tab.id} to window ${to}`);
    const from = tab.windowId;
    tab.windowId = to;
    await service.onTabDetached(tab.id, from);
    await service.onTabAttached(tab.id, to);
  } else if (roll < 40 && tab) {
    const replacement = chrome.nextTab++;
    log(`replace ${tab.id} with ${replacement}`);
    const old = tab.id;
    tab.id = replacement;
    await service.onTabReplaced(replacement, old);
  } else if (roll < 41) {
    // Events about tabs that don't exist, as stale queues deliver.
    log('ghost events');
    await service.onTabRemoved(99_999, windowId);
    await service.onTabActivated(99_998, windowId);
    await service.onTabUpdated(99_997, { url: URLS[0] });
  } else if (roll < 50) {
    // Pin a Today tab, maybe into a folder or Favorites; sometimes a stale tab id.
    const tabId = rand.chance(0.9) ? rand.pick(todayTabs) : 99_999;
    const live = chrome.tabs.find((t) => t.id === tabId);
    if (tabId === undefined) return;
    const toFavorites = rand.chance(0.15);
    const spaceId = toFavorites ? FAVORITES_ID : (session.tabSpaces[tabId] ?? spaces[0]!);
    // Mostly a folder in its space; sometimes a stale one from another space.
    const folder = toFavorites
      ? undefined
      : rand.pick(rand.chance(0.2) ? folders : folders.filter((f) => f.spaceId === spaceId));
    const parentId = folder && rand.chance(0.5) ? folder.id : null;
    const itemId = chrome.uuid();
    log(`pin ${tabId} as ${itemId} in ${spaceId}/${parentId}`);
    await chrome.service.handleIntent({
      type: 'pinTab',
      itemId,
      tabId,
      spaceId,
      parentId,
      order: generateKeyBetween(childrenOf(model, spaceId, parentId).at(-1)?.order ?? null, null),
      url: live?.url ?? URLS[0]!,
      title: 'pinned',
    });
  } else if (roll < 55) {
    const pin = rand.pick(pins);
    if (!pin) return;
    log(`unpin ${pin.id}`);
    await service.handleIntent({ type: 'unpin', itemId: pin.id, windowId });
  } else if (roll < 62) {
    const pin = rand.pick(pins);
    if (!pin) return;
    log(`openPin ${pin.id} in ${windowId}`);
    await service.handleIntent({ type: 'openPin', itemId: pin.id, windowId });
  } else if (roll < 65) {
    const pin = rand.pick(pins);
    if (!pin) return;
    log(`closePin ${pin.id}`);
    await service.handleIntent({ type: 'closePin', itemId: pin.id });
  } else if (roll < 68) {
    // Usually its own space's items at the top; sometimes (a stale panel)
    // another space's, its would-be parent, or a parent elsewhere.
    const spaceId = rand.pick(spaces)!;
    const itemId = chrome.uuid();
    const odd = rand.chance(0.25);
    const parentId = odd ? (rand.pick(folders)?.id ?? null) : null;
    const childIds = Object.values(model.items)
      .filter((i) => (odd || i.spaceId === spaceId) && rand.chance(0.3))
      .map((i) => i.id);
    log(`folder ${itemId} in ${spaceId}/${parentId} with ${childIds.join(',')}`);
    await service.handleIntent({
      type: 'createFolder',
      itemId,
      spaceId,
      parentId,
      order: generateKeyBetween(childrenOf(model, spaceId, null).at(-1)?.order ?? null, null),
      name: 'Folder',
      childIds,
    });
  } else if (roll < 72) {
    // Drag an item somewhere, possibly into itself or another space (stale panels do).
    const item = rand.pick(Object.values(model.items));
    if (!item) return;
    const target = rand.pick([null, ...folders.map((f) => f.id)]) ?? null;
    const spaceId =
      target === null ? rand.pick(spaces)! : (model.items[target]?.spaceId ?? spaces[0]!);
    log(`move ${item.id} to ${spaceId}/${target}`);
    await service.handleIntent({
      type: 'move',
      itemId: item.id,
      parentId: target,
      spaceId,
      order: generateKeyBetween(childrenOf(model, spaceId, target).at(-1)?.order ?? null, null),
    });
  } else if (roll < 74) {
    const item = rand.pick(Object.values(model.items));
    const spaceId = rand.chance(0.3) ? FAVORITES_ID : rand.pick(spaces)!;
    if (!item) return;
    log(`moveToSpace ${item.id} to ${spaceId}`);
    await service.handleIntent({
      type: 'moveToSpace',
      itemId: item.id,
      spaceId,
      order: generateKeyBetween(childrenOf(model, spaceId, null).at(-1)?.order ?? null, null),
    });
  } else if (roll < 76) {
    const folder = rand.pick(folders);
    if (!folder) return;
    log(`deleteFolder ${folder.id}`);
    await service.handleIntent({ type: 'deleteFolder', itemId: folder.id });
  } else if (roll < 79) {
    const tabId = rand.pick(todayTabs);
    if (tabId === undefined) return;
    const spaceId = rand.pick(spaces)!;
    log(`moveTabToSpace ${tabId} ${spaceId}`);
    await service.handleIntent({ type: 'moveTabToSpace', tabId, spaceId });
  } else if (roll < 83) {
    // The panel's ✕ or Clear.
    const chosen = todayTabs.filter(() => rand.chance(0.3));
    log(`archive ${chosen.join(',')}`);
    await service.handleIntent({
      type: 'archiveTabs',
      windowId,
      tabs: chosen.map((tabId) => ({
        tabId,
        entry: {
          id: chrome.uuid(),
          url: chrome.tabs.find((t) => t.id === tabId)?.url ?? URLS[0]!,
          title: 'archived',
          spaceId: session.tabSpaces[tabId] ?? spaces[0]!,
          archivedAt: chrome.now,
          reason: 'closed',
          batchId: 'batch',
        },
      })),
    });
  } else if (roll < 85) {
    const entries = chrome.saved.archive.entries.slice(0, rand.int(3)).map((e) => e.id);
    log(`restoreArchived ${entries.join(',')}`);
    await service.handleIntent({ type: 'restoreArchived', windowId, entryIds: entries });
  } else if (roll < 87) {
    const spaceId = chrome.uuid();
    log(`createSpace ${spaceId}`);
    await service.handleIntent({
      type: 'createSpace',
      spaceId,
      name: 'Space',
      index: rand.int(spaces.length + 1),
    });
  } else if (roll < 89 && spaces.length > 1) {
    const spaceId = rand.pick(spaces)!;
    const fallbackSpaceId = rand.pick(spaces.filter((s) => s !== spaceId))!;
    const itemIds = Object.values(model.items)
      .filter((i) => i.spaceId === spaceId)
      .map((i) => i.id);
    log(`deleteSpace ${spaceId} → ${fallbackSpaceId}`);
    await service.handleIntent({
      type: 'deleteSpace',
      spaceId,
      fallbackSpaceId,
      itemIds,
      windowId,
    });
  } else if (roll < 90) {
    const spaceId = rand.pick(spaces)!;
    log(`setActiveSpace ${windowId} ${spaceId}`);
    await service.handleIntent({ type: 'setActiveSpace', windowId, spaceId });
  } else if (roll < 91) {
    // Back to a backup, or to a muddled copy with items in spaces it lacks.
    const backup = rand.pick(chrome.saved.backups)?.model ?? model;
    const copy = rand.chance(0.3)
      ? {
          ...backup,
          spaces: backup.spaces.slice(rand.int(backup.spaces.length)),
          items: { ...backup.items, ...model.items },
        }
      : backup;
    log(`restoreSidebar ${copy.spaces.length} spaces, ${Object.keys(copy.items).length} items`);
    // Undo's bindings, some of them out of date.
    const bindings = rand.chance(0.5)
      ? { ...session.bindings, [rand.pick(pins)?.id ?? 'none']: rand.pick(todayTabs) ?? 99_999 }
      : undefined;
    await service.handleIntent({ type: 'restoreSidebar', model: copy, windowId, bindings });
  } else if (roll < 92) {
    // Favorite every Today tab at once, past the limit.
    log('favorite everything');
    for (const tabId of todayTabs) {
      await service.handleIntent({
        type: 'pinTab',
        itemId: chrome.uuid(),
        tabId,
        spaceId: FAVORITES_ID,
        parentId: null,
        order: generateKeyBetween(
          childrenOf(chrome.saved.model, FAVORITES_ID, null).at(-1)?.order ?? null,
          null,
        ),
        url: chrome.tabs.find((t) => t.id === tabId)?.url ?? URLS[0]!,
        title: 'favorite',
      });
    }
  } else if (roll < 93) {
    log('timers');
    await chrome.runTimers();
  } else if (roll < 94) {
    log('auto-archive');
    chrome.now += 13 * 3600_000;
    await service.archiveStale();
  } else if (roll < 97) {
    await workerRestart(chrome, rand);
  } else {
    await chromeRestart(chrome, rand);
  }
}

/** A session without its revision or empty Today lists, which mean the same as none. */
function comparable({ rev: _rev, orders, ...rest }: SessionState) {
  return {
    ...rest,
    orders: Object.fromEntries(Object.entries(orders).filter(([, o]) => o.length)),
  };
}

/** Chrome stops the idle worker and starts a new one; nothing visible may change. */
async function workerRestart(chrome: FakeChrome, rand: ReturnType<typeof random>) {
  chrome.log.push('worker restart');
  if (rand.chance(0.5)) await chrome.runTimers();
  const before = comparable(chrome.saved.session);
  await chrome.startWorker();
  expect(comparable(chrome.saved.session), 'a worker restart keeps the session').toEqual(before);
}

/**
 * Chrome quits and starts again: session storage is gone, ids are new, and some tabs come back
 * before the worker starts, the rest just after.
 */
async function chromeRestart(chrome: FakeChrome, rand: ReturnType<typeof random>) {
  chrome.log.push('chrome restart');
  if (rand.chance(0.7)) await chrome.runTimers(); // the last snapshot was written
  const { model, session } = chrome.saved;
  const pinsBefore = Object.keys(model.items).sort();

  chrome.saved.session = emptySession();
  chrome.saved.details = {};
  const windowIds = new Map(chrome.windows.map((w) => [w, chrome.nextWindow++]));
  chrome.windows = [...windowIds.values()];
  const newIds = new Map<number, number>();
  const restored = chrome.tabs
    .filter(() => rand.chance(0.9))
    .map((tab) => {
      newIds.set(tab.id, chrome.nextTab);
      return { ...tab, id: chrome.nextTab++, windowId: windowIds.get(tab.windowId)! };
    });
  // Pins the snapshot saw open whose tab came back on the same page, and
  // that no other open pin shares that page with (those may swap tabs).
  const snapshot = chrome.saved.snapshot;
  const expected = Object.entries(session.bindings)
    .filter(([itemId, tabId]) => {
      const url = snapshot.pins[itemId];
      const tab = restored.find((t) => t.id === newIds.get(tabId));
      const shared = Object.entries(snapshot.pins).some(
        ([other, page]) => other !== itemId && url !== undefined && isSamePath(page, url),
      );
      return url !== undefined && tab && isSamePage(tab.url, url) && !shared;
    })
    .map(([itemId]) => itemId);

  const early = restored.filter(() => rand.chance(0.6));
  const late = restored.filter((tab) => !early.includes(tab));
  chrome.tabs = early;
  const ready = chrome.startWorker();
  for (const tab of late) {
    chrome.tabs.push(tab);
    void chrome.service.onTabCreated({ ...tab });
  }
  await ready;
  await chrome.service.onTabActivated(chrome.tabs[0]?.id ?? 0, chrome.windows[0]!);

  expect(Object.keys(chrome.saved.model.items).sort(), 'a restart loses no pins').toEqual(
    pinsBefore,
  );
  for (const itemId of expected) {
    expect(chrome.saved.session.bindings[itemId], `${itemId} is bound again`).toBeDefined();
  }
  if (snapshot.takenAt) {
    for (const itemId of Object.keys(chrome.saved.session.bindings)) {
      expect(snapshot.pins[itemId], `only pins that were open take tabs (${itemId})`).toBeDefined();
    }
  }
  chrome.now += 20_000; // past the restore window
}

describe('torture', () => {
  it(
    `keeps the saved state sound through ${SEEDS} random runs`,
    async () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const log: string[] = [];
        const chrome = new FakeChrome(log);
        const rand = random(seed);
        for (const w of chrome.windows) {
          for (let i = 0; i < 3; i++) chrome.addTab(w, rand.pick(URLS)!, i === 0);
        }
        await chrome.startWorker();
        try {
          checkInvariants(chrome);
          for (let i = 0; i < STEPS; i++) {
            await step(chrome, rand);
            checkInvariants(chrome);
          }
        } catch (error) {
          const tail = log.slice(-12).join('\n  ');
          throw new Error(`seed ${seed}, after:\n  ${tail}\n${String(error)}`);
        }
      }
    },
    SEEDS * STEPS,
  );
});
