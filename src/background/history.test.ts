import { describe, expect, it, vi } from 'vitest';
import type { HistoryEntry } from '@/platform/types';
import { HistoryIndex, type HistorySource } from './history';

const NOW = Date.UTC(2026, 10, 6);
const page = (url: string, title: string, visits = 1, typed = 0): HistoryEntry => ({
  url,
  title,
  visitCount: visits,
  typedCount: typed,
  lastVisitTime: NOW - 86_400_000,
});

function setup(recent: HistoryEntry[], older: HistoryEntry[] = []) {
  let finish: (list: HistoryEntry[]) => void = () => {};
  const source = {
    recent: vi.fn(() => new Promise<HistoryEntry[]>((resolve) => (finish = resolve))),
    search: vi.fn(async (text: string) =>
      older.filter((entry) => entry.title.toLowerCase().includes(text.toLowerCase())),
    ),
  } satisfies HistorySource;
  const index = new HistoryIndex(source, () => NOW);
  return { index, source, load: () => finish(recent) };
}

const urls = (entries: HistoryEntry[]) => entries.map((entry) => entry.url);

describe('HistoryIndex', () => {
  it('loads recent history once and searches it fuzzily', async () => {
    const { index, source, load } = setup([
      page('https://github.com/', 'GitHub', 50),
      page('https://example.com/', 'Example'),
    ]);
    const first = index.search('gthb', 5);
    load();
    expect(urls(await first)).toEqual(['https://github.com/']);
    expect(urls(await index.search('exmpl', 5))).toEqual(['https://example.com/']);
    expect(source.recent).toHaveBeenCalledTimes(1);
  });

  it('adds older pages only Chrome’s own search finds', async () => {
    const { index, load } = setup(
      [page('https://github.com/', 'GitHub')],
      [page('https://github.blog/2019', 'GitHub blog')],
    );
    const found = index.search('github', 5);
    load();
    expect(urls(await found).sort()).toEqual(['https://github.blog/2019', 'https://github.com/']);
  });

  it('keeps up with visits and removals, including ones while it loads', async () => {
    const { index, load } = setup([page('https://a.example/', 'Alpha')]);
    const loading = index.search('alpha', 5);
    index.visited(page('https://b.example/', 'Alpha two'));
    load();
    expect(urls(await loading)).toEqual(['https://a.example/', 'https://b.example/']);

    index.removed(['https://a.example/']);
    expect(urls(await index.search('alpha', 5))).toEqual(['https://b.example/']);
    index.removed('all');
    expect(await index.search('alpha', 5)).toEqual([]);
  });

  it('gives addresses typed before when nothing is typed', async () => {
    const { index, load } = setup([
      page('https://news.ycombinator.com/', 'Hacker News', 90, 25),
      page('https://github.com/', 'GitHub', 120, 40),
      page('https://clicked.example/', 'Clicked to'),
    ]);
    const typed = index.search('', 10);
    load();
    expect(urls(await typed)).toEqual(['https://github.com/', 'https://news.ycombinator.com/']);
  });
});
