import { describe, expect, it } from 'vitest';
import { learnedTarget, learnPick, pickTarget } from './picks';

const NOW = Date.UTC(2026, 10, 6);
const DAY = 86_400_000;

describe('learned picks', () => {
  it('goes first once picked twice after typing this, or more of it', () => {
    let picks = learnPick([], 'gm', 'pin:gmail', NOW);
    expect(learnedTarget(picks, 'gm', NOW)).toBeNull();
    picks = learnPick(picks, 'GMa ', 'pin:gmail', NOW);
    expect(learnedTarget(picks, 'gm', NOW)).toBe('pin:gmail');
    expect(learnedTarget(picks, 'gma', NOW)).toBeNull(); // picked once after "gma"
    expect(learnedTarget(picks, 'g', NOW)).toBeNull(); // too little typed
  });

  it('prefers the target picked most, and forgets old picks', () => {
    let picks = learnPick([], 'fi', 'url:https://figma.com/', NOW - 90 * DAY);
    picks = learnPick(picks, 'fi', 'url:https://figma.com/', NOW - 90 * DAY);
    picks = learnPick(picks, 'fi', 'url:https://www.figma.com/file/abc', NOW);
    picks = learnPick(picks, 'fil', 'url:https://www.figma.com/file/abc', NOW);
    expect(learnedTarget(picks, 'fi', NOW)).toBe('url:https://www.figma.com/file/abc');
  });

  it('learns pins, spaces and actions by id, pages by address, and not searches', () => {
    const row = (key: string, url?: string) =>
      ({ key, url, title: '', hint: '', command: { type: 'search', text: '' } }) as const;
    expect(pickTarget(row('pin:gmail', 'https://mail.google.com/'))).toBe('pin:gmail');
    expect(pickTarget(row('tab:12', 'https://figma.com/'))).toBe('url:https://figma.com/');
    expect(pickTarget(row('action:splitView:'))).toBe('action:splitView:');
    expect(pickTarget(row('search'))).toBeNull();
    expect(pickTarget(row('open-url', 'https://arc.net'))).toBeNull();
  });
});
