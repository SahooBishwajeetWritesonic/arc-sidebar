import { describe, expect, it } from 'vitest';
import { ranged, toggled } from './selection';

const none = { keys: [], anchor: null };
const order = ['pin:a', 'pin:b', 'tab:1', 'split:2', 'tab:4'];

describe('⌘-click', () => {
  it('selects the clicked row with the tab in front', () => {
    expect(toggled(none, 'tab:4', 'tab:1')).toEqual({ keys: ['tab:1', 'tab:4'], anchor: 'tab:4' });
    expect(toggled(none, 'tab:1', 'tab:1')).toEqual({ keys: ['tab:1'], anchor: 'tab:1' });
    expect(toggled(none, 'pin:a', null)).toEqual({ keys: ['pin:a'], anchor: 'pin:a' });
  });

  it('adds or drops one row at a time', () => {
    const two = { keys: ['tab:1', 'tab:4'], anchor: 'tab:4' };
    expect(toggled(two, 'pin:b', 'tab:1').keys).toEqual(['tab:1', 'tab:4', 'pin:b']);
    expect(toggled(two, 'tab:1', 'tab:1')).toEqual({ keys: ['tab:4'], anchor: 'tab:1' });
    expect(toggled({ keys: ['tab:4'], anchor: 'tab:4' }, 'tab:4', null)).toEqual(none);
  });
});

describe('⇧-click', () => {
  it('takes every row from the tab in front to the clicked one, either way', () => {
    expect(ranged(none, order, 'split:2', 'pin:a')).toEqual({
      keys: ['pin:a', 'pin:b', 'tab:1', 'split:2'],
      anchor: 'pin:a',
    });
    expect(ranged(none, order, 'pin:b', 'tab:4').keys).toEqual([
      'pin:b',
      'tab:1',
      'split:2',
      'tab:4',
    ]);
  });

  it('starts from the row last ⌘-clicked, and redraws the range from there', () => {
    const picked = { keys: ['tab:1', 'pin:b'], anchor: 'pin:b' };
    const first = ranged(picked, order, 'split:2', 'tab:1');
    expect(first).toEqual({ keys: ['pin:b', 'tab:1', 'split:2'], anchor: 'pin:b' });
    expect(ranged(first, order, 'pin:a', 'tab:1').keys).toEqual(['pin:a', 'pin:b']);
  });

  it('selects just the clicked row when there is nothing to start from', () => {
    expect(ranged(none, order, 'tab:1', null)).toEqual({ keys: ['tab:1'], anchor: 'tab:1' });
  });
});
