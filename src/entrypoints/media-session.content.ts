import { MEDIA_EVENT } from '@/platform/media-page';

/**
 * Runs in the page's world before its scripts to note its Media Session handlers, which Chrome
 * gives extensions no way to call. Kept tiny: it runs in every page.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const session = navigator.mediaSession;
    if (!session) return;
    const handlers = new Map<string, MediaSessionActionHandler>();
    const register = session.setActionHandler.bind(session);
    session.setActionHandler = (action, handler) => {
      if (handler) handlers.set(action, handler);
      else handlers.delete(action);
      register(action, handler);
    };
    addEventListener(MEDIA_EVENT, (event) => {
      const detail = (event as CustomEvent).detail as {
        query?: boolean;
        actions?: string[];
        action?: MediaSessionAction;
        handled?: boolean;
      } | null;
      if (!detail) return;
      if (detail.query) detail.actions = [...handlers.keys()];
      const handler = detail.action && handlers.get(detail.action);
      if (handler) {
        handler({ action: detail.action! });
        detail.handled = true;
      }
    });
  },
});
