import { describe, expect, it } from 'vitest';
import { applyIntent } from '@/model/reducer';
import { childrenOf } from '@/model/tree';
import { emptyModel, type Intent } from '@/model/types';
import { findTarget, orderForDrop, ordersForDrop, type DragSource, type Slot } from './targets';

// Rows are 40 tall with a 1 pt gap, as in Arc's compact layout.
const row = (kind: Slot['kind'], id: string, index: number, extra: Partial<Slot> = {}): Slot => ({
  kind,
  id,
  top: index * 41,
  bottom: index * 41 + 40,
  left: 8,
  right: 352,
  depth: 0,
  parentId: null,
  open: false,
  ...extra,
});

// Pinned: p1, folder f1 (open) with c1, then the divider, New Tab, Today: 11, 12.
const slots: Slot[] = [
  row('pin', 'p1', 0),
  row('folder', 'f1', 1, { open: true }),
  row('pin', 'c1', 2, { depth: 1, parentId: 'f1' }),
  { ...row('newtab', 'newtab', 3), top: 149, bottom: 189 },
  { ...row('tab', '11', 4), top: 190, bottom: 230 },
  { ...row('tab', '12', 5), top: 231, bottom: 271 },
];

const tab: DragSource = { kind: 'tab', tabId: 12 };
const nothingInside = () => false;

describe('findTarget', () => {
  it('drops before or after a pinned tab by half', () => {
    expect(findTarget(slots, { x: 100, y: 5 }, tab, nothingInside)).toMatchObject({
      section: 'pinned',
      parentId: null,
      beforeId: 'p1',
    });
    expect(findTarget(slots, { x: 100, y: 35 }, tab, nothingInside)).toMatchObject({
      afterId: 'p1',
    });
  });

  it('drops into a folder from its middle, highlighting it instead of drawing a line', () => {
    expect(findTarget(slots, { x: 100, y: 61 }, tab, nothingInside)).toMatchObject({
      parentId: 'f1',
      into: 'f1',
      lineY: null,
    });
  });

  it('drops nothing into a Live Folder: not onto it, nor among its pull requests', () => {
    const live = (folderId: string) => folderId === 'f1';
    expect(findTarget(slots, { x: 100, y: 61 }, tab, live)).toBeNull();
    expect(findTarget(slots, { x: 100, y: 79 }, tab, live)).toBeNull();
    expect(findTarget(slots, { x: 100, y: 95 }, tab, live)).toBeNull();
    // Above it is still fine.
    expect(findTarget(slots, { x: 100, y: 44 }, tab, live)).toMatchObject({ beforeId: 'f1' });
  });

  it('drops at the start of an open folder from its bottom quarter', () => {
    expect(findTarget(slots, { x: 100, y: 79 }, tab, nothingInside)).toMatchObject({
      parentId: 'f1',
      beforeId: 'c1',
      depth: 1,
    });
  });

  it('drops at the end of the top level from the divider gap', () => {
    expect(findTarget(slots, { x: 100, y: 140 }, tab, nothingInside)).toMatchObject({
      section: 'pinned',
      parentId: null,
      afterId: 'f1',
      depth: 0,
    });
  });

  it('drops at the top of Today from the New Tab row', () => {
    expect(
      findTarget(slots, { x: 100, y: 160 }, { kind: 'tab', tabId: 99 }, nothingInside),
    ).toEqual({
      section: 'today',
      beforeTabId: 11,
      lineY: 189.5,
    });
  });

  it('drops between Today tabs and at the end', () => {
    const pin: DragSource = { kind: 'pin', itemId: 'p1', bound: true };
    expect(findTarget(slots, { x: 100, y: 220 }, pin, nothingInside)).toMatchObject({
      beforeTabId: 12,
    });
    expect(findTarget(slots, { x: 100, y: 400 }, pin, nothingInside)).toMatchObject({
      beforeTabId: null,
    });
  });

  it('keeps folders and closed pinned tabs out of Today', () => {
    expect(
      findTarget(slots, { x: 100, y: 220 }, { kind: 'folder', itemId: 'f1' }, nothingInside),
    ).toBeNull();
    expect(
      findTarget(
        slots,
        { x: 100, y: 220 },
        { kind: 'pin', itemId: 'p1', bound: false },
        nothingInside,
      ),
    ).toBeNull();
  });

  it('refuses to drop a folder inside itself', () => {
    const folder: DragSource = { kind: 'folder', itemId: 'f1' };
    expect(findTarget(slots, { x: 100, y: 61 }, folder, (id) => id === 'f1')).toBeNull();
  });

  it('splits a Today tab from its middle half, its left or right half choosing the side', () => {
    const other: DragSource = { kind: 'tab', tabId: 99 };
    expect(findTarget(slots, { x: 100, y: 205 }, other, nothingInside)).toEqual({
      section: 'split',
      withTabId: 11,
      side: 'left',
    });
    expect(findTarget(slots, { x: 300, y: 205 }, other, nothingInside)).toMatchObject({
      side: 'right',
    });
    // Its top and bottom quarters still reorder.
    expect(findTarget(slots, { x: 100, y: 193 }, other, nothingInside)).toMatchObject({
      section: 'today',
      beforeTabId: 11,
    });
    // Not with itself, and not from a pinned tab.
    expect(findTarget(slots, { x: 100, y: 246 }, tab, nothingInside)?.section).not.toBe('split');
    const pin: DragSource = { kind: 'pin', itemId: 'p1', bound: true };
    expect(findTarget(slots, { x: 100, y: 205 }, pin, nothingInside)?.section).toBe('today');
  });

  it('moves a split row within Today, or into Pinned, and never onto another tab', () => {
    const split: DragSource = { kind: 'split', tabIds: [12, 13] };
    // Tab 11's middle reorders by half instead of splitting.
    expect(findTarget(slots, { x: 100, y: 205 }, split, nothingInside)).toMatchObject({
      section: 'today',
      beforeTabId: 11,
    });
    expect(findTarget(slots, { x: 100, y: 225 }, split, nothingInside)).toBeNull(); // beside itself
    // Into Pinned, where it's pinned as a split; never into a Live Folder.
    expect(findTarget(slots, { x: 100, y: 5 }, split, nothingInside)).toMatchObject({
      section: 'pinned',
      beforeId: 'p1',
    });
    expect(findTarget(slots, { x: 100, y: 61 }, split, (id) => id === 'f1')).toBeNull();
  });

  it('moves a selection together into Pinned or Today, but not into Favorites or a split', () => {
    const many: DragSource = {
      kind: 'many',
      itemIds: ['p1'],
      tabIds: [11],
      bound: true,
      pinnable: true,
    };
    const zone = { bottom: -20, cells: [], full: false };
    expect(findTarget(slots, { x: 100, y: 5 }, many, nothingInside, zone)).toMatchObject({
      section: 'pinned',
      beforeId: 'p1',
    });
    expect(findTarget(slots, { x: 100, y: 205 }, many, nothingInside)).toMatchObject({
      section: 'today',
      beforeTabId: 11,
    });
    // The middle of a Today tab, which would split a single tab with it.
    expect(findTarget(slots, { x: 100, y: 250 }, many, nothingInside)).toMatchObject({
      section: 'today',
    });
    expect(findTarget(slots, { x: 100, y: -30 }, many, nothingInside, zone)).toBeNull();
  });

  it('keeps a selection out of Today if a pinned tab in it is closed, and out of Pinned with a split', () => {
    const closed: DragSource = {
      kind: 'many',
      itemIds: ['p1'],
      tabIds: [11],
      bound: false,
      pinnable: true,
    };
    expect(findTarget(slots, { x: 100, y: 205 }, closed, nothingInside)).toBeNull();
    const split: DragSource = { ...closed, bound: true, pinnable: false };
    expect(findTarget(slots, { x: 100, y: 5 }, split, nothingInside)).toBeNull();
    expect(findTarget(slots, { x: 100, y: 205 }, split, nothingInside)).not.toBeNull();
    const intoLive = findTarget(
      slots,
      { x: 100, y: 61 },
      { ...closed, bound: true },
      (id) => id === 'f1',
    );
    expect(intoLive).toBeNull();
  });

  it('treats a drop next to the dragged item as no move', () => {
    expect(findTarget(slots, { x: 100, y: 220 }, tab, nothingInside)).toBeNull(); // 12 is the tab
    expect(
      findTarget(
        slots,
        { x: 100, y: 35 },
        { kind: 'pin', itemId: 'p1', bound: true },
        nothingInside,
      ),
    ).toBeNull();
  });
});

describe('orderForDrop', () => {
  const pin = (itemId: string, order: string): Intent => ({
    type: 'pinTab',
    itemId,
    tabId: 1,
    spaceId: 'default',
    parentId: null,
    order,
    url: `https://example.com/${itemId}`,
    title: itemId,
  });
  const model = [pin('a', 'a0'), pin('b', 'a1'), pin('c', 'a2')].reduce(
    (next, intent) => applyIntent(next, intent),
    emptyModel(),
  );
  const place = (order: string, id = 'x') =>
    childrenOf(
      applyIntent(model, { type: 'move', itemId: id, parentId: null, order }),
      'default',
      null,
    )
      .map((item) => item.id)
      .join('');

  it('places before, after or at the end', () => {
    const withX = applyIntent(model, pin('x', 'a3'));
    const reorder = (beforeId: string | null, afterId: string | null) =>
      childrenOf(
        applyIntent(withX, {
          type: 'move',
          itemId: 'x',
          parentId: null,
          order: orderForDrop(withX, 'default', null, beforeId, afterId, 'x'),
        }),
        'default',
        null,
      )
        .map((item) => item.id)
        .join('');
    expect(reorder('a', null)).toBe('xabc');
    expect(reorder(null, 'a')).toBe('axbc');
    expect(reorder(null, null)).toBe('abcx');
  });

  it('ignores the dragged item when it is one of the siblings', () => {
    expect(place(orderForDrop(model, 'default', null, null, 'c', 'a'), 'a')).toBe('bca');
  });

  it('gives several dropped together keys in a row, fitting between the ones staying', () => {
    const withX = applyIntent(model, pin('x', 'a3'));
    const drop = (beforeId: string | null, afterId: string | null, moving: string[]) => {
      const orders = ordersForDrop(withX, 'default', null, beforeId, afterId, moving, 2);
      const moved = moving.reduce(
        (next, itemId, i) =>
          applyIntent(next, { type: 'move', itemId, parentId: null, order: orders[i]! }),
        withX,
      );
      return childrenOf(moved, 'default', null)
        .map((item) => item.id)
        .join('');
    };
    expect(drop('b', null, ['x', 'a'])).toBe('xabc');
    expect(drop(null, 'c', ['a', 'x'])).toBe('bcax');
    // Dropped just after one of themselves: they close up where they were.
    expect(drop(null, 'a', ['a', 'c'])).toBe('acbx');
  });
});

describe('findTarget in Favorites', () => {
  // Two tiles side by side above the space's title (which starts at 60).
  const zone = {
    bottom: 60,
    full: false,
    cells: [
      { id: 'f1', left: 8, right: 168, top: 8, bottom: 55 },
      { id: 'f2', left: 176, right: 336, top: 8, bottom: 55 },
    ],
  };
  const tab: DragSource = { kind: 'tab', tabId: 11 };
  const none = () => false;

  it('drops before or after the nearest tile by its centre', () => {
    expect(findTarget(slots, { x: 40, y: 30 }, tab, none, zone)).toEqual({
      section: 'favorites',
      index: 0,
      beforeId: 'f1',
    });
    expect(findTarget(slots, { x: 300, y: 30 }, tab, none, zone)).toEqual({
      section: 'favorites',
      index: 2,
      beforeId: null,
    });
  });

  it('rearranges a favorite among the others', () => {
    const favorite: DragSource = { kind: 'favorite', itemId: 'f1', bound: true };
    expect(findTarget(slots, { x: 300, y: 30 }, favorite, none, zone)).toMatchObject({ index: 1 });
  });

  it('refuses folders, and anything new when full', () => {
    expect(
      findTarget(slots, { x: 40, y: 30 }, { kind: 'folder', itemId: 'x' }, none, zone),
    ).toBeNull();
    expect(findTarget(slots, { x: 40, y: 30 }, tab, none, { ...zone, full: true })).toBeNull();
  });

  it('opens the first slot of an empty grid', () => {
    expect(findTarget(slots, { x: 40, y: 4 }, tab, none, { ...zone, cells: [] })).toEqual({
      section: 'favorites',
      index: 0,
      beforeId: null,
    });
  });

  it('lets a loaded favorite go back to Today', () => {
    const favorite: DragSource = { kind: 'favorite', itemId: 'f1', bound: true };
    expect(findTarget(slots, { x: 100, y: 220 }, favorite, none, zone)).toMatchObject({
      section: 'today',
    });
  });
});
