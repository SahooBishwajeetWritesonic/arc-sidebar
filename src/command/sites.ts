/**
 * Arc's Site Search: a site's keyword ("yt"), then Tab, searches that site.
 * Chrome doesn't let extensions list its search engines, so these are the common ones.
 */
export interface Site {
  name: string;
  /** What to type before Tab; the name works too. */
  keywords: string[];
  /** The search page, with %s for what's searched. */
  search: string;
}

// No one-letter keywords: Tab after a letter searches actions instead.
export const SITES: Site[] = [
  { name: 'Google', keywords: [], search: 'https://www.google.com/search?q=%s' },
  { name: 'YouTube', keywords: ['yt'], search: 'https://www.youtube.com/results?search_query=%s' },
  { name: 'Google Maps', keywords: ['maps'], search: 'https://www.google.com/maps/search/%s' },
  {
    name: 'Google Drive',
    keywords: ['drive'],
    search: 'https://drive.google.com/drive/search?q=%s',
  },
  {
    name: 'Wikipedia',
    keywords: ['wiki'],
    search: 'https://en.wikipedia.org/wiki/Special:Search?search=%s',
  },
  { name: 'GitHub', keywords: ['gh'], search: 'https://github.com/search?q=%s' },
  { name: 'Stack Overflow', keywords: ['so'], search: 'https://stackoverflow.com/search?q=%s' },
  { name: 'MDN', keywords: ['mdn'], search: 'https://developer.mozilla.org/en-US/search?q=%s' },
  { name: 'npm', keywords: ['npm'], search: 'https://www.npmjs.com/search?q=%s' },
  { name: 'Reddit', keywords: [], search: 'https://www.reddit.com/search/?q=%s' },
  { name: 'X', keywords: ['twitter'], search: 'https://x.com/search?q=%s' },
  { name: 'Amazon', keywords: [], search: 'https://www.amazon.com/s?k=%s' },
];

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');

/** The site whose keyword or name is exactly what's typed (two letters or more). */
export function siteFor(typed: string): Site | undefined {
  const text = squash(typed);
  if (text.length < 2) return undefined;
  return SITES.find((site) => site.keywords.includes(text) || squash(site.name) === text);
}

export const siteSearchUrl = (site: Site, query: string) =>
  site.search.replace('%s', encodeURIComponent(query.trim()));
