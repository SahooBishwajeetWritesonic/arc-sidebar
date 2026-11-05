import { describe, expect, it } from 'vitest';
import {
  cleanShortcuts,
  DEFAULT_SHORTCUTS,
  fillLink,
  historyText,
  isValidShortcutUrl,
  keywordProblem,
  linkMatcher,
  parseKeywords,
  withScheme,
} from './shortcuts';

describe('shortcut addresses', () => {
  it('fills blanks as typed, with defaults for the ones left out', () => {
    expect(fillLink('http://localhost:{1|3000}', [])).toBe('http://localhost:3000');
    expect(fillLink('https://github.com/{1}', ['vercel/next.js'])).toBe(
      'https://github.com/vercel/next.js',
    );
    expect(fillLink('https://github.com/{1}', [])).toBeNull();
    expect(fillLink('https://example.com/', ['extra'])).toBeNull();
  });

  it('reads a page back into the words that open it', () => {
    const local = linkMatcher('http://localhost:{1|3000}');
    expect(local('http://localhost:3300/')).toEqual(['3300']);
    expect(local('http://localhost:5173/settings?tab=2')).toEqual(['5173']);
    expect(local('https://localhost:8443')).toEqual(['8443']);
    expect(local('https://localhostess.com/')).toBeNull();
    expect(local('http://example.com:3300/')).toBeNull();

    const pr = linkMatcher('https://github.com/{2|acme/app}/pull/{1}');
    expect(pr('https://www.github.com/vercel/next.js/pull/7/files')).toEqual([
      '7',
      'vercel/next.js',
    ]);
    expect(pr('https://github.com/vercel/next.js/issues/7')).toBeNull();

    expect(linkMatcher('https://{1}.vercel.app/')('https://my-app.vercel.app/')).toEqual([
      'my-app',
    ]);
    expect(linkMatcher('https://calendar.google.com/')('https://calendar.google.com/')).toBeNull();
  });

  it('looks a link’s pages up by its host', () => {
    expect(historyText('http://localhost:{1|3000}')).toBe('localhost');
    expect(historyText('https://www.github.com/{2|acme/app}/pull/{1}')).toBe('github.com');
    expect(historyText('https://{1}.vercel.app')).toBe('vercel.app');
    expect(historyText('{1}')).toBe('');
  });

  it('checks a search with a sample and a link with every blank filled', () => {
    expect(isValidShortcutUrl('https://kagi.com/search?q=%s')).toBe(true);
    expect(isValidShortcutUrl('http://localhost:{1}')).toBe(true);
    expect(isValidShortcutUrl('not an address')).toBe(false);
    expect(isValidShortcutUrl('javascript:alert(%s)')).toBe(false);
  });

  it('adds https://, or http:// for a local server', () => {
    expect(withScheme('kagi.com/search?q=%s')).toBe('https://kagi.com/search?q=%s');
    expect(withScheme('localhost:{1|3000}')).toBe('http://localhost:{1|3000}');
    expect(withScheme('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(withScheme('localhostess.com')).toBe('https://localhostess.com');
    expect(withScheme('https://x.com/search?q=%s')).toBe('https://x.com/search?q=%s');
  });

  it('reads keywords split by spaces or commas', () => {
    expect(parseKeywords(' YT, tube  yt ')).toEqual(['yt', 'tube']);
    expect(keywordProblem('y')).not.toBeNull();
    expect(keywordProblem('/x')).not.toBeNull();
    expect(keywordProblem('yt')).toBeNull();
  });
});

describe('cleanShortcuts', () => {
  it('keeps the built-in ones as they are', () => {
    expect(cleanShortcuts([...DEFAULT_SHORTCUTS])).toEqual(DEFAULT_SHORTCUTS);
  });

  it('drops what can’t work and tidies the rest', () => {
    expect(
      cleanShortcuts([
        { id: 'a', name: '  ', keywords: ['JI', 'j', '/x'], url: 'jira.example.com/{1}' },
        { id: 'b', name: 'Broken', keywords: ['br'], url: 'https://exa mple.com/' },
        { name: 'No id', keywords: ['ni'], url: 'https://example.com/' },
        { id: 'c', name: 'Kagi', keywords: ['kg'], url: 'kagi.com/search?q=%s', color: 'red' },
        'junk',
      ]),
    ).toEqual([
      { id: 'a', name: 'jira.example.com', keywords: ['ji'], url: 'https://jira.example.com/{1}' },
      { id: 'c', name: 'Kagi', keywords: ['kg'], url: 'https://kagi.com/search?q=%s' },
    ]);
  });
});
