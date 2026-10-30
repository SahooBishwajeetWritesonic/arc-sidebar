import { generateKeyBetween } from 'fractional-indexing';
import { FAVORITES_ID, FAVORITES_LIMIT, type Item, type PinItem, type SidebarModel } from './types';

const byOrder = (a: Item, b: Item) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

export function childrenOf(model: SidebarModel, spaceId: string, parentId: string | null): Item[] {
  return Object.values(model.items)
    .filter((item) => item.spaceId === spaceId && item.parentId === parentId)
    .sort(byOrder);
}

/** An order key that sorts after every child of `parentId`. */
export function orderAtEnd(model: SidebarModel, spaceId: string, parentId: string | null): string {
  const last = childrenOf(model, spaceId, parentId).at(-1);
  return generateKeyBetween(last?.order ?? null, null);
}

/** An order key that takes `item`'s place, just before it. */
export function orderBefore(model: SidebarModel, item: Item): string {
  const siblings = childrenOf(model, item.spaceId, item.parentId);
  const previous = siblings[siblings.findIndex((s) => s.id === item.id) - 1];
  return generateKeyBetween(previous?.order ?? null, item.order);
}

export interface Row {
  item: Item;
  depth: number;
}

/**
 * The Pinned section as rows. A collapsed folder still shows the child open in the active
 * tab (as Arc does), and a Live Folder its new pull requests.
 */
export function flattenSpace(
  model: SidebarModel,
  spaceId: string,
  isActive: (item: Item) => boolean,
): Row[] {
  const rows: Row[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of childrenOf(model, spaceId, parentId)) {
      rows.push({ item, depth });
      if (item.kind !== 'folder') continue;
      if (!item.collapsed) {
        walk(item.id, depth + 1);
      } else {
        for (const child of descendants(model, item.id)) {
          const peeks = child.kind === 'pin' && child.live?.unseen;
          if (peeks || isActive(child)) rows.push({ item: child, depth: depth + 1 });
        }
      }
    }
  };
  walk(null, 0);
  return rows;
}

/** A row of Pinned as it shows: a pinned split's left pin carries the right one. */
export type PinnedRow = Row & { partner?: string };

/**
 * The Pinned section as it shows. With Pinned collapsed, like a closed folder, only the
 * selected pinned tab (or split) stays, at the top level.
 */
export function pinnedRows(
  model: SidebarModel,
  spaceId: string,
  isActive: (item: Item) => boolean,
): PinnedRow[] {
  const all = flattenSpace(model, spaceId, isActive);
  const collapsed = model.spaces.find((space) => space.id === spaceId)?.pinnedCollapsed;
  const shown = collapsed
    ? all
        .filter(({ item }) => {
          const partner = partnerOf(model, item);
          return item.kind === 'pin' && (isActive(item) || (partner && isActive(partner)));
        })
        .map((row) => ({ ...row, depth: 0 }))
    : all;
  return pairUp(model, shown);
}

/**
 * Each pinned split as one row: the left pin's row carries the right one. A pair split
 * up by a move shows as two pins.
 */
export function pairUp(model: SidebarModel, rows: Row[]): PinnedRow[] {
  const out: PinnedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const next = rows[i + 1];
    const partner = partnerOf(model, row.item);
    if (partner && next?.item.id === partner.id && next.depth === row.depth) {
      out.push({ ...row, partner: partner.id });
      i++;
    } else out.push(row);
  }
  return out;
}

/**
 * The pin `pin` is split with, if both name each other and sit in the same place;
 * otherwise (one unpinned or moved) they're two pins of their own.
 */
export function partnerOf(model: SidebarModel, pin: Item): PinItem | undefined {
  if (pin.kind !== 'pin' || !pin.pair) return undefined;
  const other = model.items[pin.pair];
  return other?.kind === 'pin' &&
    other.pair === pin.id &&
    other.spaceId === pin.spaceId &&
    other.parentId === pin.parentId
    ? other
    : undefined;
}

export function descendants(model: SidebarModel, folderId: string): Item[] {
  const out: Item[] = [];
  for (const child of childrenOf(model, model.items[folderId]?.spaceId ?? '', folderId)) {
    out.push(child);
    if (child.kind === 'folder') out.push(...descendants(model, child.id));
  }
  return out;
}

/** True if `ancestorId` is `itemId` or contains it. */
export function isWithin(model: SidebarModel, itemId: string, ancestorId: string): boolean {
  for (let id: string | null = itemId; id; id = model.items[id]?.parentId ?? null) {
    if (id === ancestorId) return true;
  }
  return false;
}

/**
 * Whether an item may go under `parentId` in `spaceId`: a real space, a folder not inside it,
 * or Favorites while there's room. A Live Folder holds only its own PRs, which stay in it.
 */
export function canPlace(
  model: SidebarModel,
  item: { id: string; kind: Item['kind'] },
  spaceId: string,
  parentId: string | null,
): boolean {
  const existing = model.items[item.id];
  if (existing?.kind === 'pin' && existing.live) return false;
  if (spaceId === FAVORITES_ID) {
    if (item.kind !== 'pin' || parentId !== null) return false;
    if (model.items[item.id]?.spaceId === FAVORITES_ID) return true;
    const count = Object.values(model.items).filter((i) => i.spaceId === FAVORITES_ID).length;
    return count < FAVORITES_LIMIT;
  }
  if (!model.spaces.some((space) => space.id === spaceId)) return false;
  if (parentId === null) return true;
  const parent = model.items[parentId];
  return (
    parent?.kind === 'folder' &&
    !parent.live &&
    parent.spaceId === spaceId &&
    !isWithin(model, parentId, item.id)
  );
}
