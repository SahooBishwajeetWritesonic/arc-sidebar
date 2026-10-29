import { generateKeyBetween } from 'fractional-indexing';
import { childrenOf } from '@/model/tree';
import type { SidebarModel } from '@/model/types';

export type DragSource =
  | { kind: 'tab'; tabId: number }
  | { kind: 'pin'; itemId: string; bound: boolean }
  | { kind: 'favorite'; itemId: string; bound: boolean }
  | { kind: 'folder'; itemId: string }
  | { kind: 'split'; tabIds: [number, number] };

/** The Favorites grid as measured when the drag starts, relative to the sidebar's content. */
export interface FavoritesZone {
  /** Everything above this (the shown space's title) drops into Favorites. */
  bottom: number;
  cells: { id: string; left: number; right: number; top: number; bottom: number }[];
  /** Twelve already: nothing new fits. */
  full: boolean;
}

/** A row as measured when the drag starts; the list doesn't move during a drag. */
export interface Slot {
  kind: 'tab' | 'split' | 'pin' | 'folder' | 'newtab';
  /** A split row's is its first tab's. */
  id: string;
  /** Relative to the top of the sidebar. */
  top: number;
  bottom: number;
  /** Relative to the sidebar's left edge. */
  left: number;
  right: number;
  depth: number;
  parentId: string | null;
  /** Folders: expanded, so a drop at their bottom edge goes inside. */
  open: boolean;
}

export type DropTarget =
  | {
      section: 'pinned';
      parentId: string | null;
      beforeId: string | null;
      afterId: string | null;
      /** Set when dropping onto a folder row itself. */
      into?: string;
      /** Where to draw the line; null when the folder row is highlighted instead. */
      lineY: number | null;
      depth: number;
    }
  | { section: 'today'; beforeTabId: number | null; lineY: number }
  /** Onto the middle of a Today tab: the two go side by side, the dragged one on `side`. */
  | { section: 'split'; withTabId: number; side: 'left' | 'right' }
  /** Arc makes room in the grid instead of drawing a line. */
  | { section: 'favorites'; index: number; beforeId: string | null };

const HALF_GAP = 0.5;

/**
 * Arc's zones: a row's top or bottom half; a folder's top or bottom quarter, or middle half
 * (into it); a Today tab's middle half splits. `cannotHold`: folders nothing may go into.
 */
export function findTarget(
  slots: readonly Slot[],
  point: { x: number; y: number },
  source: DragSource,
  cannotHold: (folderId: string) => boolean,
  favorites?: FavoritesZone,
): DropTarget | null {
  if (favorites && point.y < favorites.bottom) return favoritesTarget(favorites, point, source);

  const target = locate(slots, point, source);
  if (!target || target.section === 'favorites' || target.section === 'split') return target;

  if (source.kind === 'split') {
    if (target.section !== 'today') return null;
    return target.beforeTabId !== null && source.tabIds.includes(target.beforeTabId)
      ? null
      : target;
  }

  if (target.section === 'today') {
    if (source.kind === 'folder') return null;
    if ((source.kind === 'pin' || source.kind === 'favorite') && !source.bound) return null;
    if (source.kind === 'tab' && target.beforeTabId === source.tabId) return null;
    return target;
  }

  if (target.parentId !== null && cannotHold(target.parentId)) return null;
  if (source.kind !== 'tab') {
    if (target.beforeId === source.itemId || target.afterId === source.itemId) return null;
  }
  return target;
}

/** The slot in the grid nearest the pointer, before or after that tile by its centre. */
function favoritesTarget(
  zone: FavoritesZone,
  point: { x: number; y: number },
  source: DragSource,
): DropTarget | null {
  if (source.kind === 'folder' || source.kind === 'split') return null;
  if (source.kind !== 'favorite' && zone.full) return null;
  const cells = zone.cells.filter(
    (cell) => source.kind !== 'favorite' || cell.id !== source.itemId,
  );
  if (!cells.length) return { section: 'favorites', index: 0, beforeId: null };

  const centre = (cell: (typeof cells)[number]) => ({
    x: (cell.left + cell.right) / 2,
    y: (cell.top + cell.bottom) / 2,
  });
  let nearest = 0;
  cells.forEach((cell, i) => {
    const a = centre(cell);
    const b = centre(cells[nearest]!);
    if (Math.hypot(point.x - a.x, point.y - a.y) < Math.hypot(point.x - b.x, point.y - b.y))
      nearest = i;
  });
  const index = point.x > centre(cells[nearest]!).x ? nearest + 1 : nearest;
  return { section: 'favorites', index, beforeId: cells[index]?.id ?? null };
}

function locate(
  slots: readonly Slot[],
  { x, y }: { x: number; y: number },
  source: DragSource,
): DropTarget | null {
  const newTab = slots.find((slot) => slot.kind === 'newtab');
  const pinned = slots.filter((slot) => slot.kind === 'pin' || slot.kind === 'folder');
  const today = slots.filter((slot) => slot.kind === 'tab' || slot.kind === 'split');

  // Today: the New Tab row and everything below it.
  if (newTab && y >= newTab.top) {
    if (y < newTab.bottom) {
      return { section: 'today', beforeTabId: firstTab(today), lineY: newTab.bottom + HALF_GAP };
    }
    const index = today.findIndex((slot) => y < slot.bottom + HALF_GAP * 2);
    if (index === -1) {
      const last = today.at(-1) ?? newTab;
      return { section: 'today', beforeTabId: null, lineY: last.bottom + HALF_GAP };
    }
    const slot = today[index]!;
    const ratio = (y - slot.top) / (slot.bottom - slot.top);
    const splittable =
      source.kind === 'tab' && slot.kind === 'tab' && slot.id !== String(source.tabId);
    if (splittable && ratio >= 0.25 && ratio < 0.75) {
      const side = x < (slot.left + slot.right) / 2 ? 'left' : 'right';
      return { section: 'split', withTabId: Number(slot.id), side };
    }
    if (y < (slot.top + slot.bottom) / 2) {
      return { section: 'today', beforeTabId: Number(slot.id), lineY: slot.top - HALF_GAP };
    }
    const next = today[index + 1];
    return {
      section: 'today',
      beforeTabId: next ? Number(next.id) : null,
      lineY: slot.bottom + HALF_GAP,
    };
  }

  // Pinned: everything above New Tab, including the divider gap.
  const index = pinned.findIndex((slot) => y < slot.bottom + HALF_GAP * 2);
  if (index === -1) {
    // Below the last pinned row (the divider area): end of the top level.
    const lastRoot = pinned.filter((slot) => slot.depth === 0).at(-1);
    const last = pinned.at(-1);
    return {
      section: 'pinned',
      parentId: null,
      beforeId: null,
      afterId: lastRoot?.id ?? null,
      lineY: last ? last.bottom + HALF_GAP : (newTab?.top ?? 0) - 13,
      depth: 0,
    };
  }

  const slot = pinned[index]!;
  const ratio = (y - slot.top) / (slot.bottom - slot.top);
  const before = {
    section: 'pinned',
    parentId: slot.parentId,
    beforeId: slot.id,
    afterId: null,
    lineY: slot.top - HALF_GAP,
    depth: slot.depth,
  } as const;
  const after = {
    section: 'pinned',
    parentId: slot.parentId,
    beforeId: null,
    afterId: slot.id,
    lineY: slot.bottom + HALF_GAP,
    depth: slot.depth,
  } as const;

  if (slot.kind === 'pin') return ratio < 0.5 ? before : after;

  if (ratio < 0.25) return before;
  if (ratio > 0.75) {
    if (!slot.open) return after;
    const child = pinned[index + 1];
    return {
      section: 'pinned',
      parentId: slot.id,
      beforeId: child?.parentId === slot.id ? child.id : null,
      afterId: null,
      lineY: slot.bottom + HALF_GAP,
      depth: slot.depth + 1,
    };
  }
  return {
    section: 'pinned',
    parentId: slot.id,
    beforeId: null,
    afterId: null,
    into: slot.id,
    lineY: null,
    depth: slot.depth + 1,
  };
}

function firstTab(today: readonly Slot[]): number | null {
  return today[0] ? Number(today[0].id) : null;
}

/** Order key among `parentId`'s children: before `beforeId`, after `afterId`, else at the end. */
export function orderForDrop(
  model: SidebarModel,
  spaceId: string,
  parentId: string | null,
  beforeId: string | null,
  afterId: string | null,
  sourceId: string | null,
): string {
  const siblings = childrenOf(model, spaceId, parentId).filter((item) => item.id !== sourceId);
  let index = siblings.length;
  if (beforeId) {
    const i = siblings.findIndex((item) => item.id === beforeId);
    if (i !== -1) index = i;
  } else if (afterId) {
    const i = siblings.findIndex((item) => item.id === afterId);
    if (i !== -1) index = i + 1;
  }
  return generateKeyBetween(siblings[index - 1]?.order ?? null, siblings[index]?.order ?? null);
}
