import { hostname } from '@/model/urls';

export interface FoundSiteSearch {
  name: string;
  url: string;
  suggest?: string;
  color?: string;
}

/** Stands in for %s while the address goes through URL, which would encode a bare %. */
const TERMS = 'ARCSEARCHTERMS';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (entity, name: string) =>
    name.startsWith('#')
      ? String.fromCodePoint(
          name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)),
        )
      : (ENTITIES[name] ?? entity),
  );

function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, , double, single] of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    found[name!.toLowerCase()] = decode(double ?? single ?? '');
  }
  return found;
}

interface UrlTag {
  type: string;
  method: string;
  template: string;
  params: Record<string, string>[];
}

// Element names may carry a namespace prefix (os:Url).
const URL_TAG = /<(?:[\w-]+:)?Url\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?Url>)/g;
const PARAM_TAG = /<(?:[\w-]+:)?Param\b([^>]*?)\/?>/g;

/** OpenSearch's {placeholders}: the search, and the few others a template may use. */
function fillPlaceholders(text: string): string {
  return text.replace(/\{([^}]+?)(\?)?\}/g, (_whole, name: string, optional?: string) => {
    const local = name.replace(/^[\w-]+:/, '');
    if (local === 'searchTerms') return TERMS;
    if (local === 'inputEncoding' || local === 'outputEncoding') return 'UTF-8';
    if (optional) return '';
    if (local === 'startIndex' || local === 'startPage') return '1';
    if (local === 'count') return '20';
    if (local === 'language') return '*';
    return '';
  });
}

function toTemplate({ template, params }: UrlTag, base: string): string | null {
  let url: URL;
  try {
    url = new URL(fillPlaceholders(template), base);
  } catch {
    return null;
  }
  for (const param of params) {
    if (param.name) url.searchParams.append(param.name, fillPlaceholders(param.value ?? ''));
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const href = url.href.replace(TERMS, '%s');
  return href.includes('%s') && !href.includes(TERMS) ? href : null;
}

/** As Chrome reads one to add a search engine. Null without a search page that takes a GET. */
export function parseOpenSearch(xml: string, base: string): Omit<FoundSiteSearch, 'color'> | null {
  const urls: UrlTag[] = [...xml.matchAll(URL_TAG)].map(([, tag = '', body = '']) => {
    const found = attributes(tag);
    return {
      type: (found.type ?? '').toLowerCase(),
      method: (found.method ?? 'get').toLowerCase(),
      template: found.template ?? '',
      params: [...body.matchAll(PARAM_TAG)].map(([, param = '']) => attributes(param)),
    };
  });
  const pick = (type: string) =>
    urls.find((url) => url.type === type && url.method === 'get' && url.template);
  const page = pick('text/html');
  const url = page && toTemplate(page, base);
  if (!url) return null;
  const suggestTag = pick('application/x-suggestions+json');
  const suggest = suggestTag && toTemplate(suggestTag, base);
  const shortName = /<(?:[\w-]+:)?ShortName>([\s\S]*?)<\//.exec(xml)?.[1];
  const name = decode(shortName ?? '').trim() || siteName(url);
  return { name, url, ...(suggest && { suggest }) };
}

/** Where sites commonly put what was searched: ?q=cats, or /search/cats. */
const SEARCH_PARAMS = ['q', 'query', 'search_query', 'search', 'k', 'p', 'keywords', 'term', 's'];
const SEARCH_SEGMENTS = new Set(['search', 'results', 'find', 'query', 's', 'q']);

const decodeSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * A results page as a search address: where the search box's text is in it, else a common
 * parameter (?q=cats), else the part after /search/.
 */
export function searchFromPage(page: string, searchText?: string): string | null {
  let url: URL;
  try {
    url = new URL(page);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.hash = '';
  const done = () => url.href.replace(TERMS, '%s');
  const segments = url.pathname.split('/');
  const typed = searchText?.trim().toLowerCase();

  if (typed) {
    const param = [...url.searchParams].find(([, value]) => value.trim().toLowerCase() === typed);
    if (param) {
      url.searchParams.set(param[0], TERMS);
      return done();
    }
    const at = segments.findIndex((segment) => decodeSegment(segment).toLowerCase() === typed);
    if (at > 0) {
      segments[at] = TERMS;
      url.pathname = segments.join('/');
      return done();
    }
  }
  const param = SEARCH_PARAMS.find((name) => url.searchParams.get(name)?.trim());
  if (param) {
    url.searchParams.set(param, TERMS);
    return done();
  }
  const at = segments.findIndex(
    (segment, i) => SEARCH_SEGMENTS.has(segment.toLowerCase()) && !!segments[i + 1],
  );
  if (at !== -1) {
    segments[at + 1] = TERMS;
    url.pathname = segments.join('/');
    return done();
  }
  return null;
}

/** OpenSearch's format: [query, [suggestion, …], …]. */
export function parseSuggestions(json: string): string[] {
  try {
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    return data[1].filter((item): item is string => typeof item === 'string' && !!item.trim());
  } catch {
    return [];
  }
}

/** Hex only, and not near white or black. */
export function hexColor(color: string | undefined): string | undefined {
  const text = color?.trim().toLowerCase() ?? '';
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : text;
  if (!/^#[0-9a-f]{6}$/.test(hex)) return undefined;
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const plain = channels.every((c) => c > 235) || channels.every((c) => c < 25);
  return plain ? undefined : hex;
}

export const siteName = (url: string) => hostname(url.replace('%s', ''));

/** The site's main name ("kagi"), unless it's taken. */
export function keywordFor(url: string, taken: ReadonlySet<string>): string {
  const labels = siteName(url).split('.');
  const main = (labels.length > 1 ? labels.at(-2) : labels[0])?.toLowerCase() ?? '';
  return main.length >= 2 && !taken.has(main) ? main : '';
}
