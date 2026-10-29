import type { CiState, PullRequest, PullRequestResult } from '@/model/live';
import type { GitHubFilters } from '@/model/types';

/**
 * Open pull requests from github.com's own search, read with the browser's login as Arc did,
 * so there's no token. github.com answers a search with JSON when asked for it.
 */

/** Pages of ten read per search; more open pull requests than that is rare. */
const MAX_PAGES = 3;

/**
 * One search per kind: GitHub's search can't OR qualifiers together. The repository filter
 * is applied afterwards, so the menu can list them all.
 */
export function searchQueries(filters: GitHubFilters): string[] {
  const common = ['is:pr', 'is:open', 'archived:false'];
  if (!filters.drafts) common.push('draft:false');
  const who = [
    ...(filters.createdByMe ? ['author:@me', 'assignee:@me'] : []),
    // Includes requests to your teams, as Arc's folder did.
    ...(filters.reviewRequests ? ['review-requested:@me'] : []),
  ];
  return who.map((qualifier) => [...common, qualifier].join(' '));
}

/**
 * Search results don't carry checks, but search can filter by them, so one search per state.
 * `involves` covers authored and assigned.
 */
export function ciQueries(filters: GitHubFilters): { query: string; state: CiState }[] {
  const who = [
    ...(filters.createdByMe ? ['involves:@me'] : []),
    ...(filters.reviewRequests ? ['review-requested:@me'] : []),
  ];
  const states: CiState[] = ['success', 'failure'];
  return states.flatMap((state) =>
    who.map((qualifier) => ({
      query: `is:pr is:open archived:false status:${state} ${qualifier}`,
      state,
    })),
  );
}

export function searchUrl(query: string, page = 1): string {
  const params = new URLSearchParams({ q: query, type: 'pullrequests', s: 'created', o: 'desc' });
  if (page > 1) params.set('p', String(page));
  return `https://github.com/search?${params}`;
}

export class UnexpectedResponseError extends Error {}

export function parseSearchPage(json: unknown): {
  signedIn: boolean;
  pageCount: number;
  pullRequests: PullRequest[];
} {
  const route = field(field(json, 'payload'), 'blackbirdSearchRoute');
  const results = field(route, 'results');
  if (!Array.isArray(results)) throw new UnexpectedResponseError('No search results in the answer');
  const pullRequests: PullRequest[] = [];
  for (const result of results) {
    const repository = field(field(result, 'repo'), 'repository');
    const owner = field(repository, 'owner_login');
    const name = field(repository, 'name');
    const number = field(result, 'number');
    const title = field(result, 'hl_title');
    const created = field(result, 'created');
    if (typeof owner !== 'string' || typeof name !== 'string' || typeof number !== 'number') {
      continue;
    }
    if (field(result, 'state') !== 'open' || field(result, 'merged') === true) continue;
    pullRequests.push({
      url: `https://github.com/${owner}/${name}/pull/${number}`,
      title: typeof title === 'string' ? plainText(title) : `#${number}`,
      repo: `${owner}/${name}`,
      number,
      draft: field(result, 'reviewable_state') === 'draft',
      created: typeof created === 'string' ? created : '',
    });
  }
  const pageCount = field(route, 'page_count');
  return {
    signedIn: field(route, 'logged_in') === true,
    pageCount: typeof pageCount === 'number' ? pageCount : 1,
    pullRequests,
  };
}

/** Throws when GitHub can't be reached or answers oddly; the folder keeps what it has. */
export async function fetchPullRequests(
  filters: GitHubFilters,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<PullRequestResult> {
  const found = new Map<string, PullRequest>();
  for (const query of searchQueries(filters)) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = parseSearchPage(await fetchJson(searchUrl(query, page)));
      if (!result.signedIn) return { signedIn: false };
      for (const pr of result.pullRequests) found.set(pr.url, pr);
      if (page >= result.pageCount) break;
    }
  }
  const states = await ciStates(filters, fetchJson).catch(() => new Map<string, CiState>());
  const pullRequests = [...found.values()]
    .map((pr) => {
      const ci = states.get(pr.url);
      return ci ? { ...pr, ci } : pr;
    })
    .sort((a, b) => b.created.localeCompare(a.created));
  return { signedIn: true, pullRequests };
}

/** Pages read per checks search; a few more than the folder usually holds. */
const CI_PAGES = 2;

async function ciStates(
  filters: GitHubFilters,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<Map<string, CiState>> {
  const states = new Map<string, CiState>();
  for (const { query, state } of ciQueries(filters)) {
    for (let page = 1; page <= CI_PAGES; page++) {
      const result = parseSearchPage(await fetchJson(searchUrl(query, page)));
      for (const pr of result.pullRequests) states.set(pr.url, state);
      if (page >= result.pageCount) break;
    }
  }
  return states;
}

export async function fetchGitHubJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new UnexpectedResponseError(`GitHub answered ${response.status}`);
  return response.json();
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Search titles are HTML (matches come wrapped in <em>). */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
      const point =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .trim();
}
