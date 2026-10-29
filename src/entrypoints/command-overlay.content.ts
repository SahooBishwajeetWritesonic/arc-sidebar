import {
  CLOSE_MESSAGE,
  type CommandBarMessage,
  type SwitcherPost,
  type SwitcherReply,
} from '@/platform/command-bar';
import type { NoteMessage } from '@/platform/messages';
import { trackModifiers } from '@/platform/modifiers';
import { showPageNote } from '@/platform/page-note';

/**
 * Kept tiny: it runs in every page. Frames go in a closed shadow root, out of reach.
 * Until the recent tabs' frame has the keyboard, this page watches the shortcut's keys.
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
    // The recent tabs' frame, while they're the ones showing.
    let switcher: HTMLIFrameElement | undefined;
    const held = trackModifiers(window);

    function open(token: string, asSwitcher = false) {
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
        if (event.source !== frame.contentWindow) return;
        const data = event.data as Partial<typeof CLOSE_MESSAGE> & Partial<SwitcherPost>;
        if (data?.arcCommandBar === CLOSE_MESSAGE.arcCommandBar) close?.();
        if (data?.arcSwitcher === 'ready') {
          // Let go while it loaded, it switches without ever showing.
          const reply: SwitcherPost = { arcSwitcher: 'held', held: held() };
          frame.contentWindow?.postMessage(reply, '*');
          if (!reply.held) return;
          frame.style.visibility = '';
          frame.focus();
        }
      };
      close = () => {
        close = undefined;
        switcher = undefined;
        removeEventListener('message', onMessage);
        host.remove();
        if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
      };
      addEventListener('message', onMessage);
      (document.body ?? document.documentElement).append(host);
      host.showPopover();
      if (!asSwitcher) return frame.focus();
      // Hidden, keyboard still here to see the keys let go, until the list is drawn.
      switcher = frame;
      frame.style.visibility = 'hidden';
    }

    browser.runtime.onMessage.addListener(
      (message: CommandBarMessage | NoteMessage, _sender, sendResponse) => {
        if (message?.kind === 'page:note') {
          showPageNote(message.text);
          sendResponse(true);
          return;
        }
        if (message?.kind !== 'command-bar:overlay') return;
        if (message.switcher) {
          sendResponse(onSwitcher(message.token) satisfies SwitcherReply);
          return;
        }
        if (close) close();
        else open(message.token);
        sendResponse(true);
      },
    );
    function onSwitcher(token: string): SwitcherReply {
      if (switcher) {
        switcher.contentWindow?.postMessage({ arcSwitcher: 'next' } satisfies SwitcherPost, '*');
        return 'next';
      }
      // Let go already: no list, just the previous tab.
      if (!held()) return 'quick';
      close?.();
      open(token, true);
      return 'opened';
    }

    ctx.onInvalidated(() => {
      close?.();
      scope.arcCommandOverlay = false;
    });
  },
});
