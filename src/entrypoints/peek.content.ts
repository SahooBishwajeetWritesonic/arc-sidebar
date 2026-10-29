import { linkChoice, type FloatingKind, type PeekMessage, type PeekRole } from '@/platform/peek';

/**
 * Arc's Peek: a Shift-click, or a link to another site in a pinned tab or Favorite, opens in a
 * Peek. In a Peek Esc closes it; ⌘O keeps the page as a tab. Kept tiny: it runs in every page.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    // Injected by hand into a page that loaded before the extension, then
    // again by Chrome: one copy is enough.
    const scope = window as Window & { arcPeek?: boolean };
    if (scope.arcPeek) return;
    scope.arcPeek = true;
    let pinned = false;
    let floating: FloatingKind | null = null;
    const send = (message: PeekMessage) => browser.runtime.sendMessage(message);
    const take = (role: unknown) => {
      if ((role as PeekRole | undefined)?.kind !== 'peek:role') return;
      ({ pinned, floating } = role as PeekRole);
    };
    // Asked again on focus, in case the worker restarted and missed telling us of a change.
    const ask = () => void send({ kind: 'peek:hello' }).then(take, () => {});
    ask();
    addEventListener('focus', ask);
    browser.runtime.onMessage.addListener(take);

    // Bubbling to the window, after the page's own handlers: a link the page
    // handles itself (it prevented the default) is left alone.
    addEventListener('click', (event) => {
      if (floating || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const link = event
        .composedPath()
        .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
      if (!link?.href || link.hasAttribute('download')) return;
      const choice = linkChoice(location.href, link.href, { shift: event.shiftKey, pinned });
      if (!choice) return;
      event.preventDefault();
      void send({ kind: 'peek:open', url: link.href, as: choice });
    });

    addEventListener('keydown', (event) => {
      if (!floating || event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape' && floating === 'peek' && !document.fullscreenElement) {
        void send({ kind: 'peek:close' });
      } else if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'o'
      ) {
        event.preventDefault();
        void send({ kind: 'peek:keep' });
      }
    });
  },
});
