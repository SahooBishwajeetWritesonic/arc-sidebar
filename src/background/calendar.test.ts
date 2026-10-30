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

const { joinMeeting, refreshCalendar } = await import('./calendar');

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
