import { CLOSE_MESSAGE, type CommandBarMessage } from '@/platform/command-bar';
import type { NoteMessage } from '@/platform/messages';

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

    let note: { host: HTMLElement; timer: number } | undefined;

    function showNote(text: string) {
      if (note) {
        clearTimeout(note.timer);
        note.host.remove();
      }
      const host = document.createElement('div');
      host.setAttribute('popover', 'manual');
      host.style.cssText = [
        'all: initial',
        'position: fixed',
        'inset: auto 0 24px 0',
        'width: max-content',
        'max-width: calc(100vw - 32px)',
        'margin: 0 auto',
        'padding: 0',
        'border: 0',
        'background: transparent',
        'overflow: visible',
      ]
        .map((rule) => `${rule} !important`)
        .join(';');
      // A neutral dark note reads on any page, like a Mac's HUD.
      const pill = document.createElement('div');
      pill.setAttribute('role', 'status');
      pill.textContent = text;
      pill.style.cssText = [
        'font: 500 13px/18px -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        'color: #fff',
        'background: rgb(30 30 32 / 0.88)',
        '-webkit-backdrop-filter: blur(20px) saturate(1.6)',
        'backdrop-filter: blur(20px) saturate(1.6)',
        'padding: 8px 14px',
        'border-radius: 10px',
        'box-shadow: 0 0 0 0.5px rgb(255 255 255 / 0.14), 0 8px 24px rgb(0 0 0 / 0.28)',
        'white-space: nowrap',
        'overflow: hidden',
        'text-overflow: ellipsis',
      ].join(';');
      host.attachShadow({ mode: 'closed' }).append(pill);
      (document.body ?? document.documentElement).append(host);
      host.showPopover();
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const from = still ? { opacity: 0 } : { opacity: 0, transform: 'translateY(6px)' };
      pill.animate([from, { opacity: 1, transform: 'none' }], {
        duration: 150,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      });
      const timer = window.setTimeout(() => {
        void pill
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
          .finished.then(() => host.remove());
      }, 1600);
      note = { host, timer };
    }

    browser.runtime.onMessage.addListener(
      (message: CommandBarMessage | NoteMessage, _sender, sendResponse) => {
        if (message?.kind === 'page:note') {
          showNote(message.text);
          sendResponse(true);
          return;
        }
        if (message?.kind !== 'command-bar:overlay') return;
        if (close) close();
        else open(message.token);
        sendResponse(true);
      },
    );
    ctx.onInvalidated(() => {
      close?.();
      note?.host.remove();
      scope.arcCommandOverlay = false;
    });
  },
});
