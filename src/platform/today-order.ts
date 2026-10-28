/**
 * Today order rules (tab ids, top first), pure so the worker and the dev harness share them.
 * Arc puts new tabs at the top of Today, under "+ New Tab".
 */

export const todayOrderKey = (windowId: number) => `today:${windowId}`;

export function withTabOnTop(order: readonly number[], tabId: number): number[] {
  return [tabId, ...order.filter((id) => id !== tabId)];
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
