function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** Same page, ignoring the #fragment (Gmail and others change it constantly). */
export function isSamePage(a: string, b: string): boolean {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return a === b;
  return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
}

/** Looser match used to re-find a pinned tab after a restart. */
export function isSamePath(a: string, b: string): boolean {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return a === b;
  return x.origin === y.origin && x.pathname === y.pathname;
}

export function isDeveloperSite(developerSites: readonly string[], url: string): boolean {
  const host = parse(url)?.hostname.toLowerCase();
  return host !== undefined && host !== '' && developerSites.includes(host);
}

/** Second-level labels sold like top-level domains under a country's (co.uk, com.au). */
const SHARED_LABEL = /^(ac|co|com|edu|go|gov|ne|net|or|org)$/;

/**
 * A page's registered domain ("mail.google.com" → "google.com"), roughly, without the public
 * suffix list. IPs and single names (localhost) are their own site; "" with no host.
 */
export function siteOf(url: string): string {
  const host = parse(url)?.hostname.toLowerCase() ?? '';
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) return host;
  const labels = host.split('.');
  const shared =
    labels.length > 2 && labels.at(-1)!.length === 2 && SHARED_LABEL.test(labels.at(-2)!);
  return labels.slice(shared ? -3 : -2).join('.');
}

export function hostname(url: string): string {
  return parse(url)?.hostname.replace(/^www\./, '') ?? '';
}

/**
 * The URL bar's text: the site, as Arc shows it, or with Developer Mode the
 * whole address. Nothing for a new tab, which shows a prompt instead.
 */
export function addressLabel(url: string, full = false): string {
  if (!url || /^chrome:\/\/(newtab|new-tab-page)\/?$/.test(url)) return '';
  const parsed = parse(url);
  const web = parsed !== undefined && /^https?:$/.test(parsed.protocol);
  if (web && !full) return parsed.hostname.replace(/^www\./, '');
  return web ? url.replace(/^https?:\/\/(www\.)?/, '').replace(/^([^/?#]+)\/$/, '$1') : url;
}
