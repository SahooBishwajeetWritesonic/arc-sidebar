import { generateKeyBetween } from 'fractional-indexing';
import { childrenOf } from '@/model/tree';
import type { SidebarModel } from '@/model/types';

export type DragSource =
  | { kind: 'tab'; tabId: number }
  | { kind: 'pin'; itemId: string; bound: boolean }
  | { kind: 'folder'; itemId: string };

/** A row as measured when the drag starts; the list doesn't move during a drag. */
export interface Slot {
  kind: 'tab' | 'pin' | 'folder' | 'newtab';
  id: string;
  /** Relative to the top of the sidebar. */
  top: number;
  bottom: number;
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
  | { section: 'today'; beforeTabId: number | null; lineY: number };

const HALF_GAP = 0.5;

/**
 * Arc's drop zones: a row's top or bottom half; a folder's top quarter, middle half
 * (into it) or bottom quarter.
 */
export function findTarget(
  slots: readonly Slot[],
  y: number,
  source: DragSource,
  isInsideSource: (folderId: string) => boolean,
): DropTarget | null {
  const target = locate(slots, y);
  if (!target) return null;

  if (target.section === 'today') {
    if (source.kind === 'folder' || (source.kind === 'pin' && !source.bound)) return null;
    if (source.kind === 'tab' && target.beforeTabId === source.tabId) return null;
    return target;
  }

  if (source.kind !== 'tab') {
    if (target.beforeId === source.itemId || target.afterId === source.itemId) return null;
    if (target.parentId !== null && isInsideSource(target.parentId)) return null;
  }
  return target;
}

function locate(slots: readonly Slot[], y: number): DropTarget | null {
  const newTab = slots.find((slot) => slot.kind === 'newtab');
  const pinned = slots.filter((slot) => slot.kind === 'pin' || slot.kind === 'folder');
  const today = slots.filter((slot) => slot.kind === 'tab');

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
