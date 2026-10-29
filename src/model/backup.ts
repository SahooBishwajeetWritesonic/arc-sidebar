import { generateKeyBetween } from 'fractional-indexing';
import {
  ARCHIVE_AFTER_MS,
  defaultSettings,
  FAVORITES_ID,
  FAVORITES_LIMIT,
  type GitHubFilters,
  type Harmony,
  type Item,
  type LiveFolder,
  type LivePin,
  type Settings,
  type SidebarModel,
  type Space,
  type SpaceIcon,
  type SpaceTheme,
} from './types';

/**
 * Exported files and backups: a saved sidebar is checked, and repaired where
 * it can be, before it replaces the current one.
 */

export interface ExportFile {
  app: 'arc-sidebar';
  format: 1;
  exportedAt: string;
  model: SidebarModel;
}

export const toExportFile = (model: SidebarModel, now: Date): ExportFile => ({
  app: 'arc-sidebar',
  format: 1,
  exportedAt: now.toISOString(),
  model,
});

export class NotSidebarExportError extends Error {}

export function parseExportFile(json: unknown): SidebarModel {
  if (!isRecord(json) || json.app !== 'arc-sidebar' || json.format !== 1) {
    throw new NotSidebarExportError();
  }
  const model = repairModel(json.model);
  if (!model) throw new NotSidebarExportError();
  return model;
}

/** Whether two models hold the same sidebar, whatever their revisions. */
export const sameSidebar = (a: SidebarModel, b: SidebarModel) =>
  isEqual({ ...a, rev: 0 }, { ...b, rev: 0 });

/**
 * A sound copy of a saved model, or null if it holds no sidebar. Drops items in missing
 * spaces and Favorites past the limit; broken parents move items to the top level.
 */
export function repairModel(raw: unknown): SidebarModel | null {
  if (!isRecord(raw) || !Array.isArray(raw.spaces) || !isRecord(raw.items)) return null;

  const spaces: Space[] = [];
  for (const space of raw.spaces) {
    if (!isRecord(space) || !isString(space.id) || !isString(space.name)) continue;
    if (space.id === FAVORITES_ID || spaces.some((s) => s.id === space.id)) continue;
    const icon = repairIcon(space.icon);
    const theme = repairTheme(space.theme);
    spaces.push({ id: space.id, name: space.name, ...(icon && { icon }), ...(theme && { theme }) });
  }
  if (!spaces.length) return null;

  const placeable = new Set([FAVORITES_ID, ...spaces.map((space) => space.id)]);
  const items: Record<string, Item> = {};
  for (const [id, value] of Object.entries(raw.items)) {
    const item = repairItem(id, value);
    if (!item || !placeable.has(item.spaceId)) continue;
    if (item.spaceId === FAVORITES_ID && item.kind !== 'pin') continue;
    items[id] = item;
  }

  // A parent must be a folder in the same space; Favorites have no folders.
  for (const item of Object.values(items)) {
    const parent = item.parentId === null ? undefined : items[item.parentId];
    if (item.parentId !== null && (parent?.kind !== 'folder' || parent.spaceId !== item.spaceId)) {
      item.parentId = null;
    }
  }
  // A folder inside itself: cut the link that closes the loop.
  for (const item of Object.values(items)) {
    const seen = new Set([item.id]);
    for (let at = item; at.parentId !== null; at = items[at.parentId]!) {
      if (seen.has(at.parentId)) {
        at.parentId = null;
        break;
      }
      seen.add(at.parentId);
    }
  }

  const favorites = Object.values(items)
    .filter((item) => item.spaceId === FAVORITES_ID)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  for (const extra of favorites.slice(FAVORITES_LIMIT)) delete items[extra.id];

  // Order keys the sidebar can't put new items between are made again, at the end.
  const last = new Map<string, string | null>();
  const broken: Item[] = [];
  for (const item of Object.values(items)) {
    if (!isOrderKey(item.order)) {
      broken.push(item);
      continue;
    }
    const key = `${item.spaceId}/${item.parentId}`;
    const latest = last.get(key);
    if (!latest || item.order > latest) last.set(key, item.order);
  }
  for (const item of broken) {
    const key = `${item.spaceId}/${item.parentId}`;
    item.order = generateKeyBetween(last.get(key) ?? null, null);
    last.set(key, item.order);
  }

  return {
    rev: typeof raw.rev === 'number' ? raw.rev : 0,
    spaces,
    items,
    settings: repairSettings(raw.settings),
  };
}

const HARMONIES: Harmony[] = [
  'single',
  'analogous',
  'complementary',
  'splitComplementary',
  'triadic',
  'free',
];

function repairItem(id: string, raw: unknown): Item | undefined {
  if (!isRecord(raw) || raw.id !== id || !isString(raw.spaceId) || !isString(raw.order)) return;
  const parentId = isString(raw.parentId) ? raw.parentId : null;
  const base = { id, spaceId: raw.spaceId, parentId, order: raw.order };
  if (raw.kind === 'pin' && isString(raw.url) && isString(raw.title)) {
    const live = repairLivePin(raw.live);
    return {
      ...base,
      kind: 'pin',
      url: raw.url,
      title: raw.title,
      ...(isString(raw.customTitle) && { customTitle: raw.customTitle }),
      ...(live && { live }),
    };
  }
  if (raw.kind === 'folder' && isString(raw.name)) {
    const icon = repairIcon(raw.icon);
    const live = repairLiveFolder(raw.live);
    return {
      ...base,
      kind: 'folder',
      name: raw.name,
      collapsed: raw.collapsed === true,
      ...(icon && { icon }),
      ...(live && { live }),
    };
  }
}

function repairLiveFolder(raw: unknown): LiveFolder | undefined {
  if (!isRecord(raw) || raw.source !== 'github' || !isRecord(raw.filters)) return;
  const { createdByMe, reviewRequests, drafts, repos } = raw.filters;
  const filters: GitHubFilters = {
    createdByMe: createdByMe !== false,
    reviewRequests: reviewRequests !== false,
    drafts: drafts !== false,
    repos: Array.isArray(repos)
      ? repos.filter((repo): repo is string => isString(repo) && /^[\w.-]+\/[\w.-]+$/.test(repo))
      : [],
  };
  const seen = Array.isArray(raw.repos) ? raw.repos.filter(isString) : undefined;
  return {
    source: 'github',
    filters,
    ...(isString(raw.filledFor) && { filledFor: raw.filledFor }),
    ...(seen && { repos: seen }),
  };
}

function repairLivePin(raw: unknown): LivePin | undefined {
  if (!isRecord(raw) || !isString(raw.repo) || !isString(raw.created)) return;
  if (typeof raw.number !== 'number') return;
  const ci = raw.ci === 'success' || raw.ci === 'failure' ? raw.ci : undefined;
  return {
    repo: raw.repo,
    number: raw.number,
    draft: raw.draft === true,
    created: raw.created,
    ...(ci && { ci }),
  };
}

function repairIcon(raw: unknown): SpaceIcon | undefined {
  if (!isRecord(raw)) return;
  if (raw.type === 'emoji' && isString(raw.char)) return { type: 'emoji', char: raw.char };
  if (raw.type === 'symbol' && isString(raw.name)) return { type: 'symbol', name: raw.name };
}

function repairTheme(raw: unknown): SpaceTheme | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.colors)) return;
  const colors = raw.colors.filter((c): c is string => isString(c) && /^#[0-9a-f]{6}$/i.test(c));
  if (!colors.length) return;
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  return {
    colors: colors.slice(0, 3),
    harmony: HARMONIES.includes(raw.harmony as Harmony) ? (raw.harmony as Harmony) : 'free',
    intensity: number(raw.intensity, 0.25, 0.8, 0.5),
    grain: number(raw.grain, 0, 1, 0),
  };
}

function repairSettings(raw: unknown): Settings {
  const settings = defaultSettings();
  if (!isRecord(raw)) return settings;
  if (isString(raw.archiveAfter) && raw.archiveAfter in ARCHIVE_AFTER_MS) {
    settings.archiveAfter = raw.archiveAfter as Settings['archiveAfter'];
  }
  if (raw.appearance === 'auto' || raw.appearance === 'light' || raw.appearance === 'dark') {
    settings.appearance = raw.appearance;
  }
  if (raw.githubFolder === false) settings.githubFolder = false;
  if (Array.isArray(raw.developerSites))
    settings.developerSites = raw.developerSites.filter(isString);
  return settings;
}

function isOrderKey(order: string) {
  try {
    generateKeyBetween(order, null);
    return true;
  } catch {
    return false;
  }
}

/** Deep equality for JSON-like values; key order and undefined fields don't count. */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const entries = (value: object) =>
    Object.entries(value).filter(([, field]) => field !== undefined);
  const left = entries(a);
  const right = new Map(entries(b));
  return left.length === right.size && left.every(([key, field]) => isEqual(field, right.get(key)));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';
