import { browser } from 'wxt/browser';
import { showToast } from '@/app/toast/toast';
import type { NoteMessage } from '@/platform/messages';

/** Shows the background's notes as toasts, when the page in front couldn't show them. */
export function serveNotes(windowId: number): () => void {
  const listener = (
    message: NoteMessage,
    _sender: unknown,
    sendResponse: (reply: unknown) => void,
  ) => {
    if (message?.kind !== 'sidebar:note' || message.windowId !== windowId) return;
    showToast(message.text);
    sendResponse(true);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
