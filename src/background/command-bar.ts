import { browser, type Browser } from 'wxt/browser';
import { addressLabel } from '@/model/urls';
import type {
  CommandBarMessage,
  HelloReply,
  PingReply,
  SwitcherReply,
} from '@/platform/command-bar';
import { commandBarRequestItem } from '@/platform/storage-items';

/** Tokens handed to overlays not yet open, by tab: the frame proves itself with one. */
const pending = new Map<
  number,
  { token: string; sidebarOpen: boolean; address?: string; switcher?: boolean }
>();

const send = (message: CommandBarMessage) => browser.runtime.sendMessage(message);

/** Pages Chrome doesn't let extensions script, where the bar opens in the sidebar. */
export function canCoverPage(url: string | undefined): boolean {
  if (!url || !/^(https?|file):/.test(url)) return false;
  return !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(url);
}

/**
 * Over the page as in Arc, else in the sidebar. A closed sidebar only opens synchronously,
 * inside the shortcut's gesture. `editAddress` is Arc's ⌘L.
 */
export function onCommandBarShortcut(
  tab: Browser.tabs.Tab | undefined,
  { editAddress = false } = {},
) {
  if (tab?.id === undefined) return;
  const url = tab.url ?? '';
  // A new tab's address isn't worth editing: start empty, still loading in this tab.
  const address = editAddress ? (addressLabel(url) ? url : '') : undefined;
  if (!canCoverPage(tab.url)) {
    void browser.sidePanel.open({ windowId: tab.windowId });
    void toggleInSidebar(tab.windowId, address);
    return;
  }
  void coverPage(tab.id, tab.windowId, address);
}

/**
 * Arc's Ctrl-Tab (Chrome keeps Ctrl+Tab, so it's a shortcut of your own). A quick press,
 * let go before the list shows, switches to the previous tab, as in Arc.
 */
export async function onRecentTabsShortcut(tab: Browser.tabs.Tab) {
  if (tab.id === undefined) return;
  if (!canCoverPage(tab.url)) return switchToPrevious(tab.windowId);
  const token = crypto.randomUUID();
  pending.set(tab.id, { token, sidebarOpen: false, switcher: true });
  const message: CommandBarMessage = { kind: 'command-bar:overlay', token, switcher: true };
  const ask = () => browser.tabs.sendMessage(tab.id!, message) as Promise<SwitcherReply>;
  const reply = await ask().catch(() =>
    browser.scripting
      .executeScript({ target: { tabId: tab.id! }, files: ['/content-scripts/command-overlay.js'] })
      .then(ask)
      .catch(() => 'quick' as const),
  );
  if (reply !== 'opened') pending.delete(tab.id);
  if (reply === 'quick') await switchToPrevious(tab.windowId);
}

async function switchToPrevious(windowId: number) {
  const tabs = await browser.tabs.query({ windowId });
  const [, previous] = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  if (previous?.id !== undefined) await browser.tabs.update(previous.id, { active: true });
}

async function coverPage(tabId: number, windowId: number, address?: string) {
  const sidebar = await pingSidebar(windowId);
  if (sidebar?.focused) return void toggleInSidebar(windowId, address);

  const token = crypto.randomUUID();
  pending.set(tabId, { token, sidebarOpen: sidebar !== null, address });
  const message: CommandBarMessage = { kind: 'command-bar:overlay', token };
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    try {
      // A page loaded before the extension has no overlay script yet.
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['/content-scripts/command-overlay.js'],
      });
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      pending.delete(tabId);
      if (sidebar) await toggleInSidebar(windowId, address);
    }
  }
}

/** null if this window's sidebar isn't open. */
async function pingSidebar(windowId: number): Promise<PingReply | null> {
  const reply = send({ kind: 'command-bar:ping', windowId }).then(
    (answer) => (answer as PingReply | undefined) ?? null,
    () => null,
  );
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 150));
  return Promise.race([reply, timeout]);
}

/** Also stored, so a sidebar still starting picks the request up. */
async function toggleInSidebar(windowId: number, address?: string) {
  const requestId = crypto.randomUUID();
  await commandBarRequestItem.setValue({ id: requestId, windowId, at: Date.now(), address });
  await send({ kind: 'command-bar:toggle', windowId, requestId, address }).catch(() => {});
}

/** The bar's frame checking in: only one the overlay script opened gets an answer. */
export function onCommandBarHello(
  token: string,
  sender: Browser.runtime.MessageSender,
): HelloReply {
  const tabId = sender.tab?.id;
  const expected = tabId === undefined ? undefined : pending.get(tabId);
  if (!expected || expected.token !== token || sender.frameId === 0) return { ok: false };
  pending.delete(tabId!);
  return {
    ok: true,
    windowId: sender.tab!.windowId,
    sidebarOpen: expected.sidebarOpen,
    address: expected.address,
    switcher: expected.switcher,
  };
}
