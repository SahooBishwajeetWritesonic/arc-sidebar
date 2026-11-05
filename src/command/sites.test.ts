import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS } from '@/model/shortcuts';
import type { Shortcut } from '@/model/types';
import type { HistoryEntry } from '@/platform/types';
import { completeLink, linkFor, linkHistoryText, linkPages, siteFor, siteSearchUrl } from './sites';

const jira: Shortcut = {
  id: 'jira',
  name: 'Jira',
  keywords: ['jira', 'ji'],
  url: 'https://acme.atlassian.net/browse/ARC-{1}',
};
const pr: Shortcut = {
  id: 'pr',
  name: 'Pull request',
  keywords: ['pr'],
  url: 'https://github.com/{2|acme/app}/pull/{1}',
};
const calendar: Shortcut = {
  id: 'cal',
  name: 'Calendar',
  keywords: ['cal'],
  url: 'https://calendar.google.com/',
};
const shortcuts = [...DEFAULT_SHORTCUTS, jira, pr, calendar];

describe('Site Search', () => {
  it('finds a site by its keyword or its name, not by one letter', () => {
    expect(siteFor('yt', shortcuts)?.name).toBe('YouTube');
    expect(siteFor(' YouTube ', shortcuts)?.name).toBe('YouTube');
    expect(siteFor('google maps', shortcuts)?.name).toBe('Google Maps');
    expect(siteFor('x', shortcuts)).toBeUndefined();
    expect(siteFor('youtu', shortcuts)).toBeUndefined();
  });

  it('leaves links to open as typed', () => {
    expect(siteFor('lh', shortcuts)).toBeUndefined();
    expect(siteFor('jira', shortcuts)).toBeUndefined();
  });

  it('puts what’s searched into the site’s search page', () => {
    expect(siteSearchUrl(siteFor('yt', shortcuts)!, ' lofi & chill ')).toBe(
      'https://www.youtube.com/results?search_query=lofi%20%26%20chill',
    );
  });
});

describe('links', () => {
  const url = (typed: string) => linkFor(typed, shortcuts)?.url;

  it('opens a local server by port, 3000 when none is typed', () => {
    expect(url('lh 3300')).toBe('http://localhost:3300');
    expect(url('LH  8080 ')).toBe('http://localhost:8080');
    expect(url('lh')).toBe('http://localhost:3000');
    expect(url('lh 3300/api/health?full=1')).toBe('http://localhost:3300/api/health?full=1');
  });

  it('fills each blank with a word typed after the keyword, by any of its keywords', () => {
    expect(url('jira 42')).toBe('https://acme.atlassian.net/browse/ARC-42');
    expect(url('ji 42')).toBe('https://acme.atlassian.net/browse/ARC-42');
    expect(url('pr 7')).toBe('https://github.com/acme/app/pull/7');
    expect(url('pr 7 vercel/next.js')).toBe('https://github.com/vercel/next.js/pull/7');
    expect(url('cal')).toBe('https://calendar.google.com/');
  });

  it('is a search when a blank is left empty or more words are typed than it takes', () => {
    expect(url('jira')).toBeUndefined();
    expect(url('cal tomorrow')).toBeUndefined();
    expect(url('lh is down again')).toBeUndefined();
  });

  it('answers to keywords only, never a name or a site search', () => {
    expect(url('localhost')).toBeUndefined();
    expect(url('calendar')).toBeUndefined();
    expect(url('yt cats')).toBeUndefined();
  });

  it('never makes an address the bar shouldn’t open', () => {
    const sneaky: Shortcut = { id: 's', name: 'S', keywords: ['js'], url: '{1}' };
    expect(linkFor('js javascript:alert(1)', [sneaky])).toBeUndefined();
  });
});

describe('a link’s pages from history', () => {
  const visit = (url: string, title: string, daysAgo: number): HistoryEntry => ({
    url,
    title,
    visitCount: 1,
    typedCount: 0,
    lastVisitTime: Date.UTC(2026, 10, 5) - daysAgo * 86_400_000,
  });
  const history = [
    visit('http://localhost:3300/settings', 'Settings · Acme', 0),
    visit('http://localhost:3300/', 'Acme dashboard', 2),
    visit('http://localhost:5173/', 'Vite + React', 1),
    visit('http://localhost:33001/', 'Another one', 5),
    visit('https://localhostess.com/', 'Not local', 0),
    visit('https://acme.atlassian.net/browse/ARC-42', 'ARC-42 Fix sign-in', 3),
  ];
  const urls = (typed: string) => linkPages(typed, shortcuts, history).map((page) => page.url);

  it('looks up the link’s host', () => {
    expect(linkHistoryText('lh 33', shortcuts)).toBe('localhost');
    expect(linkHistoryText('jira', shortcuts)).toBe('acme.atlassian.net');
    expect(linkHistoryText('yt cats', shortcuts)).toBe('');
    expect(linkHistoryText('local', shortcuts)).toBe('');
  });

  it('lists each page the link opened, most recent first, named by its own page', () => {
    expect(linkPages('lh', shortcuts, history)).toEqual([
      { url: 'http://localhost:3300', title: 'Acme dashboard', words: ['3300'] },
      { url: 'http://localhost:5173', title: 'Vite + React', words: ['5173'] },
      { url: 'http://localhost:33001', title: 'Another one', words: ['33001'] },
    ]);
    expect(urls('jira')).toEqual(['https://acme.atlassian.net/browse/ARC-42']);
  });

  it('keeps the ones that start with the word typed', () => {
    expect(urls('lh 33')).toEqual(['http://localhost:3300', 'http://localhost:33001']);
    expect(urls('lh 9')).toEqual([]);
    expect(urls('lh 3300 more')).toEqual([]);
    expect(urls('localhost')).toEqual([]);
  });

  it('completes the word typed from the most recent page, unless one has it as typed', () => {
    const pages = (typed: string) => linkPages(typed, shortcuts, history);
    expect(completeLink('lh 5', pages('lh 5'))).toEqual({
      text: 'lh 5173',
      url: 'http://localhost:5173',
    });
    expect(completeLink('LH 33', pages('LH 33'))?.text).toBe('LH 3300');
    expect(completeLink('lh 3300', pages('lh 3300'))).toBeNull();
    expect(completeLink('lh', pages('lh'))).toBeNull();
    expect(completeLink('lh 5 ', pages('lh 5 '))).toBeNull();
  });
});
