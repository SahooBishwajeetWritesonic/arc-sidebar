import { describe, expect, it } from 'vitest';
import { gmailAccountOf, parseGmailFeed } from './gmail';

const FEED = `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for someone@example.com</title><fullcount>12</fullcount><link rel="alternate" href="https://mail.google.com/mail" type="text/html" /><modified>2026-10-30T10:00:00Z</modified>
<entry><title>Q4 plan &amp; budget</title><summary>Here&#39;s the draft we talked about &lt;3</summary><link rel="alternate" href="https://mail.google.com/mail?account_id=someone@example.com&amp;message_id=18c1&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-10-30T09:58:00Z</modified><issued>2026-10-30T09:58:00Z</issued><id>tag:gmail.google.com,2004:1</id><author><name>Jane Doe</name><email>jane@example.com</email></author></entry>
<entry><title></title><summary></summary><link rel="alternate" href="https://mail.google.com/mail?message_id=18c2" type="text/html" /><issued>2026-10-29T08:00:00Z</issued><author><name></name><email>noreply@example.com</email></author></entry>
</feed>`;

describe('parseGmailFeed', () => {
  it('reads the unread count and each message, newest first', () => {
    expect(parseGmailFeed(FEED)).toEqual({
      unread: 12,
      messages: [
        {
          subject: 'Q4 plan & budget',
          snippet: "Here's the draft we talked about <3",
          from: 'Jane Doe',
          at: Date.parse('2026-10-30T09:58:00Z'),
          url: 'https://mail.google.com/mail?account_id=someone@example.com&message_id=18c1&view=conv&extsrc=atom',
        },
        {
          subject: '',
          snippet: '',
          from: 'noreply@example.com',
          at: Date.parse('2026-10-29T08:00:00Z'),
          url: 'https://mail.google.com/mail?message_id=18c2',
        },
      ],
    });
  });

  it('is null for a sign-in page', () => {
    expect(parseGmailFeed('<!doctype html><html><title>Sign in</title></html>')).toBeNull();
  });
});

describe('gmailAccountOf', () => {
  it('finds the account in a Gmail address, and nothing elsewhere', () => {
    expect(gmailAccountOf('https://mail.google.com/mail/u/1/#inbox')).toBe(1);
    expect(gmailAccountOf('https://mail.google.com/mail/#inbox')).toBe(0);
    expect(gmailAccountOf('https://calendar.google.com/')).toBeUndefined();
  });
});
