import { describe, expect, it } from 'vitest';
import { applyArchiveIntent, applyIntent, applySessionIntent } from './reducer';
import { childrenOf, flattenSpace } from './tree';
import {
  ARCHIVE_LIMIT,
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
