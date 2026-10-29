import { generateKeyBetween } from 'fractional-indexing';
import { childrenOf } from './tree';
import type {
  FolderItem,
  GitHubFilters,
  Intent,
  LiveFolder,
  LivePin,
  PinItem,
  SidebarModel,
} from './types';

export interface PullRequest {
  url: string;
  title: string;
  /** "owner/name". */
  repo: string;
  number: number;
  draft: boolean;
  /** When it was opened (ISO). */
  created: string;
}

export type PullRequestResult =
  { signedIn: false } | { signedIn: true; pullRequests: PullRequest[] };

export type LiveFolderItem = FolderItem & { live: LiveFolder };
export type LivePinItem = PinItem & { live: LivePin };

const PULL_REQUEST = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/pull\/(\d+)(?=[/?#]|$)/i;

/**
 * Which pull request a GitHub page is part of (its Files and Commits tabs
 * too), for comparing with the folder's: GitHub ignores case in names.
 */
export function pullRequestKey(url: string): string | undefined {
  const match = PULL_REQUEST.exec(url);
  return match ? `${match[1]}/${match[2]}#${match[3]}`.toLowerCase() : undefined;
}

/** The GitHub Live Folder; Arc has at most one. */
export function githubFolderOf(model: SidebarModel): LiveFolderItem | undefined {
  return Object.values(model.items).find(
    (item): item is LiveFolderItem => item.kind === 'folder' && item.live !== undefined,
  );
}

export function livePins(model: SidebarModel, folder: FolderItem): LivePinItem[] {
  return childrenOf(model, folder.spaceId, folder.id).filter(
    (item): item is LivePinItem => item.kind === 'pin' && item.live !== undefined,
  );
}

/** Repos the filter menu offers: those with pull requests, plus the chosen ones. */
export function knownRepos(folder: LiveFolderItem): string[] {
  return sortedUnique([...(folder.live.repos ?? []), ...folder.live.filters.repos]);
}

/** The filters as a string to compare, whatever order the repositories were chosen in. */
export const filtersKey = (filters: GitHubFilters) =>
  JSON.stringify([
    filters.createdByMe,
    filters.reviewRequests,
    filters.drafts,
    [...filters.repos].sort(),
  ]);

const sortedUnique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * New PRs go in by opening time, newest on top, so existing rows never move. Signed out,
 * the folder keeps its rows so open tabs don't fall out over an expired login.
 */
export function syncIntent(
  model: SidebarModel,
  folder: LiveFolderItem,
  result: PullRequestResult,
  newId: () => string,
  windowId: number,
): Extract<Intent, { type: 'syncLiveFolder' }> | null {
  const base = {
    type: 'syncLiveFolder',
    itemId: folder.id,
    spaceId: folder.spaceId,
    windowId,
  } as const;
  if (!result.signedIn) {
    if (folder.live.signedOut) return null;
    return { ...base, items: [], removedIds: [], signedOut: true, repos: folder.live.repos ?? [] };
  }

  // GitHub is asked for every repository, so the menu can offer them all.
  const { repos: chosen } = folder.live.filters;
  const repos = sortedUnique(result.pullRequests.map((pr) => pr.repo));
  const shown = result.pullRequests.filter((pr) => !chosen.length || chosen.includes(pr.repo));
  const current = livePins(model, folder);
  const open = new Map(shown.map((pr) => [pr.url, pr]));
  const removedIds = current.filter((pin) => !open.has(pin.url)).map((pin) => pin.id);
  const kept = current.filter((pin) => open.has(pin.url));
  const byUrl = new Map(kept.map((pin) => [pin.url, pin]));

  const changed: PinItem[] = [];
  for (const pin of kept) {
    const pr = open.get(pin.url)!;
    if (pin.title === pr.title && pin.live.draft === pr.draft && pin.live.created === pr.created) {
      continue;
    }
    changed.push({
      ...pin,
      title: pr.title,
      live: { ...pin.live, draft: pr.draft, created: pr.created },
    });
  }

  // Rows top to bottom as they will be.
  const list = kept.map((pin) => ({ order: pin.order, created: pin.live.created }));
  const added: PinItem[] = [];
  const sameFilters = folder.live.filledFor === filtersKey(folder.live.filters);
  const unseen = folder.collapsed && sameFilters;
  const newest = [...shown].sort((a, b) => b.created.localeCompare(a.created));
  for (const pr of newest) {
    if (byUrl.has(pr.url)) continue;
    let at = list.findIndex((row) => row.created < pr.created);
    if (at === -1) at = list.length;
    const order = generateKeyBetween(list[at - 1]?.order ?? null, list[at]?.order ?? null);
    list.splice(at, 0, { order, created: pr.created });
    added.push({
      kind: 'pin',
      id: newId(),
      spaceId: folder.spaceId,
      parentId: folder.id,
      order,
      url: pr.url,
      title: pr.title,
      live: {
        repo: pr.repo,
        number: pr.number,
        draft: pr.draft,
        created: pr.created,
        ...(unseen && { unseen: true as const }),
      },
    });
  }

  const nothing =
    !added.length &&
    !changed.length &&
    !removedIds.length &&
    sameFilters &&
    !folder.live.signedOut &&
    (folder.live.repos ?? []).join() === repos.join();
  if (nothing) return null;
  return { ...base, items: [...added, ...changed], removedIds, signedOut: false, repos };
}
