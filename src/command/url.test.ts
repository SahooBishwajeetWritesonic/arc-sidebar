import { describe, expect, it } from 'vitest';
import { displayUrl, typedUrl } from './url';

describe('typedUrl', () => {
  it.each([
    ['arc.net', 'https://arc.net'],
    ['github.com/anthropics', 'https://github.com/anthropics'],
    ['bbc.co.uk', 'https://bbc.co.uk'],
    ['readme.md', 'https://readme.md'],
    ['https://example.com/a%20b', 'https://example.com/a%20b'],
    ['http://intranet', 'http://intranet'],
    ['localhost:5199', 'http://localhost:5199'],
    ['localhost', 'http://localhost'],
    ['192.168.1.1/admin', 'http://192.168.1.1/admin'],
    ['chrome://settings', 'chrome://settings'],
    ['about:blank', 'about:blank'],
    ['my.internal:8080', 'https://my.internal:8080'],
    ['docs.internal/wiki', 'https://docs.internal/wiki'],
    ['  arc.net  ', 'https://arc.net'],
  ])('opens %s as %s', (input, url) => {
    expect(typedUrl(input)).toBe(url);
  });

  it.each([
    'node.js',
    'arc browser',
    'what is arc.net',
    'hello',
    'javascript:alert(1)',
    'mailto:me@example.com',
    'e.g',
    '',
    '   ',
  ])('searches for %j', (input) => {
    expect(typedUrl(input)).toBeNull();
  });
});

describe('displayUrl', () => {
  it('drops the scheme, www. and a bare trailing slash', () => {
    expect(displayUrl('https://www.github.com/')).toBe('github.com');
    expect(displayUrl('https://github.com/anthropics/')).toBe('github.com/anthropics/');
    expect(displayUrl('chrome://settings/')).toBe('chrome://settings/');
  });
});
