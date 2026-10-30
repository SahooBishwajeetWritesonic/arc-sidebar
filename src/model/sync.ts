import { repairModel } from './backup';
import { FAVORITES_ID, type Item, type SidebarModel, type Space } from './types';

/**
 * What Arc Sync carries: spaces (names, icons, themes, order) and their pins and folders.
 * Favorites, Live Folders, settings and Air Traffic Control stay local, as in Arc.
 */
export interface Synced {
  spaces: Space[];
  items: Record<string, Item>;
}

/** This computer's side of sync, kept in its own storage. */
export interface SyncState {
  /** What both sides held after the last sync, to tell who changed what since. */
  base: Synced | null;
  /** Why the last sync failed, if it did. */
  problem?: string;
}

const isSynced = (item: Item) => item.spaceId !== FAVORITES_ID && !item.live;

export function syncedPart(model: SidebarModel): Synced {
  return {
    spaces: model.spaces,
    items: Object.fromEntries(Object.entries(model.items).filter(([, item]) => isSynced(item))),
  };
}

/**
 * The model with its synced part replaced and repaired (pins of a removed folder move out;
 * of a removed space, go). Null if nothing would be left.
 */
export function withSynced(model: SidebarModel, part: Synced): SidebarModel | null {
  const kept = Object.entries(model.items).filter(([, item]) => !isSynced(item));
  const repaired = repairModel({
    ...model,
    spaces: part.spaces,
    items: { ...Object.fromEntries(kept), ...part.items },
  });
  return repaired && { ...repaired, rev: model.rev, settings: model.settings };
}

/** JSON with keys sorted, so two copies of the same thing compare equal. */
function stable(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

export const sameSynced = (a: unknown, b: unknown) => stable(a) === stable(b);

/**
 * Three-way merge by id: a one-sided change since `base` wins; if both changed, theirs wins,
 * but an edit beats a removal. With no base (sync just turned on), nothing is removed.
 */
export function mergeSynced(base: Synced | null, local: Synced, remote: Synced): Synced {
  function pick<T>(was: T | undefined, mine: T | undefined, theirs: T | undefined) {
    if (sameSynced(mine, theirs)) return mine;
    if (base && sameSynced(mine, was)) return theirs;
    if (base && sameSynced(theirs, was)) return mine;
    return theirs ?? mine;
  }

  const items: Record<string, Item> = {};
  const ids = new Set([...Object.keys(local.items), ...Object.keys(remote.items)]);
  for (const id of ids) {
    const item = pick(base?.items[id], local.items[id], remote.items[id]);
    if (item) items[id] = item;
  }

  const byId = (spaces: Space[]) => new Map(spaces.map((space) => [space.id, space]));
  const [was, mine, theirs] = [byId(base?.spaces ?? []), byId(local.spaces), byId(remote.spaces)];
  const order = (spaces: Space[]) => spaces.map((space) => space.id).join();
  // The side that changed the order leads; ours if both did.
  const [first, second] =
    base && order(local.spaces) === order(base.spaces)
      ? [remote.spaces, local.spaces]
      : [local.spaces, remote.spaces];
  const spaces: Space[] = [];
  for (const { id } of [...first, ...second]) {
    if (spaces.some((space) => space.id === id)) continue;
    const space = pick(was.get(id), mine.get(id), theirs.get(id));
    if (space) spaces.push(space);
  }
  return { spaces, items };
}
