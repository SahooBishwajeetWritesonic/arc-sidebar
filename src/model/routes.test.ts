import { describe, expect, it } from 'vitest';
import { routeFor } from './routes';
import type { Route } from './types';

const route = (id: string, match: Route['match'], text: string): Route => ({
  id,
  match,
  text,
  spaceId: id,
});

describe('routeFor', () => {
  it('takes the first rule that matches', () => {
    const routes = [
      route('docs', 'contains', 'Docs.Google.com'),
      route('google', 'contains', 'google'),
    ];
    expect(routeFor(routes, 'https://docs.google.com/document/d/1')?.id).toBe('docs');
    expect(routeFor(routes, 'https://www.google.com/search?q=arc')?.id).toBe('google');
    expect(routeFor(routes, 'https://example.com/')).toBeUndefined();
  });

  it('matches "is" against the page, with or without https://', () => {
    const routes = [route('pulls', 'is', 'github.com/pulls')];
    expect(routeFor(routes, 'https://github.com/pulls#top')?.id).toBe('pulls');
    expect(routeFor(routes, 'https://github.com/pulls/review')).toBeUndefined();
  });
});
