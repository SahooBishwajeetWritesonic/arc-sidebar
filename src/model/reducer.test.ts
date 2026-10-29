import { describe, expect, it } from 'vitest';
import { applyArchiveIntent, applyIntent, applySessionIntent } from './reducer';
import { childrenOf, flattenSpace } from './tree';
import {
  ARCHIVE_LIMIT,
  FAVORITES_ID,
  FAVORITES_LIMIT,
  emptyArchive,
  emptyModel,
  emptySession,
  type ArchiveEntry,
  type Intent,
  type SidebarModel,
} from './types';

const S = 'default';

function build(...intents: Intent[]): SidebarModel {
  return intents.reduce(applyIntent, emptyModel());
}

const pin = (itemId: string, order: string, parentId: string | null = null): Intent => ({
  type: 'pinTab',
  itemId,
  tabId: Number(itemId.replace(/\D/g, '')) || 1,
  spaceId: S,
  parentId,
  order,
  url: `https://example.com/${itemId}`,
  title: itemId,
});

const folder = (itemId: string, order: string, childIds?: string[]): Intent => ({
  type: 'createFolder',
  itemId,
  spaceId: S,
  parentId: null,
  order,
  name: itemId,
  childIds,
});

const ids = (model: SidebarModel, parentId: string | null = null) =>
  childrenOf(model, S, parentId).map((item) => item.id);

describe('applyIntent', () => {
  it('pins in order', () => {
    expect(ids(build(pin('p2', 'a1'), pin('p1', 'a0')))).toEqual(['p1', 'p2']);
  });

  it('is idempotent, so panels can re-apply intents the service already saved', () => {
    const intents = [
      pin('p1', 'a0'),
      folder('f1', 'a1', ['p1']),
      { type: 'setFolderCollapsed', itemId: 'f1', collapsed: true } as Intent,
      { type: 'rename', itemId: 'p1', title: 'Mail' } as Intent,
      { type: 'move', itemId: 'p1', parentId: null, order: 'a2' } as Intent,
    ];
    const once = build(...intents);
    const twice = intents.reduce(applyIntent, once);
    expect(twice).toEqual(once);
  });

  it('creates a folder around existing items with valid order keys', () => {
    const many = Array.from({ length: 12 }, (_, i) => pin(`p${i}`, `a${i < 10 ? i : 'A'}${i}`));
    const model = build(
      ...many,
      folder(
        'f1',
        'Zz',
        many.map((p) => (p as { itemId: string }).itemId),
      ),
    );
    const inside = childrenOf(model, S, 'f1');
    expect(inside).toHaveLength(12);
    expect(new Set(inside.map((item) => item.order)).size).toBe(12);
  });

  it('moves a deleted folder’s contents into its place', () => {
    const model = build(
      pin('p1', 'a0'),
      pin('p2', 'a1'),
      pin('p3', 'a2'),
      folder('f1', 'a3', ['p2', 'p3']),
    );
    const deleted = applyIntent(model, { type: 'deleteFolder', itemId: 'f1' });
    expect(ids(deleted)).toEqual(['p1', 'p2', 'p3']);
    expect(deleted.items.f1).toBeUndefined();
  });

  it('refuses to move a folder into itself', () => {
    const model = build(folder('f1', 'a0'), folder('f2', 'a1'));
    const nested = applyIntent(model, { type: 'move', itemId: 'f2', parentId: 'f1', order: 'a0' });
    const loop = applyIntent(nested, { type: 'move', itemId: 'f1', parentId: 'f2', order: 'a0' });
    expect(loop).toBe(nested);
  });

  it('keeps a custom title only when it differs from the page title', () => {
    const model = build(pin('p1', 'a0'));
    expect(
      applyIntent(model, { type: 'rename', itemId: 'p1', title: ' Mail ' }).items.p1,
    ).toMatchObject({
      customTitle: 'Mail',
    });
    expect(
      applyIntent(model, { type: 'rename', itemId: 'p1', title: '' }).items.p1,
    ).not.toHaveProperty('customTitle');
  });
});

describe('flattenSpace', () => {
  it('hides a collapsed folder’s children except the active one', () => {
    let model = build(folder('f1', 'a0'), pin('p1', 'a0', 'f1'), pin('p2', 'a1', 'f1'));
    model = applyIntent(model, { type: 'setFolderCollapsed', itemId: 'f1', collapsed: true });
    const rows = flattenSpace(model, S, (item) => item.id === 'p2');
    expect(rows.map((r) => [r.item.id, r.depth])).toEqual([
      ['f1', 0],
      ['p2', 1],
    ]);
  });
});

describe('applySessionIntent', () => {
  it('binds a pinned tab and takes it out of Today', () => {
    const session = { ...emptySession(), orders: { '1': [5, 6] } };
    const next = applySessionIntent(session, pin('p6', 'a0'));
    expect(next.bindings).toEqual({ p6: 6 });
    expect(next.orders['1']).toEqual([5]);
  });

  it('puts an unpinned tab back on top of Today', () => {
    const session = { ...emptySession(), orders: { '1': [5] }, bindings: { p6: 6 } };
    const next = applySessionIntent(session, { type: 'unpin', itemId: 'p6', windowId: 1 });
    expect(next.bindings).toEqual({});
    expect(next.orders['1']).toEqual([6, 5]);
  });

  it('puts an unpinned tab where it was dropped in Today', () => {
    const session = { ...emptySession(), orders: { '1': [5, 7] }, bindings: { p6: 6 } };
    const intent: Intent = { type: 'unpin', itemId: 'p6', windowId: 1, todayBeforeTabId: 7 };
    expect(applySessionIntent(session, intent).orders['1']).toEqual([5, 6, 7]);
  });

  it('reorders Today and is idempotent', () => {
    const session = { ...emptySession(), orders: { '1': [5, 6, 7] } };
    const intent: Intent = { type: 'reorderToday', windowId: 1, tabId: 7, beforeTabId: 5 };
    const once = applySessionIntent(session, intent);
    expect(once.orders['1']).toEqual([7, 5, 6]);
    expect(applySessionIntent(once, intent)).toBe(once);
  });

  it('unbinds a closed pinned tab without touching Today', () => {
    const session = { ...emptySession(), orders: { '1': [5] }, bindings: { p6: 6 } };
    const next = applySessionIntent(session, { type: 'closePin', itemId: 'p6' });
    expect(next.bindings).toEqual({});
    expect(next.orders['1']).toEqual([5]);
  });
});

describe('settings, undo and archive', () => {
  it('turns Developer Mode on and off per site, once', () => {
    const on = build({ type: 'setDeveloperMode', host: 'App.Example.com', on: true });
    expect(on.settings.developerSites).toEqual(['localhost', '127.0.0.1', 'app.example.com']);
    expect(applyIntent(on, { type: 'setDeveloperMode', host: 'app.example.com', on: true })).toBe(
      on,
    );
    const off = applyIntent(on, { type: 'setDeveloperMode', host: 'localhost', on: false });
    expect(off.settings.developerSites).toEqual(['127.0.0.1', 'app.example.com']);
  });

  it('sets how long until Today tabs archive', () => {
    const model = applyIntent(emptyModel(), { type: 'setArchiveAfter', archiveAfter: '7d' });
    expect(model.settings.archiveAfter).toBe('7d');
  });

  it('restores removed items, once', () => {
    const model = build(pin('p1', 'a0'));
    const removed = model.items.p1!;
    const unpinned = applyIntent(model, { type: 'unpin', itemId: 'p1', windowId: 1 });
    const restored = applyIntent(unpinned, { type: 'restoreItems', items: [removed] });
    expect(restored.items.p1).toEqual(removed);
    expect(applyIntent(restored, { type: 'restoreItems', items: [removed] })).toBe(restored);
  });

  const entry = (id: string): ArchiveEntry => ({
    id,
    url: `https://example.com/${id}`,
    title: id,
    spaceId: 'default',
    archivedAt: 0,
    reason: 'cleared',
    batchId: 'b',
  });

  it('adds archived tabs on top, idempotently, and caps the archive', () => {
    const intent: Intent = {
      type: 'archiveTabs',
      windowId: 1,
      tabs: [{ tabId: 1, entry: entry('e1') }],
    };
    const once = applyArchiveIntent(emptyArchive(), intent);
    expect(applyArchiveIntent(once, intent)).toBe(once);
    const full = {
      rev: 0,
      entries: Array.from({ length: ARCHIVE_LIMIT }, (_, i) => entry(`old${i}`)),
    };
    const capped = applyArchiveIntent(full, intent);
    expect(capped.entries).toHaveLength(ARCHIVE_LIMIT);
    expect(capped.entries[0]!.id).toBe('e1');
  });

  it('removes restored or forgotten entries', () => {
    const archive = { rev: 0, entries: [entry('e1'), entry('e2')] };
    expect(
      applyArchiveIntent(archive, { type: 'forgetArchived', entryIds: ['e1'] }).entries,
    ).toEqual([entry('e2')]);
    expect(
      applyArchiveIntent(archive, { type: 'restoreArchived', windowId: 1, entryIds: ['e2'] })
        .entries,
    ).toEqual([entry('e1')]);
  });

  it('takes archived tabs out of Today', () => {
    const session = { ...emptySession(), orders: { '1': [1, 2, 3] } };
    const next = applySessionIntent(session, {
      type: 'archiveTabs',
      windowId: 1,
      tabs: [{ tabId: 2, entry: entry('e2') }],
    });
    expect(next.orders['1']).toEqual([1, 3]);
  });
});

describe('spaces', () => {
  const twoSpaces = (): SidebarModel => ({
    ...emptyModel(),
    spaces: [
      { id: 'home', name: 'Home' },
      { id: 'work', name: 'Work' },
    ],
  });
  const ids = (model: SidebarModel) => model.spaces.map((space) => space.id);

  it('creates a space at an index, once', () => {
    const intent: Intent = { type: 'createSpace', spaceId: 'play', name: 'Play', index: 1 };
    const once = applyIntent(twoSpaces(), intent);
    expect(ids(once)).toEqual(['home', 'play', 'work']);
    expect(applyIntent(once, intent)).toBe(once);
  });

  it('renames, sets and removes icons, and reorders', () => {
    let model = applyIntent(twoSpaces(), {
      type: 'renameSpace',
      spaceId: 'work',
      name: ' Office ',
    });
    expect(model.spaces[1]!.name).toBe('Office');
    model = applyIntent(model, {
      type: 'setSpaceIcon',
      spaceId: 'work',
      icon: { type: 'symbol', name: 'code' },
    });
    expect(model.spaces[1]!.icon).toEqual({ type: 'symbol', name: 'code' });
    model = applyIntent(model, { type: 'setSpaceIcon', spaceId: 'work', icon: null });
    expect(model.spaces[1]).not.toHaveProperty('icon');
    model = applyIntent(model, { type: 'moveSpace', spaceId: 'work', index: 0 });
    expect(ids(model)).toEqual(['work', 'home']);
  });

  it('never deletes the last space', () => {
    const one = emptyModel();
    const intent: Intent = {
      type: 'deleteSpace',
      spaceId: 'default',
      fallbackSpaceId: 'default',
      itemIds: [],
      windowId: 1,
    };
    expect(applyIntent(one, intent)).toBe(one);
  });

  it('moves a folder and its contents to another space', () => {
    let model = applyIntent(twoSpaces(), {
      type: 'createFolder',
      itemId: 'f1',
      spaceId: 'home',
      parentId: null,
      order: 'a0',
      name: 'Dev',
    });
    model = applyIntent(model, { ...pin('p1', 'a0', 'f1'), spaceId: 'home' } as Intent);
    model = applyIntent(model, { type: 'moveToSpace', itemId: 'f1', spaceId: 'work', order: 'a0' });
    expect(model.items.f1).toMatchObject({ spaceId: 'work', parentId: null });
    expect(model.items.p1).toMatchObject({ spaceId: 'work', parentId: 'f1' });
  });

  it('switches the active space and moves Today tabs between spaces', () => {
    const session = {
      ...emptySession(),
      orders: { '1': [1, 2] },
      tabSpaces: { 1: 'home', 2: 'home' },
    };
    const moved = applySessionIntent(session, {
      type: 'moveTabToSpace',
      tabId: 2,
      spaceId: 'work',
    });
    expect(moved.tabSpaces).toEqual({ 1: 'home', 2: 'work' });
    expect(moved.orders['1']).toEqual([2, 1]); // on top of the other space's Today
    const shown = applySessionIntent(moved, {
      type: 'setActiveSpace',
      windowId: 1,
      spaceId: 'work',
    });
    expect(shown.activeSpaces).toEqual({ '1': 'work' });
    expect(
      applySessionIntent(shown, { type: 'setActiveSpace', windowId: 1, spaceId: 'work' }),
    ).toBe(shown);
  });
});

describe('favorites', () => {
  const pinIn = (itemId: string, spaceId: string, order: string): Intent => ({
    type: 'pinTab',
    itemId,
    tabId: 1,
    spaceId,
    parentId: null,
    order,
    url: `https://example.com/${itemId}`,
    title: itemId,
  });

  it('takes pinned tabs, not folders', () => {
    let model = applyIntent(emptyModel(), pinIn('p1', 'default', 'a0'));
    model = applyIntent(model, {
      type: 'createFolder',
      itemId: 'f1',
      spaceId: 'default',
      parentId: null,
      order: 'a1',
      name: 'Dev',
    });
    model = applyIntent(model, {
      type: 'moveToSpace',
      itemId: 'p1',
      spaceId: FAVORITES_ID,
      order: 'a0',
    });
    expect(model.items.p1).toMatchObject({ spaceId: FAVORITES_ID, parentId: null });
    const same = applyIntent(model, {
      type: 'moveToSpace',
      itemId: 'f1',
      spaceId: FAVORITES_ID,
      order: 'a1',
    });
    expect(same).toBe(model);
  });

  it('stops at twelve, and reorders within', () => {
    let model = emptyModel();
    for (let i = 0; i < FAVORITES_LIMIT; i++) {
      model = applyIntent(
        model,
        pinIn(`f${i}`, FAVORITES_ID, `a${i < 10 ? i : String.fromCharCode(55 + i)}`),
      );
    }
    model = applyIntent(model, pinIn('extra', 'default', 'a0'));
    expect(
      applyIntent(model, {
        type: 'moveToSpace',
        itemId: 'extra',
        spaceId: FAVORITES_ID,
        order: 'b0',
      }),
    ).toBe(model);
    const moved = applyIntent(model, {
      type: 'moveToSpace',
      itemId: 'f0',
      spaceId: FAVORITES_ID,
      order: 'b0',
    });
    expect(moved.items.f0!.order).toBe('b0');
  });
});

describe('importSidebar', () => {
  const imported: Intent = {
    type: 'importSidebar',
    spaces: [{ id: 'w', name: 'Work' }],
    items: [
      {
        id: 'i1',
        kind: 'pin',
        spaceId: 'w',
        parentId: null,
        order: 'a0',
        url: 'https://a.com',
        title: 'A',
      },
      {
        id: 'i2',
        kind: 'pin',
        spaceId: 'gone',
        parentId: null,
        order: 'a0',
        url: 'https://b.com',
        title: 'B',
      },
    ],
  };

  it('adds spaces at the end and items whose space exists, once', () => {
    const model = applyIntent(emptyModel(), imported);
    expect(model.spaces.map((s) => s.id)).toEqual([S, 'w']);
    expect(Object.keys(model.items)).toEqual(['i1']);
    expect(applyIntent(model, imported)).toBe(model);
  });

  it('stops adding favorites at the limit', () => {
    const favorites = Array.from({ length: FAVORITES_LIMIT + 3 }, (_, i) => ({
      id: `f${i}`,
      kind: 'pin' as const,
      spaceId: FAVORITES_ID,
      parentId: null,
      order: `a${i}`,
      url: `https://f${i}.com`,
      title: `f${i}`,
    }));
    const model = applyIntent(emptyModel(), {
      type: 'importSidebar',
      spaces: [],
      items: favorites,
    });
    expect(Object.keys(model.items)).toHaveLength(FAVORITES_LIMIT);
  });
});

describe('placement rules (found by the torture test)', () => {
  const twoSpaces = (...intents: Intent[]) =>
    build({ type: 'createSpace', spaceId: 'w', name: 'Work', index: 1 }, ...intents);

  it('moving a folder to another space takes its contents along', () => {
    const model = applyIntent(twoSpaces(pin('p1', 'a0'), folder('f', 'a1', ['p1'])), {
      type: 'move',
      itemId: 'f',
      parentId: null,
      spaceId: 'w',
      order: 'a0',
    });
    expect(model.items.f!.spaceId).toBe('w');
    expect(model.items.p1!.spaceId).toBe('w');
  });

  it('moving into a folder puts the item in that folder’s space', () => {
    const model = applyIntent(
      twoSpaces(pin('p1', 'a0'), {
        type: 'createFolder',
        itemId: 'wf',
        spaceId: 'w',
        parentId: null,
        order: 'a0',
        name: 'Work folder',
      }),
      { type: 'move', itemId: 'p1', parentId: 'wf', order: 'a0' },
    );
    expect(model.items.p1).toMatchObject({ spaceId: 'w', parentId: 'wf' });
  });

  it('a new folder takes neither its own parent nor another space’s items', () => {
    let model = twoSpaces(folder('outer', 'a0'), pin('p1', 'a1'), {
      ...(pin('p2', 'a0') as Extract<Intent, { type: 'pinTab' }>),
      spaceId: 'w',
    });
    model = applyIntent(model, {
      type: 'createFolder',
      itemId: 'inner',
      spaceId: S,
      parentId: 'outer',
      order: 'a0',
      name: 'inner',
      childIds: ['outer', 'p1', 'p2'],
    });
    expect(model.items.outer!.parentId).toBeNull(); // no cycle
    expect(model.items.p1!.parentId).toBe('inner');
    expect(model.items.p2!.parentId).toBeNull();
  });

  it('pins only into real places: no full Favorites, no folder in another space', () => {
    let model = build(folder('f', 'a0'));
    for (let i = 0; i < FAVORITES_LIMIT + 1; i++) {
      model = applyIntent(model, {
        ...(pin(`fav${i}`, 'a0') as Extract<Intent, { type: 'pinTab' }>),
        spaceId: FAVORITES_ID,
      });
    }
    expect(childrenOf(model, FAVORITES_ID, null)).toHaveLength(FAVORITES_LIMIT);
    model = applyIntent(model, {
      ...(pin('p9', 'a0') as Extract<Intent, { type: 'pinTab' }>),
      spaceId: 'gone',
    });
    expect(model.items.p9).toBeUndefined();
  });

  it('unpinning puts the tab back in its own window’s Today', () => {
    // Tab 7 lives in window 2; the unpin comes from window 1's panel.
    let session = applySessionIntent(
      { ...emptySession(), orders: { '1': [5], '2': [7] } },
      pin('p7', 'a0'),
    );
    session = applySessionIntent(
      session,
      { type: 'unpin', itemId: 'p7', windowId: 1, spaceId: S },
      (tabId) => (tabId === 7 ? 2 : undefined),
    );
    expect(session.orders).toEqual({ '1': [5], '2': [7] });
  });
});
