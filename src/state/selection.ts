import { create } from 'zustand';
import { useSidebar } from './sidebar';
import { useTabs } from './tabs';

/**
 * Arc's multi-select (⌘-click toggles, ⇧-click takes a range). A row is keyed as drawn:
 * `tab:<tab id>`, `split:<first tab id>` or `pin:<item id>`.
 */
export type RowKey = string;

interface SelectionState {
  /** The selected rows, in the order they were added. */
  keys: RowKey[];
  /** Where a ⇧-click range starts: the row last ⌘-clicked. */
  anchor: RowKey | null;
}

export const useSelection = create<SelectionState>()(() => ({ keys: [], anchor: null }));

export const rowKey = (kind: string, id: string | number): RowKey => `${kind}:${id}`;

export const isSelectable = (kind: string) => kind === 'tab' || kind === 'split' || kind === 'pin';

/** ⌘-click. The first also selects the row of the tab in front, as Arc does. */
export function toggled(
  state: SelectionState,
  key: RowKey,
  activeKey: RowKey | null,
): SelectionState {
  if (!state.keys.length) {
    const keys = activeKey && activeKey !== key ? [activeKey, key] : [key];
    return { keys, anchor: key };
  }
  const keys = state.keys.includes(key)
    ? state.keys.filter((other) => other !== key)
    : [...state.keys, key];
  return { keys, anchor: keys.length ? key : null };
}

/**
 * ⇧-click: every row from the anchor (else the tab in front) to `key`, in
 * the order they're drawn. The anchor stays, so the range can be redrawn.
 */
export function ranged(
  state: SelectionState,
  order: readonly RowKey[],
  key: RowKey,
  activeKey: RowKey | null,
): SelectionState {
  const anchor = state.anchor ?? activeKey ?? key;
  const from = order.indexOf(anchor);
  const to = order.indexOf(key);
  if (from === -1 || to === -1) return { keys: [key], anchor: key };
  const [start, end] = from < to ? [from, to] : [to, from];
  return { keys: order.slice(start, end + 1), anchor };
}

export const toggleRow = (key: RowKey, activeKey: RowKey | null) =>
  useSelection.setState((state) => toggled(state, key, activeKey));

export const selectRange = (order: readonly RowKey[], key: RowKey, activeKey: RowKey | null) =>
  useSelection.setState((state) => ranged(state, order, key, activeKey));

export function clearSelection() {
  if (useSelection.getState().keys.length) useSelection.setState({ keys: [], anchor: null });
}

/** Several rows are selected: they act together. */
export const hasGroup = () => useSelection.getState().keys.length > 1;

/** The tabs a row stands for: a split's two, a pin's own while it's open. */
export function tabsOfKey(key: RowKey): number[] {
  const [kind, id = ''] = splitKey(key);
  const { tabs } = useTabs.getState();
  if (kind === 'tab') return tabs.has(Number(id)) ? [Number(id)] : [];
  if (kind === 'split') {
    const split = tabs.get(Number(id))?.splitViewId;
    if (split === undefined) return tabs.has(Number(id)) ? [Number(id)] : [];
    return [...tabs.values()].filter((tab) => tab.splitViewId === split).map((tab) => tab.id);
  }
  const tabId = useSidebar.getState().session.bindings[id];
  return tabId !== undefined && tabs.has(tabId) ? [tabId] : [];
}

export const splitKey = (key: RowKey) => {
  const at = key.indexOf(':');
  return [key.slice(0, at), key.slice(at + 1)] as const;
};

function exists(key: RowKey): boolean {
  const [kind, id] = splitKey(key);
  if (kind === 'pin') return useSidebar.getState().model.items[id]?.kind === 'pin';
  // A pinned Today tab is drawn as a pinned row now, under another name.
  const { tabs, bound } = useTabs.getState();
  return tabs.has(Number(id)) && !bound.has(Number(id));
}

// A selection belongs to its space and the tabs around it: it ends when the space changes or
// another tab comes to the front (Favorites, tab strip, keyboard), and drops rows that close.
useSidebar.subscribe((state, previous) => {
  if (state.spaceId !== previous.spaceId) clearSelection();
  else if (state.model !== previous.model) prune();
});
useTabs.subscribe((state, previous) => {
  if (state.tabs !== previous.tabs || state.bound !== previous.bound) prune();
  if (state.activeId === previous.activeId || state.activeId === null) return;
  const { keys } = useSelection.getState();
  if (keys.length && !keys.some((key) => tabsOfKey(key).includes(state.activeId!))) {
    clearSelection();
  }
});

function prune() {
  const { keys, anchor } = useSelection.getState();
  const kept = keys.filter(exists);
  if (kept.length === keys.length) return;
  useSelection.setState({ keys: kept, anchor: anchor && kept.includes(anchor) ? anchor : null });
}
