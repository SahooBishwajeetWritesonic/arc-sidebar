import { todayRows } from '@/platform/today-order';
import { childrenOf, pairUp, pinnedRows } from './tree';
import { FAVORITES_ID, type Item, type SidebarModel } from './types';

/** Where ⌘1–9 goes: a favorite or pinned tab (a split by its left pin), or a Today tab. */
export type Numbered = { kind: 'pin'; itemId: string } | { kind: 'tab'; tabId: number };

/**
 * Arc's ⌘1–9: tabs numbered as shown (Favorites, Pinned, Today), a split counting once.
 * ⌘9 is the last, as in Chrome; settings can skip Favorites or make ⌘9 the ninth.
 */
export function numberedAt(
  n: number,
  model: SidebarModel,
  spaceId: string,
  isActive: (item: Item) => boolean,
  today: readonly number[],
  splitOf: (tabId: number) => number | undefined,
): Numbered | undefined {
  const { numberFavorites, nineIsLast } = model.settings;
  const favorites = numberFavorites
    ? pairUp(
        model,
        childrenOf(model, FAVORITES_ID, null).map((item) => ({ item, depth: 0 })),
      )
    : [];
  const pins = [...favorites, ...pinnedRows(model, spaceId, isActive)].filter(
    ({ item }) => item.kind === 'pin',
  );
  const all: Numbered[] = [
    ...pins.map(({ item }): Numbered => ({ kind: 'pin', itemId: item.id })),
    ...todayRows(today, splitOf).map((row): Numbered => ({
      kind: 'tab',
      tabId: row.kind === 'tab' ? row.id : row.ids[0],
    })),
  ];
  return n === 9 && nineIsLast ? all.at(-1) : all[n - 1];
}
