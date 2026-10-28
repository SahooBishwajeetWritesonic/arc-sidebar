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
