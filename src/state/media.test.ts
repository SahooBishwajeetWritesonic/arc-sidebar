import { describe, expect, it } from 'vitest';
import type { TabInfo } from '@/platform/types';
import { nextPlayers } from './media';

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
const tabs = (...list: TabInfo[]) => new Map(list.map((t) => [t.id, t]));

describe('nextPlayers', () => {
  it('adds a tab when it starts playing, newest first, and keeps it while paused', () => {
    const dismissed = new Set<number>();
    let players = nextPlayers([], dismissed, tabs(tab(1, { audible: true }), tab(2)), undefined);
    expect(players).toEqual([1]);
    players = nextPlayers(players, dismissed, tabs(tab(1), tab(2, { audible: true })), undefined);
    expect(players).toEqual([2, 1]);
  });

  it('leaves muted tabs out and drops closed ones', () => {
    const dismissed = new Set<number>();
    expect(
      nextPlayers([], dismissed, tabs(tab(1, { audible: true, muted: true })), undefined),
    ).toEqual([]);
    expect(nextPlayers([1, 2], dismissed, tabs(tab(2)), undefined)).toEqual([2]);
  });

  it('keeps a dismissed player away until its tab starts playing again', () => {
    const dismissed = new Set([1]);
    const playing = tabs(tab(1, { audible: true }));
    expect(nextPlayers([], dismissed, playing, playing)).toEqual([]);
    const quiet = tabs(tab(1));
    expect(nextPlayers([], dismissed, playing, quiet)).toEqual([1]);
    expect(dismissed.has(1)).toBe(false);
  });
});
