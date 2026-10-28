import type { SpaceIcon } from '@/model/types';

/**
 * Reads Arc's ~/Library/Application Support/Arc/StorableSidebar.json, whose collections are
 * flat [id, object, id, object] arrays; each space hangs off "pinned"/"unpinned" containers.
 */

export interface ArcTab {
  kind: 'tab';
  url: string;
  title: string;
  customTitle?: string;
}

export interface ArcFolder {
  kind: 'folder';
  name: string;
  /** A live folder; its links come over as they were last fetched. */
  live: boolean;
  children: ArcNode[];
}

export type ArcNode = ArcTab | ArcFolder;

export interface ArcSpace {
  id: string;
  name: string;
  icon?: SpaceIcon;
  /** Arc profile folder ("Profile 2"); undefined for the default profile. */
  profile?: string;
  pinned: ArcNode[];
  /** Unpinned (Today) tabs, which stay in Arc. */
  todayCount: number;
}

export interface ArcSidebar {
  spaces: ArcSpace[];
  /** The default profile's Favorites. */
  favorites: ArcTab[];
  /** Notes, easels and Arc-only pages that Chrome can't open. */
  skipped: number;
}

export class NotArcSidebarError extends Error {
  constructor() {
    super("This isn't Arc's sidebar file.");
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const objects = (list: unknown): Json[] => (Array.isArray(list) ? list.filter(isObject) : []);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** [key, value] pairs of one of Arc's alternating arrays. */
function pairs(list: unknown): [unknown, unknown][] {
  if (!Array.isArray(list)) return [];
  const out: [unknown, unknown][] = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]]);
  return out;
}

/** A key that is either a plain string or Arc's `{ name: payload }` enum form. */
const caseOf = (key: unknown) =>
  typeof key === 'string' ? key : isObject(key) ? Object.keys(key)[0] : undefined;

/** Arc symbol names that have a counterpart among ours (spaces/icons.tsx). */
const ARC_SYMBOLS: Record<string, string> = {
  planet: 'planet',
  grid: 'grid',
  apps: 'grid',
  code: 'code',
  terminal: 'terminal',
  layers: 'layers',
  cloud: 'cloud',
  star: 'star',
  heart: 'heart',
  flash: 'bolt',
  book: 'book',
  leaf: 'leaf',
  music: 'music',
  camera: 'camera',
  globe: 'globe',
  rocket: 'rocket',
  flame: 'flame',
  briefcase: 'briefcase',
  house: 'house',
  home: 'house',
  palette: 'palette',
  coffee: 'coffee',
};

function iconOf(customInfo: unknown): SpaceIcon | undefined {
  const type = isObject(customInfo) && isObject(customInfo.iconType) ? customInfo.iconType : null;
  if (!type) return undefined;
  const code = type.emoji;
  const emoji =
    text(type.emoji_v2) ||
    (typeof code === 'number' && Number.isInteger(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : text(code));
  if (emoji) return { type: 'emoji', char: emoji };
  const symbol = ARC_SYMBOLS[text(type.icon).replace(/(Outline|Fill|Filled)$/, '')];
  return symbol ? { type: 'symbol', name: symbol } : undefined;
}

function profileOf(profile: unknown): string | undefined {
  if (!isObject(profile) || profile.default === true) return undefined;
  const custom = isObject(profile.custom) && isObject(profile.custom._0) ? profile.custom._0 : null;
  return text(custom?.directoryBasename) || 'another profile';
}

function tabOf(item: Json, tab: Json): ArcTab | undefined {
  const url = text(tab.savedURL);
  if (!/^(https?|file):/i.test(url)) return undefined;
  const title = text(tab.savedTitle) || url;
  const custom = text(item.title);
  return custom && custom !== title
    ? { kind: 'tab', url, title, customTitle: custom }
    : { kind: 'tab', url, title };
}

const tabsIn = (nodes: ArcNode[]): ArcTab[] =>
  nodes.flatMap((node) => (node.kind === 'tab' ? [node] : tabsIn(node.children)));

export function parseArcSidebar(json: unknown): ArcSidebar {
  const containers =
    isObject(json) && isObject(json.sidebar) ? objects(json.sidebar.containers) : [];
  // Arc has several containers (Little Arc and others); the sidebar has the most spaces.
  const container = containers
    .filter((candidate) => Array.isArray(candidate.spaces))
    .reduce<Json | undefined>(
      (best, candidate) =>
        !best || objects(candidate.spaces).length > objects(best.spaces).length ? candidate : best,
      undefined,
    );
  if (!container || !objects(container.spaces).length) throw new NotArcSidebarError();

  const items = new Map<string, Json>();
  const byParent = new Map<string, string[]>();
  for (const item of objects(container.items)) {
    if (typeof item.id !== 'string') continue;
    items.set(item.id, item);
    if (typeof item.parentID === 'string') {
      byParent.set(item.parentID, [...(byParent.get(item.parentID) ?? []), item.id]);
    }
  }

  let skipped = 0;
  const seen = new Set<string>();
  /** Children in Arc's order, then any that point at the parent but aren't listed. */
  const childIds = (item: Json): string[] => {
    const listed = Array.isArray(item.childrenIds)
      ? item.childrenIds.filter((id): id is string => typeof id === 'string')
      : [];
    const extra = (byParent.get(item.id as string) ?? []).filter((id) => !listed.includes(id));
    return [...listed, ...extra];
  };
  const walk = (id: string): ArcNode[] => {
    const item = items.get(id);
    if (!item || seen.has(id)) return [];
    seen.add(id);
    const data = isObject(item.data) ? item.data : {};
    if (isObject(data.tab)) {
      const tab = tabOf(item, data.tab);
      if (!tab) skipped++;
      return tab ? [tab] : [];
    }
    if (isObject(data.list)) {
      return [
        {
          kind: 'folder',
          name: text(item.title) || 'Untitled',
          live: 'automaticLiveFolderData' in data.list,
          children: childIds(item).flatMap(walk),
        },
      ];
    }
    // Containers, split views and other groups: their tabs, in place.
    const children = childIds(item);
    if (!children.length && !isObject(data.itemContainer)) skipped++;
    return children.flatMap(walk);
  };
  const tree = (id: string | undefined) => (id ? walk(id) : []);

  const spaces = objects(container.spaces).map((space): ArcSpace => {
    const ids: { pinned?: string; unpinned?: string } = {};
    for (const list of [space.newContainerIDs, space.containerIDs]) {
      for (const [key, id] of pairs(list)) {
        const kind = caseOf(key);
        if ((kind === 'pinned' || kind === 'unpinned') && typeof id === 'string') ids[kind] ??= id;
      }
    }
    const parsed: ArcSpace = {
      id: text(space.id),
      name: text(space.title) || 'Untitled',
      pinned: tree(ids.pinned),
      todayCount: 0,
    };
    // Today tabs aren't imported; don't count them as skipped.
    const before = skipped;
    parsed.todayCount = tabsIn(tree(ids.unpinned)).length;
    skipped = before;
    const icon = iconOf(space.customInfo);
    if (icon) parsed.icon = icon;
    const profile = profileOf(space.profile);
    if (profile) parsed.profile = profile;
    return parsed;
  });

  const topApps = pairs(container.topAppsContainerIDs);
  const favoritesId = topApps.find(([key]) => isObject(key) && key.default === true)?.[1];
  const favorites = tabsIn(tree(typeof favoritesId === 'string' ? favoritesId : undefined));

  return { spaces, favorites, skipped };
}
