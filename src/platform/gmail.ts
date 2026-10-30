/**
 * Arc's Gmail preview, from Gmail's own feed of unread mail: it answers to
 * the account Chrome is signed in to, so it needs no Google sign-in of ours.
 */

export interface GmailMessage {
  subject: string;
  snippet: string;
  from: string;
  /** When it arrived, in ms. */
  at: number;
  /** The conversation, to open in the Gmail tab. */
  url: string;
}

export interface GmailInbox {
  unread: number;
  /** The newest unread first; Gmail's feed holds the latest 20. */
  messages: GmailMessage[];
}

/** The account (Gmail's /u/N/) a pinned page is in, or undefined if it isn't Gmail. */
export function gmailAccountOf(url: string): number | undefined {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname !== 'mail.google.com') return undefined;
    return Number(/^\/mail\/u\/(\d+)/.exec(pathname)?.[1] ?? 0);
  } catch {
    return undefined;
  }
}

export const gmailFeedUrl = (account: number) =>
  `https://mail.google.com/mail/u/${account}/feed/atom`;

export const gmailComposeUrl = (account: number) =>
  `https://mail.google.com/mail/u/${account}/#inbox?compose=new`;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name] ?? whole;
    const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

const tag = (xml: string, name: string) =>
  decode(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '').trim();

/** Gmail's Atom feed, read; null if it isn't one (signed out, it sends a login page). */
export function parseGmailFeed(xml: string): GmailInbox | null {
  if (!/<feed[\s>]/.test(xml)) return null;
  const messages = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry = '']) => {
    const author = /<author>([\s\S]*?)<\/author>/.exec(entry)?.[1] ?? '';
    return {
      subject: tag(entry, 'title'),
      snippet: tag(entry, 'summary'),
      from: tag(author, 'name') || tag(author, 'email'),
      at: Date.parse(tag(entry, 'issued') || tag(entry, 'modified')) || 0,
      url: decode(/<link[^>]*href="([^"]*)"/.exec(entry)?.[1] ?? ''),
    };
  });
  const unread = Number(tag(xml, 'fullcount'));
  return { unread: Number.isFinite(unread) ? unread : messages.length, messages };
}
