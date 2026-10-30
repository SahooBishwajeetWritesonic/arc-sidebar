import { describe, expect, it } from 'vitest';
import { numberedAt } from './numbered';
import { applyIntent } from './reducer';
import { FAVORITES_ID, emptyModel, type Intent, type SidebarModel } from './types';

const S = 'default';

function build(...intents: Intent[]): SidebarModel {
  return intents.reduce((next, intent) => applyIntent(next, intent), emptyModel());
}

const pin = (itemId: string, order: string, extra: Partial<Intent> = {}): Intent =>
  ({
    type: 'pinTab',
    itemId,
    tabId: Number(itemId.replace(/\D/g, '')),
    spaceId: S,
    parentId: null,
    order,
    url: `https://example.com/${itemId}`,
    title: itemId,
    ...extra,
  }) as Intent;

describe('numberedAt', () => {
  const model = build(
    pin('f1', 'a0', { spaceId: FAVORITES_ID }),
    pin('p2', 'a0'),
    { type: 'createFolder', itemId: 'dir', spaceId: S, parentId: null, order: 'a1', name: 'Dir' },
    pin('p3', 'a0', { parentId: 'dir' }),
    { ...pin('p4', 'a2'), pair: 'p5' } as Intent,
    { ...pin('p5', 'a3'), pair: 'p4' } as Intent,
  );
  const nothingActive = () => false;
  const at = (n: number, m = model, splitOf = (_: number) => undefined as number | undefined) =>
    numberedAt(n, m, S, nothingActive, [10, 11, 12, 13], splitOf);

  it('counts Favorites, then Pinned (skipping folders, a split once), then Today', () => {
    expect([1, 2, 3, 4, 5].map((n) => at(n))).toEqual([
      { kind: 'pin', itemId: 'f1' },
      { kind: 'pin', itemId: 'p2' },
      { kind: 'pin', itemId: 'p3' },
      { kind: 'pin', itemId: 'p4' },
      { kind: 'tab', tabId: 10 },
    ]);
  });

  it('makes 9 the last, and counts a Today split once', () => {
    expect(at(8)).toEqual({ kind: 'tab', tabId: 13 });
    expect(at(9)).toEqual({ kind: 'tab', tabId: 13 });
    expect(numberedAt(9, emptyModel(), S, nothingActive, [], () => undefined)).toBeUndefined();
    const splitOf = (id: number) => (id === 11 || id === 12 ? 7 : undefined);
    expect(at(6, model, splitOf)).toEqual({ kind: 'tab', tabId: 11 });
    expect(at(7, model, splitOf)).toEqual({ kind: 'tab', tabId: 13 });
  });

  it('skips what a closed folder or collapsed Pinned hides', () => {
    const closed = applyIntent(model, {
      type: 'setFolderCollapsed',
      itemId: 'dir',
      collapsed: true,
    });
    expect(at(3, closed)).toEqual({ kind: 'pin', itemId: 'p4' });
    const folded = applyIntent(model, { type: 'setPinnedCollapsed', spaceId: S, collapsed: true });
    expect(at(2, folded)).toEqual({ kind: 'tab', tabId: 10 });
  });
});
