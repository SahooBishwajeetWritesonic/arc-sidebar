import { browser } from 'wxt/browser';
import { selectionLinks } from '@/app/selection/actions';
import type { SelectionMessage } from '@/platform/messages';
import { hasGroup } from '@/state/selection';

/** Hands the Copy URL shortcut the rows selected together here, when there are several. */
export function serveSelection(windowId: number): () => void {
  const listener = (
    message: SelectionMessage,
    _sender: unknown,
    sendResponse: (reply: unknown) => void,
  ) => {
    if (message?.kind !== 'sidebar:selection' || message.windowId !== windowId) return;
    sendResponse(hasGroup() ? selectionLinks() : null);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
