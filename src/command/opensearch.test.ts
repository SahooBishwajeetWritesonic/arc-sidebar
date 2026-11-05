import { describe, expect, it } from 'vitest';
import { parseSuggestions } from './opensearch';

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
