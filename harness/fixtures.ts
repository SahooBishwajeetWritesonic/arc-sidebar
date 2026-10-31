import type { PullRequest } from '@/model/live';
import type { DownloadEntry } from '@/platform/downloads';
import type { GmailInbox } from '@/platform/gmail';
import type { HistoryEntry } from '@/platform/types';
import type { Fixture } from './fake-platform';

export const startingTabs: Fixture[] = [
  { title: 'Inbox (3) - Gmail', url: 'https://mail.google.com/mail/u/0/#inbox' },
  { title: 'Google Calendar - Week of 26 October 2026', url: 'https://calendar.google.com/' },
  { title: 'My issues · Linear', url: 'https://linear.app/' },
  { title: 'Pull requests · GitHub', url: 'https://github.com/pulls' },
  { title: 'Engineering Wiki', url: 'https://www.notion.so/' },
  { title: 'Sidebar explorations – Figma', url: 'https://www.figma.com/' },
  {
    title: 'chrome.sidePanel | API | Chrome for Developers — a long title to check the fade',
    url: 'https://developer.chrome.com/docs/extensions/reference/api/sidePanel',
  },
  { title: 'Lo-fi beats to code to - YouTube', url: 'https://www.youtube.com/', audible: true },
];

/** Pages the "Open tab" button cycles through. */
export const morePages: Fixture[] = [
  {
    title: 'Layout animations | Motion for React',
    url: 'https://motion.dev/docs/react-layout-animations',
  },
  {
    title: 'light-dark() - CSS | MDN',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/light-dark',
  },
  { title: 'Hacker News', url: 'https://news.ycombinator.com/' },
  { title: 'The Verge', url: 'https://www.theverge.com/' },
  { title: 'Stack Overflow - Where Developers Learn', url: 'https://stackoverflow.com/' },
  { title: 'WXT – Next-gen Web Extension Framework', url: 'https://wxt.dev/' },
];

const sites: Fixture[] = [
  { title: 'Pull request review', url: 'https://github.com/' },
  { title: 'Sprint board · Linear', url: 'https://linear.app/' },
  { title: 'Design review notes', url: 'https://www.notion.so/' },
  { title: 'Onboarding flow v3 – Figma', url: 'https://www.figma.com/' },
  { title: 'Array.prototype.toSorted() - JavaScript | MDN', url: 'https://developer.mozilla.org/' },
  { title: 'How do I debounce in React? - Stack Overflow', url: 'https://stackoverflow.com/' },
  { title: 'Quarterly planning - Google Docs', url: 'https://docs.google.com/' },
  { title: 'Metrics dashboard - Google Sheets', url: 'https://sheets.google.com/' },
  { title: 'Incident #4821 · Datadog', url: 'https://app.datadoghq.com/' },
  { title: 'Release checklist · Confluence', url: 'https://atlassian.net/' },
  { title: 'Talk: Rendering at 120fps - YouTube', url: 'https://www.youtube.com/' },
  { title: 'r/webdev - Reddit', url: 'https://www.reddit.com/' },
  { title: 'Show HN: A tiny layout engine | Hacker News', url: 'https://news.ycombinator.com/' },
  { title: 'Flights to Lisbon · Google Flights', url: 'https://www.google.com/travel/flights' },
  { title: 'Order #112-4471 - Amazon.com', url: 'https://www.amazon.com/' },
];

/** `count` more tabs for performance runs (?tabs=200), each with its own URL. */
export const manyTabs = (count: number): Fixture[] =>
  Array.from({ length: count }, (_, i) => {
    const site = sites[i % sites.length]!;
    return { title: `${site.title} (${i + 1})`, url: `${site.url}?tab=${i + 1}` };
  });

/** Titles and pages that break naive rows (?fixture=edge). */
export const edgeTabs: Fixture[] = [
  {
    title: `Pneumonoultramicroscopicsilicovolcanoconiosis${'Supercalifragilistic'.repeat(12)}`,
    url: 'https://long.example/',
  },
  {
    title: 'https://example.com/a/very/long/path/that/keeps/going?with=a&query=string#and-a-hash',
    url: 'https://example.com/a/very/long/path/that/keeps/going?with=a&query=string#and-a-hash',
  },
  { title: 'مرحبا بالعالم - أخبار اليوم', url: 'https://www.aljazeera.net/' },
  { title: 'שלום עולם - חדשות', url: 'https://www.ynet.co.il/' },
  { title: '東京の天気 - 日本気象協会', url: 'https://tenki.jp/' },
  { title: '🎉🚀 Launch day 👩🏽‍💻 notes ✨', url: 'https://party.example/' },
  { title: '', url: 'https://untitled.example/some/page' },
  { title: 'Settings', url: 'chrome://settings/' },
  { title: 'notes.txt', url: 'file:///Users/me/notes.txt' },
  { title: 'Annual report 2026.pdf', url: 'https://example.com/annual-report-2026.pdf' },
  { title: 'Asleep: discarded to save memory', url: 'https://asleep.example/', discarded: true },
];

const day = 24 * 3600_000;

/** Chrome's history for the command bar: addresses typed often complete inline. */
export const historyPages: HistoryEntry[] = [
  { url: 'https://github.com/', title: 'GitHub', visitCount: 120, typedCount: 40 },
  {
    url: 'https://github.com/anthropics/claude-code',
    title: 'anthropics/claude-code',
    visitCount: 30,
    typedCount: 6,
  },
  { url: 'https://gist.github.com/', title: 'Discover gists', visitCount: 8, typedCount: 2 },
  { url: 'https://news.ycombinator.com/', title: 'Hacker News', visitCount: 90, typedCount: 25 },
  { url: 'https://arc.net/', title: 'Arc from The Browser Company', visitCount: 12, typedCount: 3 },
  {
    url: 'https://developer.chrome.com/docs/extensions/reference/api/commands',
    title: 'chrome.commands | API | Chrome for Developers',
    visitCount: 6,
    typedCount: 0,
  },
  {
    url: 'https://developer.chrome.com/docs/extensions/reference/api/history',
    title: 'chrome.history | API | Chrome for Developers',
    visitCount: 3,
    typedCount: 0,
  },
  {
    url: 'https://motion.dev/docs/react-animation',
    title: 'React animation | Motion',
    visitCount: 14,
    typedCount: 0,
  },
  { url: 'https://www.gitlab.com/', title: 'GitLab', visitCount: 40, typedCount: 0 },
  {
    url: 'https://resources.arc.net/hc/en-us/articles/19212718608151',
    title: 'Command Bar: Your Arc Search Engine',
    visitCount: 2,
    typedCount: 0,
  },
].map((entry, i) => ({ ...entry, lastVisitTime: Date.UTC(2026, 9, 28) - i * day }));

/** Open pull requests on the fake github.com: yours, and ones waiting for your review. */
const pr = (
  repo: string,
  number: number,
  title: string,
  created: string,
  extra: { mine?: boolean; draft?: boolean; ci?: 'success' | 'failure' } = {},
): PullRequest & { mine: boolean } => ({
  url: `https://github.com/${repo}/pull/${number}`,
  title,
  repo,
  number,
  draft: extra.draft ?? false,
  created,
  mine: extra.mine ?? false,
  ...(extra.ci && { ci: extra.ci }),
});

export const pullRequests = [
  pr('acme/web', 482, 'Keep the sidebar open across restarts', '2026-10-28T09:12:00Z', {
    mine: true,
    ci: 'success',
  }),
  pr('acme/web', 479, 'Draft: try a denser tab row', '2026-10-26T15:40:00Z', {
    mine: true,
    draft: true,
  }),
  pr('acme/api', 1311, 'Rate-limit the search endpoint per workspace', '2026-10-27T11:05:00Z', {
    ci: 'failure',
  }),
  pr('acme/design', 88, 'New space icons', '2026-10-21T08:30:00Z', { ci: 'success' }),
];

const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000;
const message = (from: string, subject: string, snippet: string, minutes: number) => ({
  from,
  subject,
  snippet,
  at: minutesAgo(minutes),
  url: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(subject)}`,
});

/** Gmail's unread mail, as its feed tells the Gmail preview; matches the pin's "(3)". */
export const gmailInbox: GmailInbox = {
  unread: 3,
  messages: [
    message(
      'Priya Raman',
      'Design review moved to 3 pm',
      'Same room, same agenda. Bring the sidebar…',
      12,
    ),
    message(
      'GitHub',
      '[acme/web] Keep the sidebar open across restarts (#482)',
      'Approved: looks good once CI is green.',
      95,
    ),
    message(
      'Calendar',
      'Invitation: Sprint planning',
      'Thursday 10:00 – 11:00. Join with Google Meet.',
      60 * 26,
    ),
  ],
};

/** iCalendar's UTC form: 20261030T100000Z. */
const icsTime = (at: number) => new Date(at).toISOString().replace(/[-:]|\.\d{3}/g, '');
const icsDate = (at: number) => icsTime(at).slice(0, 8);

/**
 * Live Calendar's feed around `now`, as Google's private iCal address gives it: a call in 3 min,
 * a daily standup, tomorrow's planning, and two left out (a declined lunch, an all-day offsite).
 */
export function calendarFeed(now: number): string {
  const minute = 60_000;
  const start = Math.floor(now / minute) * minute;
  const event = (uid: string, from: number, minutes: number, ...lines: string[]) => [
    'BEGIN:VEVENT',
    `UID:${uid}@google.com`,
    `DTSTART:${icsTime(from)}`,
    `DTEND:${icsTime(from + minutes * minute)}`,
    ...lines,
    'END:VEVENT',
  ];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    ...event(
      'review',
      start + 3 * minute,
      30,
      'SUMMARY:Design review',
      'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
      'DESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij',
    ),
    ...event(
      'standup',
      start + 2 * 60 * minute - 24 * 60 * minute,
      15,
      'SUMMARY:Standup',
      'RRULE:FREQ=DAILY',
      'LOCATION:https://us02web.zoom.us/j/123456789',
    ),
    ...event(
      'lunch',
      start + 60 * minute,
      45,
      'SUMMARY:Team lunch',
      'ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com',
    ),
    ...event('planning', start + 20 * 60 * minute, 60, 'SUMMARY:Sprint planning'),
    'BEGIN:VEVENT',
    'UID:offsite@google.com',
    `DTSTART;VALUE=DATE:${icsDate(now)}`,
    'SUMMARY:Offsite',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** One coming in, one failed, one deleted, two from yesterday. */
export function downloadFixtures(now: number): DownloadEntry[] {
  const minutes = (n: number) => now - n * 60_000;
  const file = (
    id: number,
    name: string,
    url: string,
    startedAt: number,
    patch: Partial<DownloadEntry> = {},
  ): DownloadEntry => ({
    id,
    name,
    url,
    state: 'complete',
    received: 2_400_000,
    total: 2_400_000,
    startedAt,
    exists: true,
    paused: false,
    ...patch,
  });
  return [
    file(1, 'design-assets.zip', 'https://www.figma.com/exports/design-assets.zip', minutes(1), {
      state: 'in_progress',
      received: 19_200_000,
      total: 48_000_000,
    }),
    file(2, 'Q3 roadmap.pdf', 'https://docs.google.com/export/roadmap.pdf', minutes(20)),
    file(3, 'screenshot.png', 'https://github.com/acme/web/raw/screenshot.png', minutes(180), {
      received: 812_000,
      total: 812_000,
    }),
    file(4, 'invoice-2391.pdf', 'https://billing.example.com/invoice-2391.pdf', minutes(60 * 26), {
      exists: false,
    }),
    file(5, 'node-v22.pkg', 'https://nodejs.org/dist/node-v22.pkg', minutes(60 * 27), {
      state: 'interrupted',
      error: 'NETWORK_FAILED',
      received: 9_000_000,
      total: 80_000_000,
    }),
  ];
}
