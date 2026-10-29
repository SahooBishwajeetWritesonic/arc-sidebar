import { browser } from 'wxt/browser';
import type { NoteMessage } from '@/platform/messages';

// The background has no clipboard, so it opens this hidden page to copy.
browser.runtime.onMessage.addListener((message: NoteMessage, _sender, sendResponse) => {
  if (message?.kind !== 'clipboard:write') return;
  const field = document.querySelector('textarea')!;
  field.value = message.text;
  field.select();
  sendResponse(document.execCommand('copy'));
});
