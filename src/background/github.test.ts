import { describe, expect, it } from 'vitest';
import { defaultGitHubFilters } from '@/model/types';
import { ciQueries, fetchPullRequests, parseSearchPage, searchQueries, searchUrl } from './github';

/** A result as github.com/search returns it, trimmed to the fields that are read. */
const result = (number: number, extra: Record<string, unknown> = {}) => ({
  id: String(number),
  number,
  hl_title: `Change ${number}`,
  created: `2026-10-${String(number).padStart(2, '0')}T10:00:00.000Z`,
  state: 'open',
  merged: false,
  reviewable_state: 'ready',
  repo: { repository: { id: 1, name: 'app', owner_login: 'acme' } },
  ...extra,
});

const page = (results: unknown[], { signedIn = true, pageCount = 1 } = {}) => ({
  meta: { title: 'Pull request search results' },
  payload: {
    blackbirdSearchRoute: {
      results,
      page: 1,
      page_count: pageCount,
      result_count: results.length,
      logged_in: signedIn,
    },
  },
});

describe('GitHub search', () => {
  it('asks for yours and your review requests, open, newest first', () => {
    expect(searchQueries(defaultGitHubFilters())).toEqual([
      'is:pr is:open archived:false author:@me',
      'is:pr is:open archived:false assignee:@me',
      'is:pr is:open archived:false review-requested:@me',
    ]);
    expect(searchUrl('is:pr author:@me', 2)).toBe(
      'https://github.com/search?q=is%3Apr+author%3A%40me&type=pullrequests&s=created&o=desc&p=2',
    );
  });

  it('follows the filters: no drafts, created by me only; repositories come later', () => {
    expect(
      searchQueries({
        createdByMe: true,
        reviewRequests: false,
        drafts: false,
        repos: ['acme/app', 'acme/web'],
      }),
    ).toEqual([
      'is:pr is:open archived:false draft:false author:@me',
      'is:pr is:open archived:false draft:false assignee:@me',
    ]);
  });

  it('reads pull requests out of a page, as plain text', () => {
    const parsed = parseSearchPage(
      page([
        result(1, { hl_title: 'Fix <em>sidebar</em> &amp; tabs &#39;now&#39;' }),
        result(2, { reviewable_state: 'draft' }),
        result(3, { state: 'closed' }),
        { broken: true },
      ]),
    );
    expect(parsed.signedIn).toBe(true);
    expect(parsed.pullRequests).toEqual([
      {
        url: 'https://github.com/acme/app/pull/1',
        title: "Fix sidebar & tabs 'now'",
        repo: 'acme/app',
        number: 1,
        draft: false,
        created: '2026-10-01T10:00:00.000Z',
      },
      expect.objectContaining({ number: 2, draft: true }),
    ]);
  });

  it('refuses an answer that isn’t a search page', () => {
    expect(() => parseSearchPage({ payload: {} })).toThrow();
    expect(() => parseSearchPage('<html>')).toThrow();
  });

  it('merges the searches and their pages, newest first, once each', async () => {
    const asked: string[] = [];
    const answer = await fetchPullRequests(defaultGitHubFilters(), async (url) => {
      const query = new URL(url).searchParams.get('q')!;
      const at = Number(new URL(url).searchParams.get('p') ?? 1);
      if (query.includes('status:')) return page([]);
      asked.push(url);
      if (query.includes('author')) {
        return at === 1 ? page([result(5), result(3)], { pageCount: 2 }) : page([result(1)]);
      }
      if (query.includes('review-requested')) return page([result(4), result(3)]);
      return page([]);
    });
    expect(asked).toHaveLength(4);
    expect(answer).toEqual({
      signedIn: true,
      pullRequests: [5, 4, 3, 1].map((n) => expect.objectContaining({ number: n })),
    });
  });

  it('marks whose checks passed or failed, and shrugs off a failed checks search', async () => {
    const filters = defaultGitHubFilters();
    expect(ciQueries(filters).map(({ query }) => query)).toEqual([
      'is:pr is:open archived:false status:success involves:@me',
      'is:pr is:open archived:false status:success review-requested:@me',
      'is:pr is:open archived:false status:failure involves:@me',
      'is:pr is:open archived:false status:failure review-requested:@me',
    ]);
    const answer = (broken: boolean) =>
      fetchPullRequests(filters, async (url) => {
        const query = new URL(url).searchParams.get('q')!;
        if (query.includes('status:') && broken) throw new Error('busy');
        if (query.includes('status:success')) return page([result(1)]);
        if (query.includes('status:failure')) return page([result(2)]);
        return query.includes('author') ? page([result(1), result(2), result(3)]) : page([]);
      });
    const ci = async (broken: boolean) => {
      const result = await answer(broken);
      return result.signedIn ? result.pullRequests.map((pr) => [pr.number, pr.ci]) : [];
    };
    expect(await ci(false)).toEqual([
      [3, undefined],
      [2, 'failure'],
      [1, 'success'],
    ]);
    expect(await ci(true)).toEqual([
      [3, undefined],
      [2, undefined],
      [1, undefined],
    ]);
  });

  it('stops at the first sign that nobody is signed in', async () => {
    let calls = 0;
    const answer = await fetchPullRequests(defaultGitHubFilters(), async () => {
      calls++;
      return page([], { signedIn: false });
    });
    expect(answer).toEqual({ signedIn: false });
    expect(calls).toBe(1);
  });
});
