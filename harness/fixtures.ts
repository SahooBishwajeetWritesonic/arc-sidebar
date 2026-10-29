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
