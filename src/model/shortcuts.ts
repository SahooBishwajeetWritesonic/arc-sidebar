import type { Shortcut } from './types';

/**
 * Chrome doesn't let extensions read its search engines, so the common sites are listed here.
 * No one-letter keywords: Tab after a letter searches actions.
 */
export const DEFAULT_SHORTCUTS: readonly Shortcut[] = [
  { id: 'localhost', name: 'Localhost', keywords: ['lh'], url: 'http://localhost:{1|3000}' },
  {
    id: 'google',
    name: 'Google',
    keywords: [],
    url: 'https://www.google.com/search?q=%s',
    color: '#4285F4',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    keywords: ['yt'],
    url: 'https://www.youtube.com/results?search_query=%s',
    color: '#FF0033',
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    keywords: ['maps'],
    url: 'https://www.google.com/maps/search/%s',
    color: '#34A853',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    keywords: ['drive'],
    url: 'https://drive.google.com/drive/search?q=%s',
    color: '#1FA463',
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    keywords: ['wiki'],
    url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s',
    color: '#3366CC',
  },
  {
    id: 'github',
    name: 'GitHub',
    keywords: ['gh'],
    url: 'https://github.com/search?q=%s',
    color: '#8250DF',
  },
  {
    id: 'stack-overflow',
    name: 'Stack Overflow',
    keywords: ['so'],
    url: 'https://stackoverflow.com/search?q=%s',
    color: '#F48024',
  },
  {
    id: 'mdn',
    name: 'MDN',
    keywords: ['mdn'],
    url: 'https://developer.mozilla.org/en-US/search?q=%s',
    color: '#0069C2',
  },
  {
    id: 'npm',
    name: 'npm',
    keywords: ['npm'],
    url: 'https://www.npmjs.com/search?q=%s',
    color: '#CB3837',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    keywords: [],
    url: 'https://www.reddit.com/search/?q=%s',
    color: '#FF4500',
  },
  { id: 'x', name: 'X', keywords: ['twitter'], url: 'https://x.com/search?q=%s', color: '#1D9BF0' },
  {
    id: 'amazon',
    name: 'Amazon',
    keywords: [],
    url: 'https://www.amazon.com/s?k=%s',
    color: '#FF9900',
  },
];

export const isSiteSearch = (shortcut: Pick<Shortcut, 'url'>) => shortcut.url.includes('%s');

/** {1}, {2}…, optionally with a default: {1|3000}. */
const BLANK = /\{([1-9])(?:\|([^}]*))?\}/g;

export function blankCount(url: string): number {
  let count = 0;
  for (const [, index] of url.matchAll(BLANK)) count = Math.max(count, Number(index));
  return count;
}

export function requiredBlanks(url: string): number {
  let count = 0;
  for (const [, index, fallback] of url.matchAll(BLANK)) {
    if (fallback === undefined) count = Math.max(count, Number(index));
  }
  return count;
}

const SCHEMES = new Set(['http:', 'https:', 'file:', 'chrome:', 'about:']);

/** Null for schemes the bar mustn't open, such as javascript:. */
function openable(url: string): string | null {
  try {
    return SCHEMES.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Words go in as typed, so "3300/api" keeps its slash. Null when words are left over, a blank
 * is left empty, or the result isn't an address.
 */
export function fillLink(url: string, words: readonly string[]): string | null {
  if (words.length > blankCount(url)) return null;
  let missing = false;
  const filled = url.replace(BLANK, (_blank, index: string, fallback: string | undefined) => {
    const word = words[Number(index) - 1] ?? fallback;
    if (word === undefined) missing = true;
    return word ?? '';
  });
  return missing ? null : openable(filled);
}

export const fillSearch = (url: string, query: string) =>
  url.replaceAll('%s', encodeURIComponent(query.trim()));

export function isValidShortcutUrl(url: string): boolean {
  if (isSiteSearch({ url })) return openable(fillSearch(url, 'test')) !== null;
  const words = Array.from({ length: blankCount(url) }, (_, i) => String(i + 1));
  return fillLink(url, words) !== null;
}

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(?=[:/?#{]|$)/i;

/** Adds https://, or http:// for local servers. */
export function withScheme(url: string): string {
  const text = url.trim();
  if (!text || /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^(about|chrome):/i.test(text)) {
    return text;
  }
  return `${LOCAL.test(text) ? 'http' : 'https'}://${text}`;
}

/** Split on spaces and commas. */
export function parseKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean),
    ),
  ];
}

export function keywordProblem(keyword: string): string | null {
  if (keyword.length < 2) return 'Keywords need two letters or more.';
  if (keyword.startsWith('/')) return 'Keywords can’t start with /, which searches actions.';
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** From the editor or a backup: drops what can't work, and names unnamed ones by host. */
export function cleanShortcuts(raw: readonly unknown[]): Shortcut[] {
  const shortcuts: Shortcut[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.url !== 'string') {
      continue;
    }
    const url = withScheme(entry.url);
    if (!isValidShortcutUrl(url)) continue;
    const keywords = Array.isArray(entry.keywords)
      ? parseKeywords(entry.keywords.filter((k) => typeof k === 'string').join(' ')).filter(
          (keyword) => !keywordProblem(keyword),
        )
      : [];
    const typedName = typeof entry.name === 'string' ? entry.name.trim() : '';
    const color =
      typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)
        ? entry.color
        : undefined;
    shortcuts.push({
      id: entry.id,
      name: typedName || siteName(url),
      keywords,
      url,
      ...(color && { color }),
    });
  }
  return shortcuts;
}

function siteName(url: string): string {
  try {
    return new URL(url.replace(BLANK, '1').replaceAll('%s', 'x')).hostname.replace(/^www\./, '');
  } catch {
    return 'Shortcut';
  }
}
