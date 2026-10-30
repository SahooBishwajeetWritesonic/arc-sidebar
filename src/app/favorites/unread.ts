/**
 * An unread count from a page's title, as in "(3) Home / X" or "Inbox (12) - Gmail".
 * Arc badged only some sites; this reads any. Large counts read 999+.
 */
export function unreadCount(title: string): string | undefined {
  // At the start: "(3) Home / X", "(1,204) Messenger".
  const lead = /^\((\d[\d,]*)\+?\)\s/.exec(title)?.[1];
  // After one word, before a separator: "Inbox (3) - Gmail"; a year like "(2023)" doesn't count.
  const word = /^\p{L}{1,12} \((\d[\d,]*)\+?\)\s+[-–—|·]/u.exec(title)?.[1];
  const raw = lead ?? (word && !/^(19|20)\d\d$/.test(word) ? word : undefined);
  if (!raw) return undefined;
  const count = Number(raw.replace(/,/g, ''));
  if (!count) return undefined;
  return count > 999 ? '999+' : String(count);
}
