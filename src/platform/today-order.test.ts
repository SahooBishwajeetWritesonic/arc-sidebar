import { describe, expect, it } from 'vitest';
import { reconcileOrder, withTabOnTop, withTabReplaced, withoutTab } from './today-order';

describe('Today order', () => {
  it('puts a new tab on top', () => {
    expect(withTabOnTop([3, 1, 2], 7)).toEqual([7, 3, 1, 2]);
  });

  it('moves an existing tab to the top instead of duplicating it', () => {
    expect(withTabOnTop([3, 1, 2], 1)).toEqual([1, 3, 2]);
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
