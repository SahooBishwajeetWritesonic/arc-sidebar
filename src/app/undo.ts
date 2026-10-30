import type { Intent, SessionState, SidebarModel } from '@/model/types';
import { isSamePage } from '@/model/urls';
import { dispatch, useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';

/**
 * Arc's ⌘Z in the sidebar: undoes sidebar changes, latest first. A toast's
 * Undo and ⌘Z share one undo, so neither can undo a change twice.
 */
export interface Undo {
  done: boolean;
  run: () => void;
}

/** Older undos fall off the bottom. */
const LIMIT = 50;
let stack: Undo[] = [];

/** Keeps a change's undo for ⌘Z; run it from elsewhere (a toast) through what's returned. */
export function pushUndo(change: () => void): Undo {
  const undo: Undo = {
    done: false,
    run: () => {
      if (undo.done) return;
      undo.done = true;
      change();
    },
  };
  stack = [...stack.slice(1 - LIMIT), undo];
  return undo;
}

/** Undoes the latest change not undone yet; false when there's none. */
export function undoLast(): boolean {
  for (let undo = stack.pop(); undo; undo = stack.pop()) {
    if (undo.done) continue;
    undo.run();
    return true;
  }
  return false;
}

let depth = 0;

/**
 * Makes a change and keeps its undo, worked out from what the change did, whatever the drop.
 * Nested calls share the outer undo (a selection moved tab by tab).
 */
export function undoable(change: () => void) {
  const before = useSidebar.getState();
  depth++;
  try {
    change();
  } finally {
    depth--;
  }
  if (depth || before.windowId === null) return;
  const steps = inverseOf(before, useSidebar.getState(), before.windowId);
  if (steps.length) pushUndo(() => steps.forEach((step) => void dispatch(withReopened(step))));
}

/** Tabs an undo reopened, by the ids they had: Chrome gives a reopened tab a new one. */
const reopened = new Map<number, number>();
const now = (tabId: number) => {
  let id = tabId;
  for (let next = reopened.get(id); next !== undefined; next = reopened.get(id)) id = next;
  return id;
};

/** An older undo's step, acting on tabs reopened since by their new ids. */
function withReopened(step: Intent): Intent {
  switch (step.type) {
    case 'reorderToday':
      return {
        ...step,
        tabId: now(step.tabId),
        beforeTabId: step.beforeTabId === null ? null : now(step.beforeTabId),
      };
    case 'unpin':
      return typeof step.todayBeforeTabId === 'number'
        ? { ...step, todayBeforeTabId: now(step.todayBeforeTabId) }
        : step;
    case 'pinTab':
    case 'moveTabToSpace':
      return { ...step, tabId: now(step.tabId) };
    default:
      return step;
  }
}

/**
 * Undoing a close reopens the tabs: matches each new tab to the one it
 * reopens, by its page, for a few seconds.
 */
export function followReopened(closed: readonly { id: number; url: string }[]) {
  const seen = new Set(useTabs.getState().tabs.keys());
  let waiting = [...closed];
  const stop = useTabs.subscribe(({ tabs }) => {
    for (const tab of tabs.values()) {
      if (seen.has(tab.id)) continue;
      seen.add(tab.id);
      const match = waiting.find((closedTab) => isSamePage(closedTab.url, tab.url));
      if (!match) continue;
      reopened.set(match.id, tab.id);
      waiting = waiting.filter((closedTab) => closedTab !== match);
    }
    if (!waiting.length) stop();
  });
  setTimeout(stop, 5000);
}

type State = { model: SidebarModel; session: SessionState };

/**
 * The intents that take the sidebar back from `after` to `before`: items to their places,
 * pins and unpins reversed, and Today's order restored.
 */
export function inverseOf(before: State, after: State, windowId: number): Intent[] {
  const steps: Intent[] = [];
  const key = String(windowId);
  const oldToday = before.session.orders[key] ?? [];
  const nextIn = (order: readonly number[], tabId: number) =>
    order[order.indexOf(tabId) + 1] ?? null;

  for (const old of Object.values(before.model.items)) {
    const now = after.model.items[old.id];
    if (now) {
      if (now.parentId === old.parentId && now.order === old.order && now.spaceId === old.spaceId)
        continue;
      steps.push({
        type: 'move',
        itemId: old.id,
        parentId: old.parentId,
        order: old.order,
        spaceId: old.spaceId,
      });
      continue;
    }
    if (old.kind !== 'pin') continue;
    const tabId = before.session.bindings[old.id];
    const inToday = tabId !== undefined && (after.session.orders[key] ?? []).includes(tabId);
    if (!inToday) {
      steps.push({ type: 'restoreItems', items: [old] });
      continue;
    }
    // Pinned again with its tab; the tab's name comes back with it.
    steps.push({
      type: 'pinTab',
      itemId: old.id,
      tabId,
      spaceId: old.spaceId,
      parentId: old.parentId,
      order: old.order,
      url: old.url,
      title: old.title,
      ...(old.pair && { pair: old.pair }),
    });
    if (old.icon) steps.push({ type: 'setPinIcon', itemId: old.id, icon: old.icon });
  }

  for (const added of Object.values(after.model.items)) {
    if (before.model.items[added.id] || added.kind !== 'pin') continue;
    const tabId = after.session.bindings[added.id];
    // A pin with no tab (a copy left by Option-drag): unpinning removes it.
    if (tabId === undefined) {
      steps.push({ type: 'unpin', itemId: added.id, windowId });
      continue;
    }
    if (!oldToday.includes(tabId)) continue;
    steps.push({
      type: 'unpin',
      itemId: added.id,
      windowId,
      spaceId: before.session.tabSpaces[tabId],
      todayBeforeTabId: nextIn(oldToday, tabId),
    });
  }

  // Tabs moved to another space go back; then the fewest tabs that explain Today's new order
  // each go back above the tab that was below them, bottom first, so those below are in place.
  const newToday = after.session.orders[key] ?? [];
  for (const tabId of oldToday) {
    const space = before.session.tabSpaces[tabId];
    if (!space || !newToday.includes(tabId) || after.session.tabSpaces[tabId] === space) continue;
    steps.push({ type: 'moveTabToSpace', tabId, spaceId: space });
  }
  const both = new Set(newToday);
  const kept = oldToday.filter((id) => both.has(id));
  const stayed = new Set(kept);
  const keptNow = newToday.filter((id) => stayed.has(id));
  const unmoved = longestInOrder(keptNow, kept);
  for (const tabId of [...kept].reverse()) {
    if (unmoved.has(tabId)) continue;
    steps.push({ type: 'reorderToday', windowId, tabId, beforeTabId: nextIn(kept, tabId) });
  }
  return steps;
}

/** The most tabs of `now` still in their `old` order: the ones that didn't move. */
function longestInOrder(now: readonly number[], old: readonly number[]): Set<number> {
  const at = new Map(old.map((id, i) => [id, i]));
  const places = now.map((id) => at.get(id)!);
  // Longest increasing run of old places, by dynamic programming (Today is short).
  const length = places.map(() => 1);
  const previous = places.map(() => -1);
  for (let i = 0; i < places.length; i++) {
    for (let j = 0; j < i; j++) {
      if (places[j]! < places[i]! && length[j]! + 1 > length[i]!) {
        length[i] = length[j]! + 1;
        previous[i] = j;
      }
    }
  }
  const unmoved = new Set<number>();
  let i = length.indexOf(Math.max(0, ...length));
  for (; i !== -1; i = previous[i]!) unmoved.add(now[i]!);
  return unmoved;
}
