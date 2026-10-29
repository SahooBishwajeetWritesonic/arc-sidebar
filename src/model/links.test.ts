import { describe, expect, it } from 'vitest';
import { cleanUrl, copiedText, linksText } from './links';

describe('Copy URL', () => {
  it('drops tracking parameters and keeps the rest as it was', () => {
    expect(
      cleanUrl('https://example.com/post?id=7&utm_source=x&utm_medium=social&fbclid=abc#top'),
    ).toBe('https://example.com/post?id=7#top');
    expect(cleanUrl('https://example.com/?gclid=1')).toBe('https://example.com/');
    // Untouched addresses come back character for character.
    expect(cleanUrl('https://example.com/a?q=a+b&x=%20')).toBe('https://example.com/a?q=a+b&x=%20');
    expect(cleanUrl('chrome://settings/?utm_source=x')).toBe('chrome://settings/?utm_source=x');
    expect(cleanUrl('not a url')).toBe('not a url');
  });

  it('writes one address per line, or Markdown links', () => {
    const links = [
      { url: 'https://example.com/a?utm_campaign=z', title: 'A [draft]' },
      { url: 'https://en.wikipedia.org/wiki/Arc_(browser)', title: '' },
    ];
    expect(linksText(links)).toBe(
      'https://example.com/a\nhttps://en.wikipedia.org/wiki/Arc_(browser)',
    );
    expect(linksText(links.slice(0, 1), true)).toBe('[A \\[draft\\]](https://example.com/a)');
    expect(linksText(links, true)).toBe(
      '- [A \\[draft\\]](https://example.com/a)\n' +
        '- [https://en.wikipedia.org/wiki/Arc_(browser)](https://en.wikipedia.org/wiki/Arc_%28browser%29)',
    );
  });

  it('says what was copied', () => {
    expect(copiedText(1)).toBe('Copied URL');
    expect(copiedText(3)).toBe('Copied 3 URLs');
    expect(copiedText(1, true)).toBe('Copied URL as Markdown');
  });
});
