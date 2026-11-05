import { describe, expect, it } from 'vitest';
import {
  hexColor,
  keywordFor,
  parseOpenSearch,
  parseSuggestions,
  searchFromPage,
} from './opensearch';

const description = (urls: string, name = 'Kagi') => `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${name}</ShortName>
  ${urls}
</OpenSearchDescription>`;

describe('parseOpenSearch', () => {
  it('reads the name, the search page and the suggestions', () => {
    const xml = description(`
      <Url type="text/html" method="get" template="https://kagi.com/search?q={searchTerms}"/>
      <Url type="application/x-suggestions+json"
           template="https://kagi.com/api/autosuggest?q={searchTerms}"/>`);
    expect(parseOpenSearch(xml, 'https://kagi.com/opensearch.xml')).toEqual({
      name: 'Kagi',
      url: 'https://kagi.com/search?q=%s',
      suggest: 'https://kagi.com/api/autosuggest?q=%s',
    });
  });

  it('fills the other placeholders, resolves relative addresses and reads entities', () => {
    const xml = description(
      `<os:Url type="text/html"
         template="/results?search_query={searchTerms}&amp;page={startPage?}&amp;ie={inputEncoding}&amp;n={count}"/>`,
      'You &amp; Tube',
    );
    expect(parseOpenSearch(xml, 'https://www.youtube.com/opensearch?locale=en_US')).toEqual({
      name: 'You & Tube',
      url: 'https://www.youtube.com/results?search_query=%s&page=&ie=UTF-8&n=20',
    });
  });

  it('adds Param children to the address', () => {
    const xml = description(`
      <Url type="text/html" template="https://example.com/find">
        <Param name="q" value="{searchTerms}"/>
        <Param name="src" value="opensearch"/>
      </Url>`);
    expect(parseOpenSearch(xml, 'https://example.com/os.xml')?.url).toBe(
      'https://example.com/find?q=%s&src=opensearch',
    );
  });

  it('names the site by its host when the file doesn’t', () => {
    const xml = description(
      `<Url type="text/html" template="https://www.example.org/s?q={searchTerms}"/>`,
      '',
    );
    expect(parseOpenSearch(xml, 'https://example.org/os.xml')?.name).toBe('example.org');
  });

  it('finds nothing without a search page the bar can open', () => {
    const post = `<Url type="text/html" method="post" template="https://a.com/s?q={searchTerms}"/>`;
    expect(parseOpenSearch(description(post), 'https://a.com/')).toBeNull();
    const noTerms = `<Url type="text/html" template="https://a.com/browse"/>`;
    expect(parseOpenSearch(description(noTerms), 'https://a.com/')).toBeNull();
    const script = `<Url type="text/html" template="javascript:alert('{searchTerms}')"/>`;
    expect(parseOpenSearch(description(script), 'https://a.com/')).toBeNull();
    expect(parseOpenSearch('not xml', 'https://a.com/')).toBeNull();
  });
});

describe('searchFromPage', () => {
  it('turns a results page into a search address', () => {
    expect(searchFromPage('https://duckduckgo.com/?q=cats&ia=web')).toBe(
      'https://duckduckgo.com/?q=%s&ia=web',
    );
    expect(searchFromPage('https://www.amazon.com/s?k=lamp#top')).toBe(
      'https://www.amazon.com/s?k=%s',
    );
  });

  it('finds the search in the path, after /search/', () => {
    expect(searchFromPage('https://hackertube.org/search/test')).toBe(
      'https://hackertube.org/search/%s',
    );
    expect(searchFromPage('https://example.com/s/red%20shoes/page/2')).toBe(
      'https://example.com/s/%s/page/2',
    );
  });

  it('finds the search box’s text wherever it is in the address', () => {
    expect(searchFromPage('https://example.com/videos/red%20shoes', 'Red shoes')).toBe(
      'https://example.com/videos/%s',
    );
    expect(searchFromPage('https://example.com/find?term=x&what=lamps', 'lamps')).toBe(
      'https://example.com/find?term=x&what=%s',
    );
    // Not there: the usual places.
    expect(searchFromPage('https://example.com/?q=cats', 'dogs')).toBe('https://example.com/?q=%s');
  });

  it('needs something searched on a web page', () => {
    expect(searchFromPage('https://example.com/?q=')).toBeNull();
    expect(searchFromPage('https://example.com/about')).toBeNull();
    expect(searchFromPage('https://example.com/search/')).toBeNull();
    expect(searchFromPage('chrome://history/?q=cats')).toBeNull();
  });
});

describe('parseSuggestions', () => {
  it('reads OpenSearch’s suggestions', () => {
    expect(parseSuggestions('["lofi",["lofi beats","lofi girl"],[],[]]')).toEqual([
      'lofi beats',
      'lofi girl',
    ]);
    expect(parseSuggestions('{"no":"list"}')).toEqual([]);
    expect(parseSuggestions('<html>')).toEqual([]);
  });
});

describe('a found site’s keyword and colour', () => {
  it('starts with the site’s main name, unless it’s taken', () => {
    expect(keywordFor('https://kagi.com/search?q=%s', new Set())).toBe('kagi');
    expect(keywordFor('https://search.brave.com/search?q=%s', new Set())).toBe('brave');
    expect(keywordFor('https://kagi.com/search?q=%s', new Set(['kagi']))).toBe('');
  });

  it('takes a theme colour that isn’t near white or black', () => {
    expect(hexColor('#FFB319')).toBe('#ffb319');
    expect(hexColor(' #f80 ')).toBe('#ff8800');
    expect(hexColor('#ffffff')).toBeUndefined();
    expect(hexColor('#0a0a0a')).toBeUndefined();
    expect(hexColor('rgb(1, 2, 3)')).toBeUndefined();
    expect(hexColor(undefined)).toBeUndefined();
  });
});
