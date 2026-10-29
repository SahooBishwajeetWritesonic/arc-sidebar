import { describe, expect, it } from 'vitest';
import { siteOf } from '@/model/urls';
import { linkChoice, PEEK_SETTLE_MS, peeksClosedBy } from './peek';

describe('siteOf', () => {
  it('is the registered domain, under shared country labels too', () => {
    expect(siteOf('https://mail.google.com/mail/u/0/')).toBe('google.com');
    expect(siteOf('https://www.bbc.co.uk/news')).toBe('bbc.co.uk');
    expect(siteOf('https://example.io/')).toBe('example.io');
  });

  it('keeps addresses and single names whole', () => {
    expect(siteOf('http://localhost:5173/')).toBe('localhost');
    expect(siteOf('http://127.0.0.1:8080/a')).toBe('127.0.0.1');
    expect(siteOf('http://[::1]:3000/')).toBe('[::1]');
    expect(siteOf('not a url')).toBe('');
  });
});

describe('linkChoice', () => {
  const pinned = { shift: false, pinned: true };
  const today = { shift: false, pinned: false };

  it('peeks at links to other sites from a pinned tab, not within its own site', () => {
    expect(linkChoice('https://mail.google.com/', 'https://figma.com/file/1', pinned)).toBe('peek');
    expect(linkChoice('https://mail.google.com/', 'https://docs.google.com/d/1', pinned)).toBe(
      null,
    );
    expect(linkChoice('https://linear.app/', 'https://figma.com/', today)).toBe(null);
  });

  it('opens meeting links in a tab', () => {
    expect(linkChoice('https://calendar.google.com/', 'https://meet.google.com/abc', pinned)).toBe(
      null, // the same site as the calendar
    );
    expect(linkChoice('https://linear.app/', 'https://meet.google.com/abc', pinned)).toBe('tab');
    expect(linkChoice('https://linear.app/', 'https://us02web.zoom.us/j/1', pinned)).toBe('tab');
  });

  it('peeks at any web page on Shift-click, and leaves other links alone', () => {
    expect(
      linkChoice('https://linear.app/', 'https://linear.app/team', { ...today, shift: true }),
    ).toBe('peek');
    expect(linkChoice('https://linear.app/', 'mailto:a@b.c', { ...pinned, shift: true })).toBe(
      null,
    );
    expect(linkChoice('https://linear.app/', 'javascript:void 0', pinned)).toBe(null);
  });
});

describe('peeksClosedBy', () => {
  const floating = {
    '10': { kind: 'peek' as const, from: 1, openedAt: 0 },
    '11': { kind: 'little' as const, from: 1, openedAt: 0 },
    '12': { kind: 'peek' as const, from: 2, openedAt: 0 },
    '13': { kind: 'peek' as const, from: 1, openedAt: 5000 },
  };

  it('closes the Peeks over the window that took focus, not a Little Arc', () => {
    expect(peeksClosedBy(floating, 1, 5000 + PEEK_SETTLE_MS)).toEqual([10, 13]);
  });

  it('keeps a Peek that has only just opened', () => {
    expect(peeksClosedBy(floating, 1, 5000 + PEEK_SETTLE_MS - 1)).toEqual([10]);
  });

  it('keeps them when focus leaves Chrome or goes to a Peek', () => {
    expect(peeksClosedBy(floating, -1, 9000)).toEqual([]);
    expect(peeksClosedBy(floating, 10, 9000)).toEqual([]);
  });
});
