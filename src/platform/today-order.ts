/**
 * Today order rules (tab ids, top first), pure so the worker and the dev harness share them.
 * Arc puts new tabs at the top of Today, under "+ New Tab".
 */

export const todayOrderKey = (windowId: number) => `today:${windowId}`;

export function withTabOnTop(order: readonly number[], tabId: number): number[] {
  return [tabId, ...order.filter((id) => id !== tabId)];
}

/**
 * A new tab opened from a Today tab goes just below it, after others opened from it before
 * (as in Chrome's tab strip). Any other goes on top.
 */
export function withNewTab(
  order: readonly number[],
  tabId: number,
  openerTabId: number | undefined,
  openerOf: (tabId: number) => number | undefined,
): number[] {
  const rest = order.filter((id) => id !== tabId);
  const at = openerTabId === undefined ? -1 : rest.indexOf(openerTabId);
  if (at === -1) return [tabId, ...rest];
  let end = at + 1;
  while (end < rest.length && openerOf(rest[end]!) === openerTabId) end++;
  return [...rest.slice(0, end), tabId, ...rest.slice(end)];
}

/** Moves (or inserts) a tab just before another one, or to the end for null. */
export function withTabBefore(
  order: readonly number[],
  tabId: number,
  beforeTabId: number | null,
): number[] {
  const rest = order.filter((id) => id !== tabId);
  const index = beforeTabId === null ? -1 : rest.indexOf(beforeTabId);
  if (index === -1) return [...rest, tabId];
  return [...rest.slice(0, index), tabId, ...rest.slice(index)];
}

export function withoutTab(order: readonly number[], tabId: number): number[] {
  return order.filter((id) => id !== tabId);
}

export function withTabReplaced(
  order: readonly number[],
  removedTabId: number,
  addedTabId: number,
): number[] {
  return order.map((id) => (id === removedTabId ? addedTabId : id));
}

/**
 * Drops gone ids and appends unseen live tabs in strip order. Session storage is cleared on
 * restart, so Today then starts out matching the tab strip.
 */
export function reconcileOrder(
  order: readonly number[],
  liveIdsInStripOrder: readonly number[],
): number[] {
  const live = new Set(liveIdsInStripOrder);
  const kept = order.filter((id) => live.has(id));
  const known = new Set(kept);
  return [...kept, ...liveIdsInStripOrder.filter((id) => !known.has(id))];
}

export type TodayRow =
  { kind: 'tab'; id: number } | { kind: 'split'; ids: [number, number]; splitViewId: number };

/**
 * A Chrome split view's two tabs become one row (Arc's split row), where the first of them is.
 * A split whose other tab isn't in this Today (pinned, or elsewhere) shows as a plain row.
 */
export function todayRows(
  ids: readonly number[],
  splitOf: (id: number) => number | undefined,
): TodayRow[] {
  const pairs = new Map<number, number[]>();
  for (const id of ids) {
    const split = splitOf(id);
    if (split !== undefined) pairs.set(split, [...(pairs.get(split) ?? []), id]);
  }
  const rows: TodayRow[] = [];
  const placed = new Set<number>();
  for (const id of ids) {
    if (placed.has(id)) continue;
    const split = splitOf(id);
    const pair = split === undefined ? undefined : pairs.get(split);
    if (split !== undefined && pair?.length === 2) {
      rows.push({ kind: 'split', ids: [pair[0]!, pair[1]!], splitViewId: split });
      pair.forEach((tabId) => placed.add(tabId));
    } else {
      rows.push({ kind: 'tab', id });
    }
  }
  return rows;
}
