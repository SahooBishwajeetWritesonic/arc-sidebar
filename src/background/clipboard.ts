import { browser } from 'wxt/browser';
import type { NoteMessage } from '@/platform/messages';

let queue: Promise<unknown> = Promise.resolve();

/**
 * The background has no clipboard, so this copies through an offscreen page, closed straight
 * after so it costs nothing idle. One copy at a time; resolves whether it worked.
 */
export function writeClipboard(text: string): Promise<boolean> {
  const done = queue.then(async () => {
    if (!(await browser.offscreen.hasDocument())) {
      await browser.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Copy URL puts links on the clipboard.',
      });
    }
    try {
      const message: NoteMessage = { kind: 'clipboard:write', text };
      return (await browser.runtime.sendMessage(message)) === true;
    } finally {
      await browser.offscreen.closeDocument().catch(() => {});
    }
  });
  queue = done.catch(() => {});
  return done.catch(() => false);
}
