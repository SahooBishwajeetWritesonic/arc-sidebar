import { browser, type Browser } from 'wxt/browser';
import { copiedText, linksText } from '@/model/links';
import type { NoteMessage } from '@/platform/messages';
import { writeClipboard } from './clipboard';

/** The tab, and every other tab selected with it in Chrome's tab strip. */
export async function selectionOf(tab: Browser.tabs.Tab): Promise<Browser.tabs.Tab[]> {
  const selected = await browser.tabs.query({ windowId: tab.windowId, highlighted: true });
  return selected.some((other) => other.id === tab.id) ? selected : [tab];
}

/** Arc's Copy URL: the selected tabs' addresses, without tracking parameters. */
export async function copyLinks(tab: Browser.tabs.Tab, markdown = false) {
  const links = (await selectionOf(tab))
    .filter((each) => each.url)
    .map((each) => ({ url: each.url!, title: each.title ?? '' }));
  if (!links.length) return;
  const copied = await writeClipboard(linksText(links, markdown));
  await showNote(tab.windowId, copied ? copiedText(links.length, markdown) : 'Couldn’t copy');
}

/** A short note over the page in front, or in the sidebar on pages Chrome keeps scripts out of. */
export async function showNote(windowId: number, text: string) {
  const [front] = await browser.tabs.query({ windowId, active: true });
  const page: NoteMessage = { kind: 'page:note', text };
  const shown =
    front?.id !== undefined &&
    (await browser.tabs.sendMessage(front.id, page).catch(() => false)) === true;
  if (shown) return;
  const sidebar: NoteMessage = { kind: 'sidebar:note', windowId, text };
  await browser.runtime.sendMessage(sidebar).catch(() => {});
}
