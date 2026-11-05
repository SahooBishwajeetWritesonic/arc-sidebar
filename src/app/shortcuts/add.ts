import { showToast } from '@/app/toast/toast';
import {
  hexColor,
  keywordFor,
  parseOpenSearch,
  searchFromPage,
  siteName,
  type FoundSiteSearch,
} from '@/command/opensearch';
import { isSiteSearch } from '@/model/shortcuts';
import type { Shortcut } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { fetchText, readPageSearch } from '@/state/tabs';
import { addShortcut, showView } from '@/state/ui';

/** From the page's OpenSearch file, else from a results page's address. */
async function findSiteSearch(tab: { id: number; url: string }): Promise<FoundSiteSearch | null> {
  const page = await readPageSearch(tab.id);
  const color = hexColor(page?.themeColor);
  const file = page?.openSearch;
  const xml = file ? await fetchText(file) : null;
  const found = xml && file ? parseOpenSearch(xml, file) : null;
  const url = found?.url ?? searchFromPage(tab.url, page?.searchText);
  if (!url) return null;
  return { name: siteName(url), ...found, url, ...(color && { color }) };
}

/** Same host and page, so YouTube's own template matches the built-in one. */
function sameSearch(a: string, b: string) {
  try {
    const [x, y] = [new URL(a.replace('%s', 'x')), new URL(b.replace('%s', 'x'))];
    return (
      x.hostname.replace(/^www\./, '') === y.hostname.replace(/^www\./, '') &&
      x.pathname === y.pathname
    );
  } catch {
    return false;
  }
}

/** Keywords, and site searches' names. */
function typedWords(shortcuts: readonly Shortcut[]) {
  return new Set(
    shortcuts.flatMap((shortcut) => [
      ...shortcut.keywords,
      ...(isSiteSearch(shortcut) ? [shortcut.name.toLowerCase().replace(/\s+/g, '')] : []),
    ]),
  );
}

/** Found on the page, then named and saved in the sheet. */
export async function addSiteSearch(tab: { id: number; url: string }) {
  const found = await findSiteSearch(tab);
  if (!found) {
    showToast('No site search on this page. Search the site, then try again from the results.');
    return;
  }
  const shortcuts = useSidebar.getState().model.settings.shortcuts;
  const known = shortcuts.find(
    (shortcut) => isSiteSearch(shortcut) && sameSearch(shortcut.url, found.url),
  );
  if (known) {
    const [keyword] = known.keywords;
    showToast(`${known.name} is in Site Search already${keyword ? `, as “${keyword}”` : ''}.`);
    return;
  }
  const keyword = keywordFor(found.url, typedWords(shortcuts));
  showView('sidebar');
  addShortcut({ ...found, keywords: keyword ? [keyword] : [] });
}
