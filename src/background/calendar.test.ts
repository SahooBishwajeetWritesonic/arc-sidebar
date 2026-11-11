import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarState } from '@/platform/calendar';

const stored = vi.hoisted(() => ({
  calendar: null as CalendarState | null,
  opened: [] as { windowId: number; url: string }[],
  notes: [] as string[],
}));
vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      create: async (tab: { windowId: number; url: string }) => void stored.opened.push(tab),
    },
  },
}));
vi.mock('@/platform/storage-items', () => ({
  calendarItem: {
    getValue: async () => stored.calendar,
    setValue: async (value: CalendarState | null) => void (stored.calendar = value),
  },
}));
vi.mock('./copy', () => ({
  showNote: async (_windowId: number, text: string) => void stored.notes.push(text),
}));

const { joinMeeting, noteTabShown, noteWindowFocused, refreshCalendar, seedShownTabs } =
  await import('./calendar');

const FEED = 'https://calendar.google.com/calendar/ical/me%40example.com/private-abc/basic.ics';
const NOW = Date.parse('2026-10-30T09:55:00Z');
const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART:20261030T100000Z',
  'DTEND:20261030T103000Z',
  'UID:review@google.com',
  'SUMMARY:Design review',
  'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const answer = (body: string, status = 200) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('Live Calendar in the background', () => {
  beforeEach(() => {
    Object.assign(stored, { calendar: null, opened: [], notes: [] });
  });

  it('keeps the feed’s coming meetings, and forgets them when turned off', async () => {
    await refreshCalendar(FEED, answer(ICS), () => NOW);
    expect(stored.calendar).toMatchObject({ feed: FEED, checkedAt: NOW });
    expect(stored.calendar!.meetings.map((meeting) => meeting.title)).toEqual(['Design review']);
    await refreshCalendar(null);
    expect(stored.calendar).toBeNull();
  });

  it('says why a read failed, keeping the last good meetings', async () => {
    await refreshCalendar(FEED, answer(ICS), () => NOW);
    await refreshCalendar(FEED, answer('Not found', 404), () => NOW);
    expect(stored.calendar).toMatchObject({ problem: 'No calendar at this address' });
    expect(stored.calendar!.meetings).toHaveLength(1);

    await refreshCalendar(FEED, answer('<html>Sign in</html>'), () => NOW);
    expect(stored.calendar!.problem).toBe('This address isn’t a calendar');
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await refreshCalendar('https://example.com/other.ics', offline, () => NOW);
    expect(stored.calendar).toMatchObject({ problem: 'Couldn’t reach the calendar', meetings: [] });
  });

  it('reads a Live Calendar script with your Google login, and only a script', async () => {
    const SCRIPT = 'https://script.google.com/a/macros/acme.com/s/AKfy-123_x/exec';
    const asked: RequestInit[] = [];
    const answering = (body: string, url = '') =>
      (async (_input: RequestInfo | URL, init: RequestInit) => {
        asked.push(init);
        const response = new Response(body);
        Object.defineProperty(response, 'url', { value: url });
        return response;
      }) as unknown as typeof fetch;

    await refreshCalendar(SCRIPT, answering(ICS), () => NOW);
    expect(asked.at(-1)!.credentials).toBe('include');
    expect(stored.calendar!.meetings.map((meeting) => meeting.title)).toEqual(['Design review']);

    // Signed out of Google: it asks you to sign in, and keeps the last meetings.
    const signIn = 'https://www.google.com/a/acme.com/ServiceLogin?continue=https%3A%2F%2Fscript';
    await refreshCalendar(SCRIPT, answering('<html>Sign in</html>', signIn), () => NOW);
    expect(stored.calendar).toMatchObject({
      problem: 'Sign in to Google in Chrome to read this calendar',
    });
    expect(stored.calendar!.meetings).toHaveLength(1);

    await refreshCalendar(FEED, answering(ICS), () => NOW);
    expect(asked.at(-1)!.credentials).toBe('omit');
  });

  it('re-reads a moment after you leave the calendar’s tab or window, once', async () => {
    vi.useFakeTimers();
    const reads = vi.fn(async () => new Response(ICS));
    vi.stubGlobal('fetch', reads);
    const calendar = { tabId: 7, feed: FEED };
    try {
      seedShownTabs([{ id: 7, windowId: 1 }]);
      // Into another tab and back, then away again: one read, after the moment.
      noteTabShown(3, 1, calendar);
      noteTabShown(7, 1, calendar);
      noteTabShown(4, 1, calendar);
      await vi.advanceTimersByTimeAsync(2_900);
      expect(reads).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(reads).toHaveBeenCalledTimes(1);

      // Leaving a tab that isn't the calendar's reads nothing.
      noteTabShown(5, 1, calendar);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(reads).toHaveBeenCalledTimes(1);

      // Leaving the window while it shows the calendar, for another app (no window).
      noteTabShown(7, 1, calendar);
      await vi.advanceTimersByTimeAsync(5_000);
      noteWindowFocused(1, calendar);
      noteWindowFocused(-1, calendar);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(reads).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('joins the meeting about to start, or says there’s none', async () => {
    await refreshCalendar(FEED, answer(ICS), () => NOW);
    const calendar = { feed: FEED, itemId: 'p1', before: 5 };
    await joinMeeting(1, calendar, NOW);
    expect(stored.opened).toEqual([{ windowId: 1, url: 'https://meet.google.com/abc-defg-hij' }]);
    await joinMeeting(1, calendar, NOW - 3600_000);
    await joinMeeting(1, null, NOW);
    expect(stored.notes).toEqual([
      'No meeting to join right now',
      'Turn on Live Calendar to join meetings',
    ]);
  });
});
