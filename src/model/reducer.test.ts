import { describe, expect, it } from 'vitest';
import { applyIntent, applySessionIntent } from './reducer';
import { childrenOf, flattenSpace } from './tree';
import { emptyModel, emptySession, type Intent, type SidebarModel } from './types';

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
    const next = applySessionIntent(session, pin('p6', 'a0'), 1);
    expect(next.bindings).toEqual({ p6: 6 });
    expect(next.orders['1']).toEqual([5]);
  });

  it('puts an unpinned tab back on top of Today', () => {
    const session = { ...emptySession(), orders: { '1': [5] }, bindings: { p6: 6 } };
    const next = applySessionIntent(session, { type: 'unpin', itemId: 'p6', windowId: 1 }, 1);
    expect(next.bindings).toEqual({});
    expect(next.orders['1']).toEqual([6, 5]);
  });

  it('unbinds a closed pinned tab without touching Today', () => {
    const session = { ...emptySession(), orders: { '1': [5] }, bindings: { p6: 6 } };
    const next = applySessionIntent(session, { type: 'closePin', itemId: 'p6' }, 1);
    expect(next.bindings).toEqual({});
    expect(next.orders['1']).toEqual([5]);
  });
});
