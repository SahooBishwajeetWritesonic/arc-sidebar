import { describe, expect, it } from 'vitest';
import {
  emptyArchive,
  emptyModel,
  emptySession,
  type ArchiveEntry,
  type ArchiveState,
  type Backup,
  type Intent,
  type SessionState,
  type SidebarModel,
} from '@/model/types';
import { SidebarService, type LiveTab } from './service';

/** A tiny in-memory Chrome for the service. */
function setup(options: { tabs: LiveTab[]; model?: SidebarModel; session?: SessionState }) {
  const tabs = [...options.tabs];
  let nextId = 100;
  let nextUuid = 0;
  let now = 1_000;
  const saved = {
    model: options.model ?? emptyModel(),
    session: options.session ?? emptySession(),
    archive: emptyArchive() as ArchiveState,
    backups: [] as Backup[],
  };
  const calls: string[] = [];
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
    now: () => now,
    newId: () => `id${nextUuid++}`,
  });
  return { service, saved, calls, tabs, advance: (ms: number) => (now += ms) };
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

  it('fills in settings for models saved before settings existed', async () => {
    const { settings: _none, ...old } = emptyModel();
    const { service } = setup({ tabs: [], model: old as SidebarModel });
    await service.ready;
    expect(service.snapshot().model.settings).toEqual({ archiveAfter: '12h' });
  });
});
