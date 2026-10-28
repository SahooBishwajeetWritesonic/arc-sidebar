import { describe, expect, it } from 'vitest';
import type { TabInfo } from '@/platform/types';
import { applyTabEvents, selectTodayIds, type TabsState } from './tabs';

const tab = (id: number, change: Partial<TabInfo> = {}): TabInfo => ({
  id,
  windowId: 1,
  title: `Tab ${id}`,
  url: `https://example.com/${id}`,
  loading: false,
  active: false,
  audible: false,
  muted: false,
  discarded: false,
  ...change,
});

const state = (change: Partial<TabsState> = {}): TabsState => ({
  ready: true,
  windowId: 1,
  tabs: new Map([1, 2, 3].map((id) => [id, tab(id)])),
  order: [1, 2, 3],
  bound: new Set(),
  openingUrls: [],
  activeId: 1,
  previousId: null,
  ...change,
});

describe('selectTodayIds', () => {
  it('follows the worker order', () => {
    expect(selectTodayIds(state({ order: [3, 1, 2] }))).toEqual([3, 1, 2]);
  });

  it('shows tabs the worker has not ordered yet on top, newest first', () => {
    const tabs = new Map(state().tabs);
    tabs.set(4, tab(4));
    tabs.set(5, tab(5));
    expect(selectTodayIds(state({ tabs }))).toEqual([5, 4, 1, 2, 3]);
  });

  it('leaves out tabs bound to pinned items', () => {
    expect(selectTodayIds(state({ bound: new Set([2]) }))).toEqual([1, 3]);
  });

  it('hides a new tab that a pinned item is opening', () => {
    const tabs = new Map(state().tabs);
    tabs.set(4, tab(4, { url: 'https://mail.google.com/mail/u/0/#inbox' }));
    tabs.set(5, tab(5));
    const ids = selectTodayIds(state({ tabs, openingUrls: ['https://mail.google.com/mail/u/0/'] }));
    expect(ids).toEqual([5, 1, 2, 3]);
  });

  it('skips ids in the order that have no tab', () => {
    expect(selectTodayIds(state({ order: [9, 1, 2, 3] }))).toEqual([1, 2, 3]);
  });
});

describe('applyTabEvents', () => {
  it('adds and updates tabs in this window only', () => {
    const next = applyTabEvents(state(), [
      { type: 'upsert', tab: tab(4) },
      { type: 'upsert', tab: tab(2, { title: 'Renamed' }) },
      { type: 'upsert', tab: tab(8, { windowId: 2 }) },
    ]);
    expect([...next.tabs!.keys()]).toEqual([1, 2, 3, 4]);
    expect(next.tabs!.get(2)!.title).toBe('Renamed');
  });

  it('drops a tab that moved to another window', () => {
    const next = applyTabEvents(state(), [{ type: 'upsert', tab: tab(2, { windowId: 2 }) }]);
    expect(next.tabs!.has(2)).toBe(false);
  });

  it('tracks the previously active tab', () => {
    const next = applyTabEvents(state(), [{ type: 'activate', tabId: 3, windowId: 1 }]);
    expect(next.activeId).toBe(3);
    expect(next.previousId).toBe(1);
  });

  it('ignores activation in other windows', () => {
    const next = applyTabEvents(state(), [{ type: 'activate', tabId: 3, windowId: 2 }]);
    expect(next.activeId).toBe(1);
  });

  it('does not take activation from a late update', () => {
    const next = applyTabEvents(state({ activeId: 2 }), [
      { type: 'upsert', tab: tab(1, { active: true }) },
    ]);
    expect(next.activeId).toBe(2);
  });

  it('clears active and previous when those tabs close', () => {
    const next = applyTabEvents(state({ activeId: 2, previousId: 1 }), [
      { type: 'remove', tabId: 2 },
      { type: 'remove', tabId: 1 },
    ]);
    expect(next.activeId).toBeNull();
    expect(next.previousId).toBeNull();
    expect([...next.tabs!.keys()]).toEqual([3]);
  });

  it('carries a replaced tab over to its new id', () => {
    const next = applyTabEvents(state(), [{ type: 'replace', addedTabId: 7, removedTabId: 1 }]);
    expect(next.tabs!.has(1)).toBe(false);
    expect(next.tabs!.get(7)!.id).toBe(7);
    expect(next.activeId).toBe(7);
  });

  it('returns the same map when nothing changed', () => {
    const before = state();
    expect(applyTabEvents(before, [{ type: 'remove', tabId: 42 }]).tabs).toBe(before.tabs);
  });
});
