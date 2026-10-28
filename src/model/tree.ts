import { generateKeyBetween } from 'fractional-indexing';
import type { Item, SidebarModel } from './types';

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

/** A collapsed folder still shows the child open in the active tab, as Arc does. */
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
        const active = descendants(model, item.id).find(isActive);
        if (active) rows.push({ item: active, depth: depth + 1 });
      }
    }
  };
  walk(null, 0);
  return rows;
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
