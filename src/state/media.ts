import { create } from 'zustand';
import type { MediaAction, MediaState, Platform, TabInfo } from '@/platform/types';
import { useTabs, type TabsState } from './tabs';

interface MediaStore {
  /** Tabs with a player, newest first. */
  players: number[];
  /** What each player's page last reported. */
  states: Record<number, MediaState>;
}

/** The sidebar's media players (Arc's mini player), one per tab that has played sound. */
export const useMedia = create<MediaStore>()(() => ({ players: [], states: {} }));

/**
 * A tab gets a player when it starts making sound (not while muted, as in Arc) and keeps it
 * while paused, until it closes or is dismissed; dismissed tabs get one on next playing.
 */
export function nextPlayers(
  players: readonly number[],
  dismissed: Set<number>,
  tabs: ReadonlyMap<number, TabInfo>,
  before: ReadonlyMap<number, TabInfo> | undefined,
): number[] {
  let next = players.filter((id) => tabs.has(id));
  for (const tab of tabs.values()) {
    const started = tab.audible && !before?.get(tab.id)?.audible;
    if (started) dismissed.delete(tab.id);
    if (tab.audible && !tab.muted && !next.includes(tab.id) && !dismissed.has(tab.id)) {
      next = [tab.id, ...next];
    }
  }
  for (const id of dismissed) if (!tabs.has(id)) dismissed.delete(id);
  return next;
}

let platform: Platform | undefined;
const dismissed = new Set<number>();

/** Follows the window's tabs and keeps each player's state fresh. */
export function connectMedia(source: Platform): () => void {
  platform = source;
  const sync = (state: TabsState, previous?: TabsState) => {
    const { players } = useMedia.getState();
    const next = nextPlayers(players, dismissed, state.tabs, previous?.tabs);
    if (next.join() !== players.join()) {
      useMedia.setState((media) => ({
        players: next,
        states: Object.fromEntries(
          Object.entries(media.states).filter(([id]) => next.includes(Number(id))),
        ),
      }));
    }
    // Ask the page again when it starts or stops, or the track (title) changes.
    for (const id of next) {
      const tab = state.tabs.get(id);
      const was = previous?.tabs.get(id);
      const isNew = !players.includes(id);
      if (tab && (isNew || tab.audible !== was?.audible || tab.title !== was?.title)) refresh(id);
    }
  };
  sync(useTabs.getState());
  return useTabs.subscribe(sync);
}

function refresh(tabId: number) {
  void platform?.mediaState(tabId).then((state) => {
    if (!state || !useMedia.getState().players.includes(tabId)) return;
    useMedia.setState((media) => ({ states: { ...media.states, [tabId]: state } }));
  });
}

/** Playing, as the page last said, or as Chrome hears it until the page answers. */
export function isPlaying(tabId: number): boolean {
  return (
    useMedia.getState().states[tabId]?.playing ??
    useTabs.getState().tabs.get(tabId)?.audible ??
    false
  );
}

export function playPause(tabId: number) {
  const playing = isPlaying(tabId);
  // The button flips at once; the page confirms a moment later.
  useMedia.setState((media) => ({
    states: {
      ...media.states,
      [tabId]: { actions: [], ...media.states[tabId], playing: !playing },
    },
  }));
  void command(tabId, playing ? 'pause' : 'play');
}

export function skip(tabId: number, action: 'nexttrack' | 'previoustrack') {
  void command(tabId, action);
}

async function command(tabId: number, action: MediaAction) {
  await platform?.mediaCommand(tabId, action);
  setTimeout(() => refresh(tabId), 300);
}

/** Arc's × on a player: gone until the tab next starts playing. */
export function dismissPlayer(tabId: number) {
  dismissed.add(tabId);
  useMedia.setState((media) => ({ players: media.players.filter((id) => id !== tabId) }));
}
