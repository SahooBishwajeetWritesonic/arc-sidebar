import { describe, expect, it } from 'vitest';
import {
  reconcileOrder,
  todayRows,
  withNewTab,
  withTabBefore,
  withTabOnTop,
  withTabReplaced,
  withoutTab,
} from './today-order';

describe('Today order', () => {
  it('puts a new tab on top', () => {
    expect(withTabOnTop([3, 1, 2], 7)).toEqual([7, 3, 1, 2]);
  });

  it('moves an existing tab to the top instead of duplicating it', () => {
    expect(withTabOnTop([3, 1, 2], 1)).toEqual([1, 3, 2]);
  });

  it('puts a link’s tab below the tab it came from, after ones opened from it before', () => {
    const openers = new Map([[8, 1]]);
    const openerOf = (id: number) => openers.get(id);
    expect(withNewTab([3, 1, 8, 2], 9, 1, openerOf)).toEqual([3, 1, 8, 9, 2]);
    expect(withNewTab([3, 1, 2], 9, 2, openerOf)).toEqual([3, 1, 2, 9]);
    // Opened from a pinned tab, or none: on top.
    expect(withNewTab([3, 1, 2], 9, 5, openerOf)).toEqual([9, 3, 1, 2]);
    expect(withNewTab([3, 1, 2], 9, undefined, openerOf)).toEqual([9, 3, 1, 2]);
  });

  it('moves a tab before another, or to the end', () => {
    expect(withTabBefore([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(withTabBefore([1, 2, 3, 4], 1, null)).toEqual([2, 3, 4, 1]);
    expect(withTabBefore([1, 2, 3], 9, 1)).toEqual([9, 1, 2, 3]);
    expect(withTabBefore([1, 2, 3], 2, 42)).toEqual([1, 3, 2]); // unknown anchor: end
  });

  it('removes a closed tab', () => {
    expect(withoutTab([3, 1, 2], 1)).toEqual([3, 2]);
  });

  it('keeps the position of a replaced tab', () => {
    expect(withTabReplaced([3, 1, 2], 1, 9)).toEqual([3, 9, 2]);
  });

  it('starts from the tab strip when nothing is stored (after a restart)', () => {
    expect(reconcileOrder([], [4, 5, 6])).toEqual([4, 5, 6]);
  });

  it('keeps the stored order, drops gone tabs, appends unseen ones in strip order', () => {
    expect(reconcileOrder([6, 99, 4], [4, 5, 6, 7])).toEqual([6, 4, 5, 7]);
  });
});

describe('todayRows', () => {
  const splits: Record<number, number> = { 2: 7, 4: 7, 5: 9 };
  const splitOf = (id: number) => splits[id];

  it('pairs a split’s two tabs into one row where the first of them is', () => {
    expect(todayRows([1, 2, 3, 4], splitOf)).toEqual([
      { kind: 'tab', id: 1 },
      { kind: 'split', ids: [2, 4], splitViewId: 7 },
      { kind: 'tab', id: 3 },
    ]);
  });

  it('shows a split tab alone when its other tab isn’t in this Today', () => {
    expect(todayRows([5, 1], splitOf)).toEqual([
      { kind: 'tab', id: 5 },
      { kind: 'tab', id: 1 },
    ]);
  });
});
