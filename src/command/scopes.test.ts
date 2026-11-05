import { describe, expect, it } from 'vitest';
import { scopeFor } from './scopes';

describe('scopeFor', () => {
  it('picks a scope from "@" and the start of its name', () => {
    expect(scopeFor('@t')).toBe('tabs');
    expect(scopeFor('@HIST')).toBe('history');
    expect(scopeFor('@archive')).toBe('archive');
    expect(scopeFor('@')).toBeUndefined();
    expect(scopeFor('@x')).toBeUndefined();
    expect(scopeFor('tabs')).toBeUndefined();
  });
});
