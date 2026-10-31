import {
  CLOSE_MESSAGE,
  FRAME_SCHEME,
  type CommandBarMessage,
  type CommandBarPost,
  type CommandLook,
  type SwitcherPost,
  type SwitcherReply,
  type Typed,
} from '@/platform/command-bar';
import { drawStandIn, type StandIn } from '@/platform/command-standin';
import type { NoteMessage } from '@/platform/messages';
import { trackModifiers } from '@/platform/modifiers';
import { showPageNote } from '@/platform/page-note';

/**
 * The command bar over the page: an extension frame in the top layer, in a closed shadow root,
 * so the page can't reach it or see what's typed. Kept tiny: it runs in every page.
 */
const sameTyped = (a: Typed, b: Typed | undefined) =>
  !!b && a.text === b.text && a.start === b.start && a.end === b.end && a.submit === b.submit;

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

    function open(
      token: string,
      {
        asSwitcher = false,
        look,
        address,
      }: { asSwitcher?: boolean; look?: CommandLook; address?: string } = {},
    ) {
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
        `color-scheme: ${FRAME_SCHEME}`,
      ]
        .map((rule) => `${rule} !important`)
        .join(';');
      const frameStyle = `position: absolute; inset: 0; display: block; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: ${FRAME_SCHEME};`;
      const frame = document.createElement('iframe');
      frame.src = `${browser.runtime.getURL('/command.html')}#${token}`;
      frame.allow = 'clipboard-read; clipboard-write';
      frame.style.cssText = frameStyle;
      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.append(frame);
      let standIn: StandIn | undefined;
      // What the bar was last sent from the stand-in.
      let sent: Typed | undefined;

      const onMessage = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return;
        const data = event.data as Partial<CommandBarPost> & Partial<SwitcherPost>;
        if (data?.arcCommandBar === CLOSE_MESSAGE.arcCommandBar) close?.();
        if ((data?.arcCommandBar === 'ready' || data?.arcCommandBar === 'carried') && standIn) {
          // The stand-in keeps the keyboard until the bar has everything typed
          // into it; only then does the bar show and take over, so no key is lost.
          const typed = standIn.typed();
          if (data.arcCommandBar === 'carried' && sameTyped(typed, sent)) {
            frame.style.opacity = '';
            standIn.remove();
            standIn = undefined;
            frame.focus();
            return;
          }
          sent = typed;
          frame.contentWindow?.postMessage(
            { arcCommandBar: 'typed', ...typed } satisfies CommandBarPost,
            '*',
          );
        }
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
      if (!asSwitcher && look) {
        // Chrome takes a few frames to start the bar, so its field is drawn here at once.
        const cover = document.createElement('iframe');
        cover.style.cssText = frameStyle;
        shadow.append(cover);
        frame.style.opacity = '0';
        standIn = drawStandIn(cover, { look, address, onClose: () => close?.() });
        return;
      }
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
        else open(message.token, { look: message.look, address: message.address });
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
      open(token, { asSwitcher: true });
      return 'opened';
    }

    ctx.onInvalidated(() => {
      close?.();
      scope.arcCommandOverlay = false;
    });
  },
});
