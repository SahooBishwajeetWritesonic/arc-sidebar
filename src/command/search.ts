import { FAVORITES_ID } from '@/model/types';
import { hostname, isSamePage } from '@/model/urls';
import { availableActions, type CommandContext } from './actions';
import type { HistoryEntry } from '@/platform/types';
import { siteSearchUrl, type Site } from './sites';
import type { Result } from './types';
import { displayUrl, typedUrl } from './url';

const LIMIT = { pages: 6, actions: 5, history: 5, suggestions: 5 };

/**
 * How well `query` matches `text`: 0 when some word of the query is missing,
 * otherwise more for words found at the start of the text or of a word.
 */
export function score(text: string, query: string): number {
  const haystack = text.toLowerCase();
  let total = 0;
  for (const word of query.toLowerCase().split(/\s+/)) {
    if (!word) continue;
    const at = haystack.indexOf(word);
    if (at === -1) return 0;
    if (at === 0) total += 4;
    else if (!/[\p{L}\p{N}]/u.test(haystack[at - 1]!)) total += 3;
    else {
      // A later match at a word start beats this one inside a word.
      const start = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}`, 'u').test(haystack);
      total += start ? 3 : 1;
    }
  }
  return total;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every word found at the start of a word: good enough to come before "Search". */
const isStrong = (points: number, query: string) =>
  points >= 3 * query.split(/\s+/).filter(Boolean).length;

/** Matching items, best first; ties go to `tieBreak`, else the shorter text. */
function ranked<T extends { text: string }>(
  items: T[],
  query: string,
  tieBreak: (a: T, b: T) => number = (a, b) => a.text.length - b.text.length,
) {
  return items
    .map((item) => ({ item, points: score(item.text, query) }))
    .filter(({ points }) => points > 0)
    .sort((a, b) => b.points - a.points || tieBreak(a.item, b.item));
}

interface Page extends Result {
  text: string;
  tabId?: number;
}

/** Open tabs and pinned items (open or not) in this window, except the current tab. */
function pages(ctx: CommandContext): Page[] {
  const { model, session, tabs, spaceId } = ctx;
  const spaceName = (id: string | undefined) =>
    id === FAVORITES_ID
      ? 'Favorites'
      : id && id !== spaceId
        ? model.spaces.find((space) => space.id === id)?.name
        : undefined;
  const list: Page[] = [];
  const bound = new Set<number>();

  for (const item of Object.values(model.items)) {
    if (item.kind !== 'pin') continue;
    if (!model.spaces.some((space) => space.id === item.spaceId) && item.spaceId !== FAVORITES_ID)
      continue;
    const tabId = session.bindings[item.id];
    const tab = tabId === undefined ? undefined : tabs.get(tabId);
    if (tab) bound.add(tab.id);
    if (tab && tab.id === ctx.activeId) continue;
    const title = item.customTitle ?? tab?.title ?? item.title;
    const url = tab?.url ?? item.url;
    list.push({
      key: `pin:${item.id}`,
      command: tab ? { type: 'switchToTab', tabId: tab.id } : { type: 'openPin', itemId: item.id },
      title,
      detail: spaceName(item.spaceId),
      url,
      hint: tab ? 'Switch to Tab' : 'Open',
      text: `${title} ${item.title} ${displayUrl(url)}`,
      tabId: tab?.id,
    });
  }

  for (const tab of tabs.values()) {
    if (bound.has(tab.id) || tab.id === ctx.activeId) continue;
    const title = session.tabTitles[tab.id] ?? tab.title;
    list.push({
      key: `tab:${tab.id}`,
      command: { type: 'switchToTab', tabId: tab.id },
      title,
      detail: spaceName(session.tabSpaces[tab.id]),
      url: tab.url,
      hint: 'Switch to Tab',
      text: `${title} ${tab.title} ${displayUrl(tab.url)}`,
      tabId: tab.id,
    });
  }
  return list;
}

/** With nothing typed: the tab you were just on, then this space's other tabs. */
function suggestions(ctx: CommandContext): Result[] {
  const byTab = new Map<number, Page>();
  for (const page of pages(ctx)) {
    if (page.tabId !== undefined) byTab.set(page.tabId, page);
  }
  const ids = [ctx.previousId, ...ctx.todayIds].filter((id): id is number => id !== null);
  const pinned = [...byTab.values()].filter(
    (page) => page.key.startsWith('pin:') && page.detail === undefined,
  );
  const picked = new Set<Page>();
  for (const page of [...ids.map((id) => byTab.get(id)), ...pinned]) {
    if (page && !page.detail) picked.add(page);
  }
  return [...picked].slice(0, LIMIT.suggestions).map(strip);
}

const strip = ({ text: _text, tabId: _tabId, ...result }: Page): Result => result;

/**
 * Completes typed text from previously typed addresses, as Chrome does ("gi" → "github.com").
 * Whole hosts only, or whole addresses once a "/" is typed.
 */
export function completeAddress(
  typed: string,
  history: readonly HistoryEntry[],
): { text: string; url: string } | null {
  const prefix = typed.trim().toLowerCase();
  if (!prefix || /\s/.test(prefix) || /^[a-z]+:\/?\/?$/.test(prefix)) return null;
  const typedPath = prefix.includes('/');
  let best: { text: string; url: string; typedCount: number } | null = null;

  for (const entry of history) {
    if (entry.typedCount < 1 || !/^https?:/.test(entry.url)) continue;
    let text = displayUrl(entry.url);
    let url = entry.url;
    if (!typedPath) {
      const host = hostname(entry.url);
      text = host;
      url = `${new URL(entry.url).origin}/`;
    }
    if (!text.toLowerCase().startsWith(prefix) || text.length === prefix.length) continue;
    const better =
      !best ||
      entry.typedCount > best.typedCount ||
      (entry.typedCount === best.typedCount && text.length < best.text.length);
    if (better) best = { text, url, typedCount: entry.typedCount };
  }
  return best && { text: best.text, url: best.url };
}

export interface SearchOptions {
  /** Only actions (after Tab, or a leading "/"). */
  actionsOnly?: boolean;
  /** Picking the tab or address to split the current tab with. */
  pickSplit?: boolean;
  /** The address the input is completing to, which becomes the first row. */
  completion?: { text: string; url: string } | null;
  /** The site being searched (after its keyword and Tab). */
  site?: Site | null;
}

/**
 * The rows for what's typed, in Arc's order: the address to open, open tabs
 * that match well, the web search, spaces, actions, other tabs, then history.
 */
export function searchCommands(
  query: string,
  ctx: CommandContext,
  history: readonly HistoryEntry[],
  { actionsOnly = false, pickSplit = false, completion = null, site = null }: SearchOptions = {},
): Result[] {
  const text = query.trim();
  if (pickSplit) return splitChoices(text, ctx, history);
  if (site) {
    if (!text) return [];
    const url = siteSearchUrl(site, text);
    return [
      { key: 'site-search', command: { type: 'openUrl', url }, title: text, url, hint: 'Search' },
    ];
  }
  const actions = availableActions(ctx);
  const plain = ({ words: _words, ...result }: Result & { words: string }): Result => result;

  if (actionsOnly) {
    if (!text) return actions.map(plain);
    return ranked(
      actions.map((a) => ({ ...a, text: `${a.title} ${a.words}` })),
      text,
    ).map(({ item: { text: _text, ...a } }) => plain(a));
  }
  if (!text) return suggestions(ctx);

  const results: Result[] = [];
  const add = (result: Result) => {
    if (!results.some((other) => other.key === result.key)) results.push(result);
  };

  const url = completion?.url ?? typedUrl(text);
  const matches = ranked(pages(ctx), text);
  // A tab already showing the typed address: switch to it rather than open it twice.
  const already = url ? matches.find(({ item }) => item.url && isSamePage(item.url, url)) : null;
  if (already) add(strip(already.item));
  if (url) {
    add({
      key: 'open-url',
      command: { type: 'openUrl', url },
      title: completion ? completion.text : displayUrl(url),
      url,
      hint: 'Open',
    });
  }
  const spaces = ranked(
    ctx.model.spaces
      .filter((space) => space.id !== ctx.spaceId)
      .map((space) => ({ ...space, text: `${space.name} space` })),
    text,
  ).map(({ item: space, points }) => ({
    points,
    result: {
      key: `space:${space.id}`,
      command: { type: 'switchSpace', spaceId: space.id },
      title: space.name,
      hint: 'Switch to Space',
    } satisfies Result,
  }));
  // Tabs and spaces whose name starts with what's typed come before the search.
  matches
    .filter(({ points }) => isStrong(points, text))
    .slice(0, 3)
    .forEach(({ item }) => add(strip(item)));
  spaces.filter(({ points }) => isStrong(points, text)).forEach(({ result }) => add(result));

  add({ key: 'search', command: { type: 'search', text }, title: text, hint: 'Search' });

  spaces.forEach(({ result }) => add(result));

  ranked(
    actions.map((a) => ({ ...a, text: `${a.title} ${a.words}` })),
    text,
  )
    .slice(0, LIMIT.actions)
    .forEach(({ item: { text: _text, ...a } }) => add(plain(a)));

  matches.slice(0, LIMIT.pages).forEach(({ item }) => add(strip(item)));

  const shown = results.map((result) => result.url).filter((u): u is string => !!u);
  ranked(
    history
      .filter((entry) => !shown.some((other) => isSamePage(other, entry.url)))
      .map((entry) => ({ ...entry, text: `${entry.title} ${displayUrl(entry.url)}` })),
    text,
    (a, b) => b.visitCount - a.visitCount || b.lastVisitTime - a.lastVisitTime,
  )
    .slice(0, LIMIT.history)
    .forEach(({ item }) =>
      add({
        key: `history:${item.url}`,
        command: { type: 'openUrl', url: item.url },
        title: item.title || displayUrl(item.url),
        detail: item.title ? displayUrl(item.url) : undefined,
        url: item.url,
        hint: 'Open',
      }),
    );
  return results;
}

/**
 * What the current tab can split with: this space's other Today tabs that
 * aren't split already, a typed address, or a page from history.
 */
function splitChoices(text: string, ctx: CommandContext, history: readonly HistoryEntry[]) {
  const tabs = ctx.todayIds
    .map((id) => ctx.tabs.get(id))
    .filter((tab) => tab && tab.id !== ctx.activeId && tab.splitViewId === undefined)
    .map((tab): Page => ({
      key: `tab:${tab!.id}`,
      command: { type: 'switchToTab', tabId: tab!.id },
      title: tab!.title,
      url: tab!.url,
      hint: 'Split',
      text: `${tab!.title} ${displayUrl(tab!.url)}`,
      tabId: tab!.id,
    }));
  if (!text) return tabs.slice(0, LIMIT.pages).map(strip);

  const results: Result[] = [];
  const url = typedUrl(text);
  if (url) {
    results.push({
      key: 'open-url',
      command: { type: 'openUrl', url },
      title: displayUrl(url),
      url,
      hint: 'Split',
    });
  }
  ranked(tabs, text)
    .slice(0, LIMIT.pages)
    .forEach(({ item }) => results.push(strip(item)));
  ranked(
    history.map((entry) => ({ ...entry, text: `${entry.title} ${displayUrl(entry.url)}` })),
    text,
    (a, b) => b.visitCount - a.visitCount,
  )
    .slice(0, LIMIT.history)
    .forEach(({ item }) =>
      results.push({
        key: `history:${item.url}`,
        command: { type: 'openUrl', url: item.url },
        title: item.title || displayUrl(item.url),
        detail: item.title ? displayUrl(item.url) : undefined,
        url: item.url,
        hint: 'Split',
      }),
    );
  return results;
}
