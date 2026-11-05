import { describe, expect, it } from 'vitest';
import { isStrong, ranked, score } from './match';

describe('score', () => {
  it('needs every word and prefers word starts', () => {
    expect(score('Sidebar explorations – Figma', 'fig')).toBe(3);
    expect(score('Sidebar explorations – Figma', 'side')).toBe(4);
    expect(score('Sidebar explorations – Figma', 'plor')).toBe(1);
    expect(score('Sidebar explorations – Figma', 'fig side')).toBe(7);
    expect(score('Sidebar explorations – Figma', 'fig notion')).toBe(0);
  });

  it('finds a word’s letters in order from a word start, scoring under one typed as is', () => {
    const github = score('GitHub github.com', 'gthb');
    expect(github).toBeGreaterThan(0);
    expect(github).toBeLessThan(1);
    expect(score('React docs react.dev/learn', 'rctdoc')).toBeGreaterThan(0);
    expect(score('Hacker News news.ycombinator.com', 'hckr nws')).toBeGreaterThan(0);
    expect(isStrong(score('GitHub github.com', 'gthb'), 'gthb')).toBe(false);
  });

  it('prefers letters close together and at word starts', () => {
    expect(score('React docs', 'rctdoc')).toBeGreaterThan(
      score('Recent cat videos docs', 'rctdoc'),
    );
  });

  it('leaves out letters that don’t start a word, are spread out or come in another order', () => {
    expect(score('Shopping cart', 'hop')).toBe(1); // inside a word, as typed
    expect(score('Shopping cart', 'hpc')).toBe(0); // fuzzy needs a word start
    expect(score('GitHub', 'gh')).toBe(0); // two letters: as typed only
    expect(score('GitHub', 'hbg')).toBe(0);
    expect(score('g is for a very long title with h and b far away', 'ghb')).toBe(0);
  });
});

describe('ranked', () => {
  const items = [{ text: 'Gist' }, { text: 'GitHub' }, { text: 'GitLab' }];

  it('orders by points, then a bonus, then the shorter text', () => {
    expect(ranked(items, 'gi').map(({ item }) => item.text)).toEqual(['Gist', 'GitHub', 'GitLab']);
    const bonus = (item: { text: string }) => (item.text === 'GitLab' ? 0.5 : 0);
    expect(ranked(items, 'gi', { bonus }).map(({ item }) => item.text)[0]).toBe('GitLab');
  });
});
