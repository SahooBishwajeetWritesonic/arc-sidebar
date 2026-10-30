import { describe, expect, it } from 'vitest';
import { siteFor, siteSearchUrl } from './sites';

describe('Site Search', () => {
  it('finds a site by its keyword or its name, not by one letter', () => {
    expect(siteFor('yt')?.name).toBe('YouTube');
    expect(siteFor(' YouTube ')?.name).toBe('YouTube');
    expect(siteFor('google maps')?.name).toBe('Google Maps');
    expect(siteFor('x')).toBeUndefined();
    expect(siteFor('youtu')).toBeUndefined();
  });

  it('puts what’s searched into the site’s search page', () => {
    expect(siteSearchUrl(siteFor('yt')!, ' lofi & chill ')).toBe(
      'https://www.youtube.com/results?search_query=lofi%20%26%20chill',
    );
  });
});
