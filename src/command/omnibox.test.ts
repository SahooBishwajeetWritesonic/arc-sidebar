import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS } from '@/model/shortcuts';
import type { HistoryEntry } from '@/platform/types';
import { omniboxSuggestions, omniboxTarget } from './omnibox';

const shortcuts = DEFAULT_SHORTCUTS;
const visit = (url: string, title: string): HistoryEntry => ({
  url,
  title,
  visitCount: 1,
  typedCount: 0,
  lastVisitTime: 0,
});

describe('omniboxTarget', () => {
  it('opens addresses, links and site searches typed in one go', () => {
    expect(omniboxTarget('arc.net', shortcuts)).toBe('https://arc.net');
    expect(omniboxTarget('lh 3300', shortcuts)).toBe('http://localhost:3300');
    expect(omniboxTarget('yt lofi beats', shortcuts)).toBe(
      'https://www.youtube.com/results?search_query=lofi%20beats',
    );
    expect(omniboxTarget('how tall is everest', shortcuts)).toBeNull();
    expect(omniboxTarget('yt', shortcuts)).toBeNull();
  });
});

describe('omniboxSuggestions', () => {
  it('lists the link, its pages, tabs and history, escaped for Chrome', () => {
    const found = omniboxSuggestions('lh', {
      shortcuts,
      tabs: [{ url: 'https://example.com/', title: 'Tom & Jerry <lh>' }],
      history: [visit('https://news.example/', 'News')],
      linkHistory: [visit('http://localhost:5173/', 'Vite + React')],
    });
    expect(found.map((each) => each.content)).toEqual([
      'http://localhost:3000',
      'http://localhost:5173',
      'https://example.com/',
      'https://news.example/',
    ]);
    expect(found[2]!.description).toBe(
      'Tom &amp; Jerry &lt;lh&gt; <dim>Switch to tab</dim> <url>example.com</url>',
    );
  });

  it('offers the site search for what follows its keyword', () => {
    const [first] = omniboxSuggestions('wiki arc browser', {
      shortcuts,
      tabs: [],
      history: [],
      linkHistory: [],
    });
    expect(first).toEqual({
      content: 'https://en.wikipedia.org/wiki/Special:Search?search=arc%20browser',
      description: 'Search Wikipedia for <match>arc browser</match>',
    });
  });
});
