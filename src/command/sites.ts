import { fillLink, fillSearch, isSiteSearch } from '@/model/shortcuts';
import type { Shortcut } from '@/model/types';

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');

/** Arc's Site Search: the site whose keyword or name is what's typed, for Tab to search. */
export function siteFor(typed: string, shortcuts: readonly Shortcut[]): Shortcut | undefined {
  const text = squash(typed);
  if (text.length < 2) return undefined;
  return shortcuts.find(
    (shortcut) =>
      isSiteSearch(shortcut) &&
      (shortcut.keywords.includes(text) || squash(shortcut.name) === text),
  );
}

/** A link typed with its words ("lh 3300"). Keywords only, so "localhost" stays an address. */
export function linkFor(
  typed: string,
  shortcuts: readonly Shortcut[],
): { shortcut: Shortcut; url: string } | undefined {
  const [first = '', ...words] = typed.trim().split(/\s+/);
  const keyword = first.toLowerCase();
  if (keyword.length < 2) return undefined;
  for (const shortcut of shortcuts) {
    if (isSiteSearch(shortcut) || !shortcut.keywords.includes(keyword)) continue;
    const url = fillLink(shortcut.url, words);
    if (url) return { shortcut, url };
  }
  return undefined;
}

export const siteSearchUrl = (site: Shortcut, query: string) => fillSearch(site.url, query);
