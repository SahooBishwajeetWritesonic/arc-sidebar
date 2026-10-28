import { describe, expect, it } from 'vitest';
import {
  emptyModel,
  emptySession,
  type Intent,
  type SessionState,
  type SidebarModel,
} from '@/model/types';
import { SidebarService, type LiveTab } from './service';

/** A tiny in-memory Chrome for the service. */
function setup(options: { tabs: LiveTab[]; model?: SidebarModel; session?: SessionState }) {
  const tabs = [...options.tabs];
  let nextId = 100;
  let now = 1_000;
  const saved = {
    model: options.model ?? emptyModel(),
    session: options.session ?? emptySession(),
  };
  const calls: string[] = [];
  let service!: SidebarService;
  service = new SidebarService({
    queryTabs: async () => tabs,
    getTab: async (id) => tabs.find((tab) => tab.id === id),
    createTab: async (windowId, url) => {
      const tab = { id: nextId++, windowId, index: tabs.length, url };
      tabs.push(tab);
      calls.push(`create ${url}`);
      await service.onTabCreated(tab);
    },
    activateTab: async (id) => void calls.push(`activate ${id}`),
    navigateTab: async (id, url) => void calls.push(`navigate ${id} ${url}`),
    closeTab: async (id) => void calls.push(`close ${id}`),
    loadModel: async () => saved.model,
    saveModel: async (model) => void (saved.model = model),
    loadSession: async () => saved.session,
    saveSession: async (session) => void (saved.session = session),
    now: () => now,
  });
  return { service, saved, calls, tabs, advance: (ms: number) => (now += ms) };
}

const tab = (id: number, url: string, index = id): LiveTab => ({ id, windowId: 1, index, url });

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
    expect(result).toEqual({ modelRev: saved.model.rev, sessionRev: saved.session.rev });
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
});
