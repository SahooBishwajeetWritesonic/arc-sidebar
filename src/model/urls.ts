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

export function hostname(url: string): string {
  return parse(url)?.hostname.replace(/^www\./, '') ?? '';
}
