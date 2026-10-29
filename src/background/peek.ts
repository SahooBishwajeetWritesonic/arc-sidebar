import { browser, type Browser } from 'wxt/browser';
import {
  peeksClosedBy,
  type FloatingKind,
  type LinkChoice,
  type PeekMessage,
  type PeekRole,
} from '@/platform/peek';
import { floatingItem, type FloatingWindow } from '@/platform/storage-items';

/**
 * Peek and Little Arc are Chrome popup windows (no tab strip). A Peek closes when the window
 * it came from is clicked, as Arc's closes on a click outside it.
 */

const KEEP = 'keep-floating';
const KEEP_TITLE: Record<FloatingKind, string> = {
  peek: 'Open in Tab',
  little: 'Open in Main Window',
};

/** The one that has focus, for the page menu's Open in Tab. */
let focused: FloatingKind | null = null;

const all = () => floatingItem.getValue();

async function remember(windowId: number, floating: FloatingWindow) {
  await floatingItem.setValue({ ...(await all()), [windowId]: floating });
}

async function forget(windowId: number): Promise<FloatingWindow | undefined> {
  const { [windowId]: gone, ...rest } = await all();
  if (gone) await floatingItem.setValue(rest);
  return gone;
}

const tell = (tabId: number, role: Omit<PeekRole, 'kind'>) =>
  void browser.tabs.sendMessage(tabId, { kind: 'peek:role', ...role }).catch(() => {});

/** Most of the window, centred over it, as Arc's Peek covers the page. */
function peekBounds(source: Browser.windows.Window) {
  const { left = 0, top = 0, width = 1280, height = 800 } = source;
  const w = Math.round(Math.min(width * 0.86, 1440));
  const h = Math.round(height * 0.88);
  return {
    left: Math.round(left + (width - w) / 2),
    top: Math.round(top + (height - h) / 2),
    width: w,
    height: h,
  };
}

/** A small window near the top of the one it came from; more step down from it, as in Arc. */
function littleBounds(source: Browser.windows.Window, others: number) {
  const { left = 0, top = 0, width = 1280, height = 800 } = source;
  const w = Math.min(600, width - 80);
  const h = Math.min(760, height - 120);
  const step = (others % 5) * 24;
  return {
    left: Math.round(left + (width - w) / 2 + step),
    top: Math.round(top + 64 + step),
    width: Math.round(w),
    height: Math.round(h),
  };
}

/** Arc's Little Arc, for a tab or a page; with neither, it starts on the command bar. */
export async function openLittleArc(windowId: number, what: { tabId?: number; url?: string } = {}) {
  const from = await browser.windows.get(windowId);
  const others = Object.values(await all()).filter((window) => window.kind === 'little').length;
  const created = await browser.windows.create({
    type: 'popup',
    focused: true,
    ...littleBounds(from, others),
    ...(what.tabId !== undefined
      ? { tabId: what.tabId }
      : { url: what.url ?? browser.runtime.getURL('/little.html') }),
  });
  const tabId = created?.tabs?.[0]?.id;
  if (created?.id === undefined || tabId === undefined) return;
  await remember(created.id, { kind: 'little', tabId, from: windowId, openedAt: Date.now() });
  tell(tabId, { pinned: false, floating: 'little' });
}

async function openPeek(url: string, source: Browser.tabs.Tab) {
  const from = await browser.windows.get(source.windowId);
  const created = await browser.windows.create({
    url,
    type: 'popup',
    focused: true,
    ...peekBounds(from),
  });
  const tabId = created?.tabs?.[0]?.id;
  if (created?.id === undefined || tabId === undefined) return;
  await remember(created.id, { kind: 'peek', tabId, from: from.id!, openedAt: Date.now() });
  tell(tabId, { pinned: false, floating: 'peek' });
}

/** Moves a Peek's or Little Arc's tab into the window it came from (or the last one used). */
async function keep(windowId: number) {
  const floating = await forget(windowId);
  if (!floating) return;
  const target = await browser.windows
    .get(floating.from)
    .catch(() => browser.windows.getLastFocused({ windowTypes: ['normal'] }));
  if (target.id === undefined) return;
  await browser.tabs.move(floating.tabId, { windowId: target.id, index: -1 });
  await browser.tabs.update(floating.tabId, { active: true });
  await browser.windows.update(target.id, { focused: true });
  tell(floating.tabId, { pinned: false, floating: null });
}

async function close(windowId: number) {
  if (await forget(windowId)) await browser.windows.remove(windowId).catch(() => {});
}

function showKeepItem(kind: FloatingKind | null) {
  focused = kind;
  void browser.contextMenus
    .update(KEEP, { visible: kind !== null, ...(kind && { title: KEEP_TITLE[kind] }) })
    .catch(() => {});
}

export async function syncKeepItem() {
  const window = await browser.windows.getLastFocused().catch(() => undefined);
  showKeepItem((window?.id !== undefined && (await all())[window.id]?.kind) || null);
}

/** The tab menu calls this each time it rebuilds, since that clears every menu. */
export function addKeepItem() {
  browser.contextMenus.create({
    id: KEEP,
    title: KEEP_TITLE[focused ?? 'peek'],
    visible: focused !== null,
    contexts: ['page', 'frame', 'link', 'selection', 'image', 'video', 'audio', 'editable'],
  });
}

export function onKeepItemClick(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) {
  if (info.menuItemId !== KEEP || tab === undefined) return false;
  void keep(tab.windowId);
  return true;
}

export async function onFocusChanged(windowId: number) {
  const floating = await all();
  showKeepItem(floating[windowId]?.kind ?? null);
  for (const id of peeksClosedBy(floating, windowId, Date.now())) await close(id);
}

export async function onWindowRemoved(windowId: number) {
  await forget(windowId);
  // A Peek over a window that closed goes with it.
  for (const [id, peek] of Object.entries(await all())) {
    if (peek.from === windowId) await close(Number(id));
  }
}

async function roleOf(tabId: number | undefined, bound: ReadonlySet<number>) {
  if (tabId === undefined) return { pinned: false, floating: null };
  const floating = Object.values(await all()).find((window) => window.tabId === tabId);
  return { pinned: bound.has(tabId), floating: floating?.kind ?? null };
}

/** Tab ids of open pinned tabs and Favorites, so a change can be told to the page. */
let told: Set<number> | undefined;

/**
 * Pinned pages learn it, so their links know whether to peek. A page loaded before the
 * extension has no script yet: it gets one, which asks for itself.
 */
export function onBindingsChanged(bound: ReadonlySet<number>) {
  for (const tabId of bound) {
    if (told?.has(tabId)) continue;
    void browser.tabs
      .sendMessage(tabId, { kind: 'peek:role', pinned: true, floating: null } satisfies PeekRole)
      .catch(() =>
        browser.scripting
          .executeScript({ target: { tabId }, files: ['/content-scripts/peek.js'] })
          .catch(() => {}),
      );
  }
  for (const tabId of told ?? [])
    if (!bound.has(tabId)) tell(tabId, { pinned: false, floating: null });
  told = new Set(bound);
}

export function isPeekMessage(message: unknown): message is PeekMessage {
  const kind = (message as { kind?: unknown } | null)?.kind;
  return typeof kind === 'string' && kind.startsWith('peek:');
}

/** `bound`: the tab ids of pinned tabs and Favorites. */
export function onPeekMessage(
  message: PeekMessage,
  sender: Browser.runtime.MessageSender,
  bound: () => Promise<ReadonlySet<number>>,
  respond: (role: PeekRole) => void,
): boolean {
  const tab = sender.tab;
  switch (message.kind) {
    case 'peek:hello':
      void bound()
        .then((tabs) => roleOf(tab?.id, tabs))
        .then((role) => respond({ kind: 'peek:role', ...role }));
      return true;
    case 'peek:open':
      if (tab) void open(message.url, message.as, tab);
      return false;
    case 'peek:close':
      if (tab) void closeIfPeek(tab.windowId);
      return false;
    case 'peek:keep':
      if (tab) void keep(tab.windowId);
      return false;
  }
}

function open(url: string, as: LinkChoice, source: Browser.tabs.Tab) {
  if (as === 'peek') return openPeek(url, source);
  return browser.tabs.create({ windowId: source.windowId, url, active: true });
}

async function closeIfPeek(windowId: number) {
  if ((await all())[windowId]?.kind === 'peek') await close(windowId);
}
