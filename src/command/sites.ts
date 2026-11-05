import {
  blankCount,
  fillLink,
  fillSearch,
  historyText,
  isSiteSearch,
  linkMatcher,
} from '@/model/shortcuts';
import type { Shortcut } from '@/model/types';
import { isSamePage } from '@/model/urls';
import type { HistoryEntry } from '@/platform/types';

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

/** Keywords only, never names. */
function linkTyped(typed: string, shortcuts: readonly Shortcut[]) {
  const [first = '', ...words] = typed.trim().split(/\s+/);
  const keyword = first.toLowerCase();
  if (keyword.length < 2) return undefined;
  const shortcut = shortcuts.find((each) => !isSiteSearch(each) && each.keywords.includes(keyword));
  return shortcut && { shortcut, words };
}

/** A link typed with its words: "lh 3300". */
export function linkFor(
  typed: string,
  shortcuts: readonly Shortcut[],
): { shortcut: Shortcut; url: string } | undefined {
  const link = linkTyped(typed, shortcuts);
  const url = link && fillLink(link.shortcut.url, link.words);
  return url ? { shortcut: link.shortcut, url } : undefined;
}

export function linkHistoryText(typed: string, shortcuts: readonly Shortcut[]): string {
  const link = linkTyped(typed, shortcuts);
  return link ? historyText(link.shortcut.url) : '';
}

export interface LinkPage {
  url: string;
  title: string;
  words: string[];
}

/**
 * The link's pages in history, most recent first: "lh 33" lists ports starting 33. Titles come
 * from the port's own page when it was visited, not a page under it.
 */
export function linkPages(
  typed: string,
  shortcuts: readonly Shortcut[],
  history: readonly HistoryEntry[],
): LinkPage[] {
  const link = linkTyped(typed, shortcuts);
  if (!link || link.words.length > blankCount(link.shortcut.url)) return [];
  const read = linkMatcher(link.shortcut.url);
  const pages = new Map<string, LinkPage & { exact: boolean }>();
  for (const entry of [...history].sort((a, b) => b.lastVisitTime - a.lastVisitTime)) {
    const words = read(entry.url);
    if (!words || !fits(link.words, words)) continue;
    const url = fillLink(link.shortcut.url, words);
    if (!url) continue;
    const exact = isSamePage(entry.url, url);
    const page = pages.get(url);
    if (!page) pages.set(url, { url, title: entry.title, words, exact });
    else if (exact && !page.exact) Object.assign(page, { title: entry.title, exact });
  }
  return [...pages.values()].map(({ exact: _exact, ...page }) => page);
}

/** All typed words match; the last only needs to start the page's. */
function fits(typed: readonly string[], words: readonly string[]) {
  return typed.every((word, i) => {
    const page = words[i]?.toLowerCase() ?? '';
    return i === typed.length - 1
      ? page.startsWith(word.toLowerCase())
      : page === word.toLowerCase();
  });
}

/** "lh 51" completes to "lh 5173", unless a page has the word exactly as typed. */
export function completeLink(
  typed: string,
  pages: readonly LinkPage[],
): { text: string; url: string } | null {
  if (/\s$/.test(typed)) return null;
  const words = typed.trim().split(/\s+/).slice(1);
  const last = words.at(-1)?.toLowerCase();
  if (!last) return null;
  const at = words.length - 1;
  if (pages.some((page) => page.words[at]?.toLowerCase() === last)) return null;
  const page = pages.find((each) => each.words[at]!.length > last.length);
  return page ? { text: typed + page.words[at]!.slice(last.length), url: page.url } : null;
}

export const siteSearchUrl = (site: Shortcut, query: string) => fillSearch(site.url, query);
