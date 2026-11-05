import { browser, type Browser } from 'wxt/browser';
import { escapeXml, omniboxSuggestions, omniboxTarget } from '@/command/omnibox';
import { linkHistoryText } from '@/command/sites';
import { displayUrl } from '@/command/url';
import type { Shortcut } from '@/model/types';
import { isSamePage } from '@/model/urls';
import type { HistoryIndex } from './history';

/**
 * The command bar in Chrome's own address bar: "arc", Space, then a shortcut ("lh 3300"), a
 * site search ("yt lofi"), a tab or a page from history.
 */
export function watchOmnibox(shortcuts: () => Promise<readonly Shortcut[]>, history: HistoryIndex) {
  browser.omnibox.onInputChanged.addListener((text, suggest) => {
    void (async () => {
      const known = await shortcuts();
      const host = linkHistoryText(text, known);
      const [tabs, found, linkHistory] = await Promise.all([
        browser.tabs.query({}),
        history.search(text, 5),
        host ? history.search(host, 500) : [],
      ]);
      const target = omniboxTarget(text, known);
      browser.omnibox.setDefaultSuggestion({
        description: target
          ? `Open <url>${escapeXml(displayUrl(target))}</url>`
          : 'Search for <match>%s</match>',
      });
      suggest(
        omniboxSuggestions(text, {
          shortcuts: known,
          tabs: tabs.flatMap((tab) => (tab.url ? [{ url: tab.url, title: tab.title ?? '' }] : [])),
          history: found,
          linkHistory,
        }),
      );
    })();
  });

  browser.omnibox.onInputEntered.addListener((text, disposition) => {
    void (async () => enter(omniboxTarget(text, await shortcuts()), text, disposition))();
  });
}

async function enter(
  url: string | null,
  text: string,
  disposition: `${Browser.omnibox.OnInputEnteredDisposition}`,
) {
  if (!url) {
    await browser.search.query({
      text,
      disposition: disposition === 'currentTab' ? 'CURRENT_TAB' : 'NEW_TAB',
    });
    return;
  }
  // Switch to a tab already showing it, in any window.
  const open = (await browser.tabs.query({})).find((tab) => tab.url && isSamePage(tab.url, url));
  if (open?.id !== undefined) {
    await browser.tabs.update(open.id, { active: true });
    await browser.windows.update(open.windowId, { focused: true });
    return;
  }
  if (disposition === 'currentTab') {
    const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (active?.id !== undefined) {
      await browser.tabs.update(active.id, { url });
      return;
    }
  }
  await browser.tabs.create({ url, active: disposition !== 'newBackgroundTab' });
}
