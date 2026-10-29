import { CLOSE_MESSAGE, type CommandBarMessage } from '@/platform/command-bar';

/**
 * Kept tiny: it runs in every page. The bar's frame goes in the top layer, in a closed
 * shadow root, so the page's styles and scripts can't reach it.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    // Injected by hand into a page that loaded before the extension, then
    // again by Chrome: one copy listens, or a toggle would open and close.
    const scope = window as Window & { arcCommandOverlay?: boolean };
    if (scope.arcCommandOverlay) return;
    scope.arcCommandOverlay = true;
    let close: (() => void) | undefined;

    function open(token: string) {
      const previous = document.activeElement;
      const host = document.createElement('div');
      host.setAttribute('popover', 'manual');
      host.style.cssText = [
        'all: initial',
        'position: fixed',
        'inset: 0',
        'width: 100vw',
        'height: 100vh',
        'max-width: none',
        'max-height: none',
        'margin: 0',
        'padding: 0',
        'border: 0',
        'background: transparent',
        'overflow: hidden',
        'color-scheme: normal',
      ]
        .map((rule) => `${rule} !important`)
        .join(';');
      const frame = document.createElement('iframe');
      frame.src = `${browser.runtime.getURL('/command.html')}#${token}`;
      frame.allow = 'clipboard-write';
      frame.style.cssText =
        'display: block; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: normal;';
      host.attachShadow({ mode: 'closed' }).append(frame);

      const onMessage = (event: MessageEvent) => {
        const data = event.data as Partial<typeof CLOSE_MESSAGE> | null;
        if (
          event.source === frame.contentWindow &&
          data?.arcCommandBar === CLOSE_MESSAGE.arcCommandBar
        ) {
          close?.();
        }
      };
      close = () => {
        close = undefined;
        removeEventListener('message', onMessage);
        host.remove();
        if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
      };
      addEventListener('message', onMessage);
      (document.body ?? document.documentElement).append(host);
      host.showPopover();
      frame.focus();
    }

    browser.runtime.onMessage.addListener((message: CommandBarMessage, _sender, sendResponse) => {
      if (message?.kind !== 'command-bar:overlay') return;
      if (close) close();
      else open(message.token);
      sendResponse(true);
    });
    ctx.onInvalidated(() => {
      close?.();
      scope.arcCommandOverlay = false;
    });
  },
});
