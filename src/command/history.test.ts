import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@/platform/types';
import { frecency, historyBonus, rankHistory } from './history';

const NOW = Date.UTC(2026, 10, 6);
const DAY = 86_400_000;
const page = (url: string, title: string, visits: number, daysAgo: number, typed = 0) =>
  ({
    url,
    title,
    visitCount: visits,
    typedCount: typed,
    lastVisitTime: NOW - daysAgo * DAY,
  }) satisfies HistoryEntry;

describe('frecency', () => {
  it('counts visits, typed ones more, and fades with time', () => {
    expect(frecency(page('https://a.com/', 'A', 10, 1), NOW)).toBe(10);
    expect(frecency(page('https://a.com/', 'A', 10, 1, 5), NOW)).toBe(20);
    expect(frecency(page('https://a.com/', 'A', 10, 20), NOW)).toBe(5);
    expect(frecency(page('https://a.com/', 'A', 10, 200), NOW)).toBe(1);
  });

  it('gives at most a point and a half', () => {
    expect(historyBonus(page('https://a.com/', 'A', 0, 1), NOW)).toBe(0);
    expect(historyBonus(page('https://a.com/', 'A', 100_000, 1), NOW)).toBe(1.5);
  });
});

describe('rankHistory', () => {
  const history = [
    page('https://gist.github.com/', 'Discover gists', 3, 40),
    page('https://github.com/', 'GitHub', 120, 1, 40),
    page('https://docs.github.com/', 'GitHub Docs', 2, 60),
    page('https://example.com/', 'Unrelated', 500, 0),
  ];

  it('puts pages used often and lately first among equal matches', () => {
    expect(rankHistory(history, 'github', NOW, 5).map((entry) => entry.url)).toEqual([
      'https://github.com/',
      'https://docs.github.com/',
      'https://gist.github.com/',
    ]);
  });

  it('finds pages by letters in order, and stops at the limit', () => {
    expect(rankHistory(history, 'gthb', NOW, 1).map((entry) => entry.url)).toEqual([
      'https://github.com/',
    ]);
  });
});
