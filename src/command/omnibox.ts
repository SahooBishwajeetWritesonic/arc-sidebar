import type { Shortcut } from '@/model/types';
import type { HistoryEntry } from '@/platform/types';
import { ranked } from './match';
import { linkFor, linkPages, siteFor, siteSearchUrl } from './sites';
import { displayUrl, typedUrl } from './url';

export interface OmniboxSuggestion {
  /** The address Return opens. */
  content: string;
  /** Chrome's markup: <url>, <match> and <dim>. */
  description: string;
}

export const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "yt lofi" in one go, as the address bar has no Tab. */
function siteSearchTyped(text: string, shortcuts: readonly Shortcut[]) {
  const [first = '', ...rest] = text.trim().split(/\s+/);
  const query = rest.join(' ');
  const site = query ? siteFor(first, shortcuts) : undefined;
  return site && { site, query };
}

/** Where Return goes: an address, a link, a site search, or null to search the web. */
export function omniboxTarget(text: string, shortcuts: readonly Shortcut[]): string | null {
  const typed = text.trim();
  if (!typed) return null;
  const search = siteSearchTyped(typed, shortcuts);
  return (
    typedUrl(typed) ??
    linkFor(typed, shortcuts)?.url ??
    (search ? siteSearchUrl(search.site, search.query) : null)
  );
}

export interface OmniboxSources {
  shortcuts: readonly Shortcut[];
  tabs: readonly { url: string; title: string }[];
  history: readonly HistoryEntry[];
  linkHistory: readonly HistoryEntry[];
}

export function omniboxSuggestions(text: string, sources: OmniboxSources): OmniboxSuggestion[] {
  const query = text.trim();
  if (!query) return [];
  const { shortcuts, tabs, history, linkHistory } = sources;
  const found: OmniboxSuggestion[] = [];
  const add = (content: string, description: string) => {
    if (!found.some((each) => each.content === content)) found.push({ content, description });
  };
  const page = (url: string) => `<url>${escapeXml(displayUrl(url))}</url>`;

  const link = linkFor(query, shortcuts);
  if (link) add(link.url, `${page(link.url)} <dim>${escapeXml(link.shortcut.name)}</dim>`);
  for (const each of linkPages(query, shortcuts, linkHistory).slice(0, 4)) {
    add(each.url, `${page(each.url)} <dim>${escapeXml(each.title)}</dim>`);
  }
  const search = siteSearchTyped(query, shortcuts);
  if (search) {
    add(
      siteSearchUrl(search.site, search.query),
      `Search ${escapeXml(search.site.name)} for <match>${escapeXml(search.query)}</match>`,
    );
  }
  ranked(
    tabs.map((tab) => ({ ...tab, text: `${tab.title} ${displayUrl(tab.url)}` })),
    query,
  )
    .slice(0, 3)
    .forEach(({ item }) =>
      add(item.url, `${escapeXml(item.title)} <dim>Switch to tab</dim> ${page(item.url)}`),
    );
  for (const entry of history.slice(0, 5)) {
    add(entry.url, `${escapeXml(entry.title || displayUrl(entry.url))} ${page(entry.url)}`);
  }
  return found.slice(0, 8);
}
