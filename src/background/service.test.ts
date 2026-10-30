import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  emptyArchive,
  emptyModel,
  emptySession,
  emptySnapshot,
  type ArchiveEntry,
  type ArchiveState,
  type Backup,
  type Intent,
  type PinItem,
  type RestoreSnapshot,
  type SessionState,
  type SidebarModel,
  type TabDetails,
} from '@/model/types';
import type { PullRequestResult } from '@/model/live';
import { SidebarService, type LiveTab } from './service';

/** A tiny in-memory Chrome for the service. */
function setup(options: {
  tabs: LiveTab[];
  model?: SidebarModel;
  session?: SessionState;
  snapshot?: RestoreSnapshot;
  details?: TabDetails;
}) {
  /** What GitHub answers; tests change it between refreshes. */
  const github: { answer: PullRequestResult | Error; asked: number } = {
    answer: { signedIn: true, pullRequests: [] },
    asked: 0,
  };
  const tabs = [...options.tabs];
  let nextId = 100;
  let nextUuid = 0;
  let now = 1_000;
  const saved = {
    model: options.model ?? emptyModel(),
    session: options.session ?? emptySession(),
    archive: emptyArchive() as ArchiveState,
    backups: [] as Backup[],
    snapshot: options.snapshot ?? emptySnapshot(),
    details: options.details ?? ({} as TabDetails),
  };
  const calls: string[] = [];
  const deferred: (() => void)[] = [];
  let service!: SidebarService;
  service = new SidebarService({
    queryTabs: async () => tabs,
    createTab: async (windowId, url, active) => {
      const created: LiveTab = { ...tab(nextId++, url, tabs.length), windowId, active };
      tabs.push(created);
      calls.push(`create ${url}`);
      await service.onTabCreated(created);
    },
    activateTab: async (id) => void calls.push(`activate ${id}`),
    navigateTab: async (id, url) => void calls.push(`navigate ${id} ${url}`),
    closeTab: async (id) => {
      calls.push(`close ${id}`);
      const index = tabs.findIndex((t) => t.id === id);
      if (index !== -1) tabs.splice(index, 1);
      await service.onTabRemoved(id, 1);
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
    fetchPullRequests: async () => {
      github.asked++;
      if (github.answer instanceof Error) throw github.answer;
      return github.answer;
    },
    // Deferred work waits for flush(); tests call takeSnapshot() themselves.
    defer: (run) => void deferred.push(run),
    now: () => now,
    newId: () => `id${nextUuid++}`,
  });
  return {
    service,
    saved,
    calls,
    tabs,
    github,
    advance: (ms: number) => (now += ms),
    flush: () => deferred.splice(0).forEach((run) => run()),
  };
}

const tab = (id: number, url: string, index = id, extra: Partial<LiveTab> = {}): LiveTab => ({
  id,
  windowId: 1,
  index,
  url,
  title: url,
  active: false,
  audible: false,
  ...extra,
});

const HOUR = 3600_000;

const pinIntent = (itemId: string, tabId: number, url: string): Intent => ({
  type: 'pinTab',
  itemId,
  tabId,
  spaceId: 'default',
  parentId: null,
  order: 'a0',
  url,
  title: itemId,
});

describe('SidebarService', () => {
  it('starts Today from the tab strip', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')] });
    await service.ready;
    expect(saved.session.orders['1']).toEqual([1, 2]);
  });

  it('puts new tabs on top of Today', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')] });
    await service.onTabCreated(tab(2, 'https://b.com'));
    expect(saved.session.orders['1']).toEqual([2, 1]);
  });

  it('puts links opened from a Today tab below it, in the order they were opened', async () => {
    const { service, saved } = setup({
      model: { ...emptyModel(), spaces: [...emptyModel().spaces, { id: 'work', name: 'Work' }] },
      tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
    });
    await service.handleIntent({ type: 'moveTabToSpace', tabId: 1, spaceId: 'work' });
    await service.onTabCreated(tab(3, 'https://a.com/1', 3, { openerTabId: 1 }));
    await service.onTabCreated(tab(4, 'https://a.com/2', 4, { openerTabId: 1 }));
    expect(saved.session.orders['1']).toEqual([1, 3, 4, 2]);
    // In the space of the tab they came from.
    expect(saved.session.tabSpaces[4]).toBe('work');
  });

  it('pins a tab: saves the pin, binds the tab, takes it out of Today', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')] });
    const result = await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    expect(saved.model.items.p1).toMatchObject({ kind: 'pin', url: 'https://a.com' });
    expect(saved.session.bindings).toEqual({ p1: 1 });
    expect(saved.session.orders['1']).toEqual([2]);
    expect(result).toEqual({
      modelRev: saved.model.rev,
      sessionRev: saved.session.rev,
      archiveRev: saved.archive.rev,
    });
  });

  it('opens an unloaded pin in a new tab and binds it instead of adding it to Today', async () => {
    const { service, saved, calls } = setup({ tabs: [tab(1, 'https://a.com')] });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    await service.handleIntent({ type: 'closePin', itemId: 'p1' });
    await service.onTabRemoved(1, 1);
    await service.handleIntent({ type: 'openPin', itemId: 'p1', windowId: 1 });
    expect(calls).toContain('create https://a.com');
    expect(saved.session.bindings).toEqual({ p1: 100 });
    expect(saved.session.orders['1']).toEqual([]);
  });

  it('keeps the pin when its tab closes', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')] });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    await service.onTabRemoved(1, 1);
    expect(saved.model.items.p1).toBeDefined();
    expect(saved.session.bindings).toEqual({});
  });

  it('re-binds pins to restored tabs after a browser restart', async () => {
    const model: SidebarModel = {
      ...emptyModel(),
      items: {
        p1: {
          kind: 'pin',
          id: 'p1',
          spaceId: 'default',
          parentId: null,
          order: 'a0',
          url: 'https://mail.google.com/mail/u/0/',
          title: 'Mail',
        },
      },
    };
    // Fresh session (rev 0): Chrome has just restarted and given tabs new ids.
    const { service, saved, advance } = setup({
      tabs: [tab(7, 'https://mail.google.com/mail/u/0/#inbox'), tab(8, 'https://b.com')],
      model,
    });
    await service.ready;
    expect(saved.session.bindings).toEqual({ p1: 7 });
    expect(saved.session.orders['1']).toEqual([8]);

    // Tabs Chrome restores a little later are matched too, but only for a while.
    advance(20_000);
    await service.onTabCreated(tab(9, 'https://mail.google.com/mail/u/0/'));
    expect(saved.session.orders['1']).toEqual([9, 8]);
  });

  it('does not re-bind by URL in an ongoing session', async () => {
    const model: SidebarModel = {
      ...emptyModel(),
      items: {
        p1: {
          kind: 'pin',
          id: 'p1',
          spaceId: 'default',
          parentId: null,
          order: 'a0',
          url: 'https://a.com/',
          title: 'A',
        },
      },
    };
    const { service, saved } = setup({
      tabs: [tab(1, 'https://a.com/')],
      model,
      session: { ...emptySession(), rev: 5, orders: { '1': [1] } },
    });
    await service.ready;
    expect(saved.session.bindings).toEqual({});
    expect(saved.session.orders['1']).toEqual([1]);
  });

  it('carries bindings and order across a replaced tab', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')] });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    await service.onTabReplaced(11, 1);
    await service.onTabReplaced(12, 2);
    expect(saved.session.bindings).toEqual({ p1: 11 });
    expect(saved.session.orders['1']).toEqual([12]);
  });

  it('auto-archives Today tabs not viewed for 12 hours, except the active and audible ones', async () => {
    const old = 1_000 - 13 * HOUR;
    const { service, saved, calls } = setup({
      tabs: [
        tab(1, 'https://stale.com', 1, { lastAccessed: old, title: 'Stale' }),
        tab(2, 'https://fresh.com', 2, { lastAccessed: 1_000 - HOUR }),
        tab(3, 'https://active.com', 3, { lastAccessed: old, active: true }),
        tab(4, 'https://music.com', 4, { lastAccessed: old, audible: true }),
        tab(5, 'https://pinned.com', 5, { lastAccessed: old }),
      ],
    });
    await service.handleIntent(pinIntent('p5', 5, 'https://pinned.com'));
    expect(await service.archiveStale()).toBe(1);
    expect(calls).toEqual(['close 1']);
    expect(saved.archive.entries).toMatchObject([
      { url: 'https://stale.com', title: 'Stale', reason: 'auto' },
    ]);
    expect(saved.session.orders['1']).toEqual([2, 3, 4]);
  });

  it('follows the archive setting', async () => {
    const { service, calls } = setup({
      tabs: [tab(1, 'https://a.com', 1, { lastAccessed: 1_000 - 13 * HOUR })],
    });
    await service.handleIntent({ type: 'setArchiveAfter', archiveAfter: '24h' });
    expect(await service.archiveStale()).toBe(0);
    expect(calls).toEqual([]);
  });

  it('clears Today into the archive and restores it in the original order', async () => {
    const { service, saved, calls } = setup({
      tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com'), tab(3, 'https://c.com')],
    });
    const entry = (id: string, url: string): ArchiveEntry => ({
      id,
      url,
      title: url,
      spaceId: 'default',
      archivedAt: 1_000,
      reason: 'cleared',
      batchId: 'b1',
    });
    await service.handleIntent({
      type: 'archiveTabs',
      windowId: 1,
      tabs: [
        { tabId: 1, entry: entry('e1', 'https://a.com') },
        { tabId: 2, entry: entry('e2', 'https://b.com') },
      ],
    });
    expect(saved.session.orders['1']).toEqual([3]);
    expect(saved.archive.entries.map((e) => e.id)).toEqual(['e1', 'e2']);

    await service.handleIntent({ type: 'restoreArchived', windowId: 1, entryIds: ['e1', 'e2'] });
    expect(calls.slice(-2)).toEqual(['create https://b.com', 'create https://a.com']);
    // a.com (tab 101) back on top, then b.com (tab 100), as before the clear.
    expect(saved.session.orders['1']!.slice(0, 2)).toEqual([101, 100]);
    expect(saved.archive.entries).toEqual([]);
  });

  it('keeps hourly backups of the model before it changes', async () => {
    const { service, saved, advance } = setup({
      tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
    });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    expect(saved.backups).toHaveLength(0); // nothing worth keeping yet
    await service.handleIntent({ type: 'rename', itemId: 'p1', title: 'A' });
    await service.handleIntent({ type: 'rename', itemId: 'p1', title: 'B' });
    expect(saved.backups).toHaveLength(1);
    advance(2 * HOUR);
    await service.handleIntent({ type: 'rename', itemId: 'p1', title: 'C' });
    expect(saved.backups).toHaveLength(2);
    expect(saved.backups[0]!.model.items.p1).toMatchObject({ customTitle: 'B' });
  });

  it('always backs up the model before an import', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')] });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    await service.handleIntent({ type: 'rename', itemId: 'p1', title: 'A' });
    expect(saved.backups).toHaveLength(1);
    await service.handleIntent({
      type: 'importSidebar',
      spaces: [{ id: 'w', name: 'Work' }],
      items: [],
    });
    expect(saved.backups).toHaveLength(2); // within the hour, but kept anyway
    expect(saved.backups[0]).toMatchObject({ reason: 'import' });
    expect(saved.backups[0]!.model.spaces).toHaveLength(1);
  });

  it('restores a copy of the sidebar, keeping open tabs open', async () => {
    const { service, saved } = setup({
      tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com'), tab(3, 'https://c.com')],
    });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    const before = saved.model;
    await service.handleIntent({ ...pinIntent('p2', 2, 'https://b.com'), order: 'a1' } as Intent);
    await service.handleIntent({ type: 'createSpace', spaceId: 'w', name: 'Work', index: 1 });
    await service.handleIntent({ type: 'setActiveSpace', windowId: 1, spaceId: 'w' });

    await service.handleIntent({ type: 'restoreSidebar', model: before, windowId: 1 });
    expect(Object.keys(saved.model.items)).toEqual(['p1']);
    expect(saved.model.spaces.map((space) => space.id)).toEqual(['default']);
    expect(saved.model.rev).toBeGreaterThan(before.rev);
    // p1 is still open; p2's tab is back in Today, in the space the window now shows.
    expect(saved.session.bindings).toEqual({ p1: 1 });
    expect(saved.session.orders['1']).toEqual([2, 3]);
    expect(saved.session.activeSpaces['1']).toBe('default');
    expect(saved.session.tabSpaces[2]).toBe('default');
    expect(saved.backups[0]).toMatchObject({ reason: 'restore' });
    expect(Object.keys(saved.backups[0]!.model.items)).toEqual(['p1', 'p2']);
  });

  it('refuses a copy with no sidebar in it', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')] });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    const model = saved.model;
    await service.handleIntent({
      type: 'restoreSidebar',
      model: { ...model, spaces: [] },
      windowId: 1,
    });
    expect(saved.model).toBe(model);
  });

  it('puts a split’s two tabs together in Today, left pane first, in one space', async () => {
    const { service, saved, tabs } = setup({
      tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com'), tab(3, 'https://c.com')],
    });
    await service.ready;
    await service.handleIntent({ type: 'moveTabToSpace', tabId: 1, spaceId: 'work' });
    expect(saved.session.orders['1']).toEqual([1, 2, 3]);
    // Chrome splits 3 (left) with 1 (right): 1 moves next to 3.
    tabs[0] = { ...tabs[0]!, index: 3, splitViewId: 7 };
    tabs[2] = { ...tabs[2]!, index: 2, splitViewId: 7 };
    await service.onTabSplit(7);
    expect(saved.session.orders['1']).toEqual([2, 3, 1]);
    expect(saved.session.tabSpaces['1']).toBe(saved.session.tabSpaces['3']);
  });

  it('names a pin added by its address after its page, once that has loaded', async () => {
    const { service, saved, advance } = setup({ tabs: [] });
    const url = 'https://example.com/';
    await service.handleIntent({
      type: 'addPin',
      itemId: 'p1',
      spaceId: 'default',
      parentId: null,
      order: 'a0',
      url,
    });
    expect(saved.model.items.p1).toMatchObject({ title: url });
    advance(60_000); // past the restart window, so the tab is matched as an opened pin
    await service.handleIntent({ type: 'openPin', itemId: 'p1', windowId: 1 });
    const tabId = saved.session.bindings.p1!;
    // Chrome shows the address as the title while it loads.
    await service.onTabUpdated(tabId, { title: 'example.com/' });
    expect(saved.model.items.p1).toMatchObject({ title: url });
    await service.onTabUpdated(tabId, { title: 'Example Domain' });
    expect(saved.model.items.p1).toMatchObject({ url, title: 'Example Domain' });
  });

  it('archives a Today tab closed in Chrome, with the page it was on', async () => {
    const { service, saved } = setup({ tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')] });
    await service.onTabUpdated(1, { url: 'https://a.com/next' });
    await service.onTabUpdated(1, { title: 'Next' });
    await service.onTabRemoved(1, 1);
    expect(saved.archive.entries).toEqual([
      expect.objectContaining({
        url: 'https://a.com/next',
        title: 'Next',
        spaceId: 'default',
        reason: 'closed',
      }),
    ]);
    expect(saved.session.orders['1']).toEqual([2]);
  });

  it("doesn't archive pinned tabs, new tab pages, closing windows or tabs the sidebar closed", async () => {
    const { service, saved } = setup({
      tabs: [
        tab(1, 'https://a.com'),
        tab(2, 'chrome://newtab/'),
        tab(3, 'https://c.com'),
        tab(4, 'https://d.com'),
      ],
    });
    await service.handleIntent(pinIntent('p1', 1, 'https://a.com'));
    await service.onTabRemoved(1, 1);
    await service.onTabRemoved(2, 1);
    await service.onTabRemoved(3, 1, true);
    const entry = {
      id: 'e4',
      url: 'https://d.com',
      title: 'D',
      spaceId: 'default',
      archivedAt: 1,
      reason: 'closed' as const,
      batchId: 'b4',
    };
    // The panel's ✕: archived once, by the panel's entry.
    await service.handleIntent({ type: 'archiveTabs', windowId: 1, tabs: [{ tabId: 4, entry }] });
    expect(saved.archive.entries).toEqual([entry]);
  });

  it('archives a tab whose closing woke the worker', async () => {
    const before = setup({ tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')] });
    await before.service.handleIntent({
      type: 'createSpace',
      spaceId: 's2',
      name: 'Two',
      index: 1,
    });
    await before.service.handleIntent({ type: 'moveTabToSpace', tabId: 2, spaceId: 's2' });
    await before.service.onTabUpdated(2, { title: 'B' });
    before.flush();
    // Chrome stopped the worker; closing tab 2 starts a new one that no longer sees the tab.
    const after = setup({
      tabs: [tab(1, 'https://a.com')],
      model: before.saved.model,
      session: before.saved.session,
      details: before.saved.details,
    });
    await after.service.onTabRemoved(2, 1);
    expect(after.saved.archive.entries).toEqual([
      expect.objectContaining({ url: 'https://b.com', title: 'B', spaceId: 's2' }),
    ]);
  });

  it('fills in settings for models saved before settings existed', async () => {
    const { settings: _none, ...old } = emptyModel();
    const { service } = setup({ tabs: [], model: old as SidebarModel });
    await service.ready;
    expect(service.snapshot().model.settings).toEqual(defaultSettings());
  });

  it('fills in settings added later (appearance) and keeps the ones saved', async () => {
    const old = { ...emptyModel(), settings: { archiveAfter: '7d' } } as unknown as SidebarModel;
    const { service } = setup({ tabs: [], model: old });
    await service.ready;
    expect(service.snapshot().model.settings).toEqual({ ...defaultSettings(), archiveAfter: '7d' });
  });

  describe('spaces', () => {
    const twoSpaces = (): SidebarModel => ({
      ...emptyModel(),
      spaces: [
        { id: 'home', name: 'Home' },
        { id: 'work', name: 'Work' },
      ],
    });

    it('puts new tabs in the window\u2019s space and follows activation into another', async () => {
      const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')], model: twoSpaces() });
      await service.ready;
      expect(saved.session.tabSpaces).toEqual({ 1: 'home' });

      await service.handleIntent({ type: 'setActiveSpace', windowId: 1, spaceId: 'work' });
      await service.onTabCreated(tab(2, 'https://b.com'));
      expect(saved.session.tabSpaces[2]).toBe('work');

      // Activating a Home tab (say from Chrome's tab strip) switches the sidebar back.
      await service.onTabActivated(1, 1);
      expect(saved.session.activeSpaces['1']).toBe('home');
      expect(saved.session.lastActive).toMatchObject({ home: 1 });
    });

    it('sends new tabs to the space Air Traffic Control names, even links from another space', async () => {
      const model = twoSpaces();
      model.settings = {
        ...model.settings,
        routes: [{ id: 'r', match: 'contains', text: 'figma.com', spaceId: 'work' }],
      };
      const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')], model });
      await service.ready;
      await service.onTabCreated(tab(2, 'https://www.figma.com/file/x', 2, { openerTabId: 1 }));
      expect(saved.session.tabSpaces[2]).toBe('work');
      await service.onTabCreated(tab(3, 'https://b.com', 3, { openerTabId: 1 }));
      expect(saved.session.tabSpaces[3]).toBe('home');
      expect(saved.session.orders['1']).toEqual([2, 1, 3]);
    });

    it('a tab moved to a window of its own keeps its space, which that window shows', async () => {
      const { service, saved } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
        model: twoSpaces(),
      });
      await service.handleIntent({ type: 'moveTabToSpace', tabId: 2, spaceId: 'work' });
      await service.onTabDetached(2, 1);
      await service.onTabAttached(2, 9);
      expect(saved.session.orders['9']).toEqual([2]);
      expect(saved.session.tabSpaces[2]).toBe('work');
      expect(saved.session.activeSpaces['9']).toBe('work');
      // Into a window that already shows a space, it joins that space.
      await service.onTabDetached(2, 9);
      await service.onTabAttached(2, 1);
      expect(saved.session.tabSpaces[2]).toBe('home');
    });

    it('opens a new tab in a space that has nothing to select', async () => {
      const { service, saved, calls } = setup({
        tabs: [tab(1, 'https://a.com')],
        model: twoSpaces(),
      });
      await service.handleIntent({
        type: 'setActiveSpace',
        windowId: 1,
        spaceId: 'work',
        openNewTab: true,
      });
      expect(calls).toContain('create chrome://newtab/');
      expect(saved.session.tabSpaces[100]).toBe('work');
    });

    it('a pinned tab belongs to its pin\u2019s space', async () => {
      const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')], model: twoSpaces() });
      await service.handleIntent({
        ...pinIntent('p1', 1, 'https://a.com'),
        spaceId: 'work',
      } as Intent);
      expect(saved.session.tabSpaces).toEqual({});
      await service.onTabActivated(1, 1);
      expect(saved.session.activeSpaces['1']).toBe('work');
    });

    it('deleting a space removes its pins and moves its Today tabs to another space', async () => {
      const model = twoSpaces();
      const { service, saved } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
        model,
      });
      await service.handleIntent({ type: 'moveTabToSpace', tabId: 2, spaceId: 'work' });
      await service.handleIntent({
        ...pinIntent('p1', 1, 'https://a.com'),
        spaceId: 'work',
      } as Intent);
      await service.handleIntent({
        type: 'deleteSpace',
        spaceId: 'work',
        fallbackSpaceId: 'home',
        itemIds: ['p1'],
        windowId: 1,
      });
      expect(saved.model.spaces.map((space) => space.id)).toEqual(['home']);
      expect(saved.model.items.p1).toBeUndefined();
      expect(saved.session.tabSpaces[2]).toBe('home');
      // The tab p1 had open is released into Home's Today, not left bound to nothing.
      expect(saved.session.bindings).toEqual({});
      expect(saved.session.tabSpaces[1]).toBe('home');
      expect(saved.session.orders['1']).toContain(1);
    });

    it('puts restored tabs back in their spaces after a restart', async () => {
      const { service, saved } = setup({
        model: twoSpaces(),
        snapshot: {
          ...emptySnapshot(),
          today: { home: ['https://a.com/'], work: ['https://b.com/', 'https://c.com/'] },
          takenAt: 1,
        },
        // Fresh session: Chrome has restarted and restored the tabs with new ids.
        tabs: [tab(7, 'https://c.com/'), tab(8, 'https://a.com/'), tab(9, 'https://new.com/')],
      });
      await service.ready;
      expect(saved.session.tabSpaces).toEqual({ 7: 'work', 8: 'home', 9: 'home' });

      // One Chrome restores a moment later is matched too.
      await service.onTabCreated(tab(10, 'https://b.com/'));
      expect(saved.session.tabSpaces[10]).toBe('work');
    });

    it('keeps renamed Today tabs’ names over a restart, and archives them by name', async () => {
      const before = setup({
        model: twoSpaces(),
        tabs: [tab(1, 'https://a.com/'), tab(2, 'https://b.com/')],
      });
      await before.service.handleIntent({ type: 'renameTab', tabId: 2, title: 'Docs' });
      await before.service.takeSnapshot();
      expect(before.saved.snapshot.titles).toEqual({ home: [null, 'Docs'] });

      // Chrome restarts and restores both with new ids, one a moment later.
      const { service, saved } = setup({
        model: twoSpaces(),
        snapshot: before.saved.snapshot,
        tabs: [tab(7, 'https://a.com/')],
      });
      await service.ready;
      await service.onTabCreated(tab(8, 'https://b.com/'));
      expect(saved.session.tabTitles).toEqual({ 8: 'Docs' });

      await service.onTabRemoved(8, 1);
      expect(saved.archive.entries[0]).toMatchObject({ url: 'https://b.com/', title: 'Docs' });
      expect(saved.session.tabTitles).toEqual({});
    });

    it('snapshots each space\u2019s Today URLs, top first', async () => {
      const { service, saved, tabs } = setup({
        model: twoSpaces(),
        tabs: [tab(1, 'https://a.com/'), tab(2, 'https://b.com/')],
      });
      await service.handleIntent({ type: 'moveTabToSpace', tabId: 2, spaceId: 'work' });
      await service.handleIntent({
        ...pinIntent('p1', 1, 'https://a.com/'),
        spaceId: 'home',
      } as Intent);
      tabs.push(tab(3, 'https://c.com/'));
      await service.onTabCreated(tabs[2]!);
      await service.takeSnapshot();
      expect(saved.snapshot).toEqual({
        today: { work: ['https://b.com/'], home: ['https://c.com/'] },
        pins: { p1: 'https://a.com/' },
        takenAt: 1_000,
      });
    });

    it('gives restored tabs back to the pins that were open, not closed ones for the same page', async () => {
      const pin = (id: string, spaceId: string, order: string): PinItem => ({
        kind: 'pin',
        id,
        spaceId,
        parentId: null,
        order,
        url: 'https://mail.com/',
        title: id,
      });
      const model: SidebarModel = {
        ...twoSpaces(),
        // The same page pinned in both spaces; only Work's was open.
        items: { home: pin('home', 'home', 'a0'), work: pin('work', 'work', 'a0') },
      };
      const { service, saved } = setup({
        model,
        snapshot: {
          today: { home: ['https://mail.com/'] },
          pins: { work: 'https://mail.com/inbox/42' },
          takenAt: 1,
        },
        tabs: [tab(7, 'https://mail.com/'), tab(8, 'https://mail.com/inbox/42')],
      });
      await service.ready;
      // Work's pin gets its tab back, even though it had moved off the pinned
      // page; the other mail tab was a Today tab and stays one.
      expect(saved.session.bindings).toEqual({ work: 8 });
      expect(saved.session.orders['1']).toEqual([7]);
      expect(saved.session.tabSpaces[7]).toBe('home');
    });
  });

  it('opening a favorite keeps the shown space', async () => {
    const model: SidebarModel = {
      ...emptyModel(),
      spaces: [
        { id: 'home', name: 'Home' },
        { id: 'work', name: 'Work' },
      ],
    };
    const { service, saved } = setup({
      tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
      model,
    });
    await service.handleIntent({ type: 'setActiveSpace', windowId: 1, spaceId: 'work' });
    await service.handleIntent({
      ...pinIntent('fav', 1, 'https://a.com'),
      spaceId: 'favorites',
    } as Intent);
    await service.onTabActivated(1, 1);
    expect(saved.session.activeSpaces['1']).toBe('work');
  });

  describe('GitHub Live Folder', () => {
    const PR = 'https://github.com/acme/app/pull/12';
    const pullRequest = (number: number, created = `2026-10-${number}`) => ({
      url: `https://github.com/acme/app/pull/${number}`,
      title: `Change ${number}`,
      repo: 'acme/app',
      number,
      draft: false,
      created,
    });
    const folderOf = (model: SidebarModel) =>
      Object.values(model.items).find((item) => item.kind === 'folder');
    const pinsIn = (model: SidebarModel) =>
      Object.values(model.items).filter((item) => item.kind === 'pin' && item.live);

    it('is made in the tab’s space the first time a pull request opens, and fills', async () => {
      const { service, saved, github } = setup({ tabs: [tab(1, 'https://a.com')] });
      github.answer = { signedIn: true, pullRequests: [pullRequest(12), pullRequest(11)] };
      await service.onTabUpdated(1, { url: PR });
      await service.refreshLiveFolder();
      expect(folderOf(saved.model)).toMatchObject({ name: 'Pull Requests', spaceId: 'default' });
      expect(pinsIn(saved.model).map((pin) => pin.kind === 'pin' && pin.title)).toEqual(
        expect.arrayContaining(['Change 12', 'Change 11']),
      );
      expect(github.asked).toBe(1);
    });

    it('the tab a pull request was made in moves into the folder as its row', async () => {
      const { service, saved, github } = setup({ tabs: [tab(1, 'https://a.com')] });
      github.answer = { signedIn: true, pullRequests: [pullRequest(12), pullRequest(11)] };
      await service.onTabUpdated(1, { url: PR });
      await service.refreshLiveFolder();
      const twelve = pinsIn(saved.model).find((pin) => pin.kind === 'pin' && pin.url === PR)!;
      expect(saved.session.bindings[twelve.id]).toBe(1);
      expect(saved.session.orders['1']).toEqual([]);
    });

    it('a tab that goes to one of its pull requests later moves in too, from its space only', async () => {
      const model: SidebarModel = {
        ...emptyModel(),
        spaces: [
          { id: 'default', name: 'Work' },
          { id: 'home', name: 'Home' },
        ],
      };
      const { service, saved, github } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com'), tab(3, 'https://c.com')],
        model,
      });
      github.answer = { signedIn: true, pullRequests: [pullRequest(13), pullRequest(14)] };
      await service.handleIntent({
        type: 'createLiveFolder',
        itemId: 'live',
        spaceId: 'default',
        order: 'a0',
      });
      await service.refreshLiveFolder();
      await service.handleIntent({ type: 'moveTabToSpace', tabId: 3, spaceId: 'home' });
      // Its Files tab counts, whatever the case of the names.
      await service.onTabUpdated(2, { url: 'https://github.com/ACME/app/pull/13/files' });
      await service.onTabUpdated(3, { url: 'https://github.com/acme/app/pull/14' });
      const byNumber = (n: number) =>
        pinsIn(saved.model).find((pin) => pin.kind === 'pin' && pin.url.endsWith(`/${n}`))!;
      expect(saved.session.bindings[byNumber(13).id]).toBe(2);
      expect(saved.session.bindings[byNumber(14).id]).toBeUndefined();
      expect(saved.session.orders['1']).toEqual(expect.arrayContaining([1, 3]));
    });

    it('isn’t made again once deleted, until made by hand', async () => {
      const { service, saved } = setup({ tabs: [tab(1, 'https://a.com')] });
      await service.onTabUpdated(1, { url: PR });
      const folder = folderOf(saved.model)!;
      await service.handleIntent({
        type: 'deleteLiveFolder',
        itemId: folder.id,
        itemIds: [],
        spaceId: 'default',
        windowId: 1,
      });
      await service.onTabUpdated(1, { url: 'https://github.com/acme/app/pull/13' });
      expect(folderOf(saved.model)).toBeUndefined();
    });

    it('asks again soon after a pull request page loads, then at most every 30 s', async () => {
      const { service, saved, github, flush, advance } = setup({ tabs: [tab(1, 'https://a.com')] });
      await service.onTabUpdated(1, { url: PR });
      await service.refreshLiveFolder();
      expect(github.asked).toBe(1);
      github.answer = { signedIn: true, pullRequests: [pullRequest(13)] };
      advance(30_000);
      await service.onTabUpdated(1, { url: 'https://github.com/acme/app/pull/13' });
      flush();
      await service.refreshLiveFolder();
      expect(github.asked).toBe(2);
      expect(pinsIn(saved.model)).toHaveLength(1);
      // Other pages, or the alarm a moment later, don't ask again.
      await service.onTabUpdated(1, { url: 'https://github.com/acme/app' });
      flush();
      await service.refreshLiveFolder();
      expect(github.asked).toBe(2);
      advance(30_000);
      await service.refreshLiveFolder();
      expect(github.asked).toBe(3);
    });

    it('signed out, looks again after any GitHub page, in case it was the sign-in', async () => {
      const { service, saved, github, flush, advance } = setup({ tabs: [tab(1, 'https://a.com')] });
      github.answer = { signedIn: false };
      await service.onTabUpdated(1, { url: PR });
      await service.refreshLiveFolder();
      expect(folderOf(saved.model)).toMatchObject({ live: { signedOut: true } });
      github.answer = { signedIn: true, pullRequests: [pullRequest(12)] };
      advance(30_000);
      await service.onTabUpdated(1, { url: 'https://github.com/' });
      flush();
      await service.refreshLiveFolder();
      expect(pinsIn(saved.model)).toHaveLength(1);
      expect(folderOf(saved.model)).not.toMatchObject({ live: { signedOut: true } });
    });

    it('Refresh asks at once and answers when the folder is up to date', async () => {
      const { service, saved, github } = setup({ tabs: [tab(1, 'https://a.com')] });
      await service.onTabUpdated(1, { url: PR });
      await service.refreshLiveFolder();
      const folder = folderOf(saved.model)!;
      github.answer = { signedIn: true, pullRequests: [pullRequest(14)] };
      await service.handleIntent({ type: 'refreshLiveFolder', itemId: folder.id });
      expect(github.asked).toBe(2);
      expect(pinsIn(saved.model)).toHaveLength(1);
    });

    it('asks again when the filters change, even mid-answer', async () => {
      const { service, saved, github } = setup({ tabs: [tab(1, 'https://a.com')] });
      await service.onTabUpdated(1, { url: PR });
      const folder = folderOf(saved.model)!;
      if (folder.kind !== 'folder' || !folder.live) throw new Error('no live folder');
      await service.handleIntent({
        type: 'setLiveFilters',
        itemId: folder.id,
        filters: { ...folder.live.filters, drafts: false },
      });
      await service.refreshLiveFolder();
      await service.refreshLiveFolder();
      expect(github.asked).toBe(2);
    });

    it('keeps its pull requests when GitHub can’t be reached', async () => {
      const { service, saved, github, advance } = setup({ tabs: [tab(1, 'https://a.com')] });
      github.answer = { signedIn: true, pullRequests: [pullRequest(12)] };
      await service.onTabUpdated(1, { url: PR });
      await service.refreshLiveFolder();
      github.answer = new Error('offline');
      advance(60_000);
      await service.refreshLiveFolder();
      expect(pinsIn(saved.model)).toHaveLength(1);
    });

    it('gives a merged pull request’s tab back to Today', async () => {
      const { service, saved, github, advance } = setup({ tabs: [tab(1, 'https://a.com')] });
      github.answer = { signedIn: true, pullRequests: [pullRequest(12)] };
      await service.onTabUpdated(1, { url: PR });
      await service.refreshLiveFolder();
      const [pin] = pinsIn(saved.model);
      await service.handleIntent({ type: 'openPin', itemId: pin!.id, windowId: 1 });
      const tabId = saved.session.bindings[pin!.id]!;
      expect(saved.session.orders['1']).not.toContain(tabId);
      github.answer = { signedIn: true, pullRequests: [] };
      advance(60_000);
      await service.refreshLiveFolder();
      expect(pinsIn(saved.model)).toHaveLength(0);
      expect(saved.session.bindings[pin!.id]).toBeUndefined();
      expect(saved.session.orders['1']![0]).toBe(tabId);
    });
  });

  describe('Chrome’s tab menu', () => {
    const twoSpaces = (): SidebarModel => ({
      ...emptyModel(),
      spaces: [
        { id: 'default', name: 'Work' },
        { id: 'home', name: 'Home' },
      ],
    });

    it('pins Today tabs at the end of their space, once', async () => {
      const { service, saved } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
      });
      await service.pinTabs([1, 2]);
      await service.pinTabs([1]);
      const pins = Object.values(saved.model.items).sort((a, b) => (a.order < b.order ? -1 : 1));
      expect(pins.map((pin) => pin.kind === 'pin' && pin.url)).toEqual([
        'https://a.com',
        'https://b.com',
      ]);
      expect(saved.session.orders['1']).toEqual([]);
    });

    it('adds Today and pinned tabs to Favorites', async () => {
      const { service, saved } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
      });
      await service.pinTabs([2]);
      await service.favoriteTabs([1, 2]);
      const favorites = Object.values(saved.model.items).filter(
        (item) => item.spaceId === 'favorites',
      );
      expect(favorites).toHaveLength(2);
    });

    it('moves Today tabs to the other space’s Today, and pins to its Pinned', async () => {
      const { service, saved } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
        model: twoSpaces(),
      });
      await service.pinTabs([2]);
      await service.moveTabsToSpace([1, 2], 'home');
      expect(saved.session.tabSpaces[1]).toBe('home');
      const pin = Object.values(saved.model.items)[0]!;
      expect(pin).toMatchObject({ spaceId: 'home', parentId: null });
    });
  });

  describe('shortcuts without the sidebar open', () => {
    const twoSpaces = (): SidebarModel => ({
      ...emptyModel(),
      spaces: [
        { id: 'default', name: 'Work' },
        { id: 'home', name: 'Home' },
      ],
    });

    it('steps through open tabs in sidebar order: Favorites, Pinned, then Today', async () => {
      const { service, calls } = setup({
        tabs: [1, 2, 3, 4].map((id) => tab(id, `https://${id}.com`)),
      });
      await service.favoriteTabs([4]);
      await service.pinTabs([3]);
      // Sidebar order: 4 (favorite), 3 (pinned), then Today 1, 2.
      await service.stepTab(1, 3, 1);
      await service.stepTab(1, 3, -1);
      await service.stepTab(1, 4, -1); // the top: nowhere to go
      await service.stepTab(1, 2, 1); // the bottom
      expect(calls.filter((call) => call.startsWith('activate'))).toEqual([
        'activate 1',
        'activate 4',
      ]);
    });

    it('pins the current tab, and unpins it back to the top of Today', async () => {
      const { service, saved } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
      });
      await service.togglePin(2, 1);
      expect(service.isPinned(2)).toBe(true);
      expect(saved.session.orders['1']).toEqual([1]);
      await service.togglePin(2, 1);
      expect(service.isPinned(2)).toBe(false);
      expect(saved.session.orders['1']).toEqual([2, 1]);
    });

    it('switches spaces, selecting the tab last used there, or a new one', async () => {
      const { service, saved, calls } = setup({
        tabs: [tab(1, 'https://a.com'), tab(2, 'https://b.com')],
        model: twoSpaces(),
      });
      await service.moveTabsToSpace([2], 'home');
      await service.switchSpaceBy(1, 1);
      expect(saved.session.activeSpaces['1']).toBe('home');
      expect(calls).toContain('activate 2');
      await service.handleIntent({
        type: 'deleteSpace',
        spaceId: 'home',
        fallbackSpaceId: 'default',
        itemIds: [],
        windowId: 1,
      });
      await service.handleIntent({
        type: 'createSpace',
        spaceId: 'empty',
        name: 'Empty',
        index: 1,
      });
      await service.switchSpace(1, 'empty');
      expect(calls).toContain('create chrome://newtab/');
    });

    it('clears Today except tabs playing sound, into the archive', async () => {
      const { service, saved, calls } = setup({
        tabs: [
          tab(1, 'https://a.com'),
          tab(2, 'https://b.com', 2, { audible: true }),
          tab(3, 'https://c.com'),
        ],
      });
      await service.clearToday(1);
      expect(calls).toEqual(expect.arrayContaining(['close 1', 'close 3']));
      expect(calls).not.toContain('close 2');
      expect(saved.archive.entries.map((entry) => entry.url).sort()).toEqual([
        'https://a.com',
        'https://c.com',
      ]);
    });
  });
});
