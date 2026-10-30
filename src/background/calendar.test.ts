import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarState } from '@/platform/calendar';

const stored = vi.hoisted(() => ({
  calendar: null as CalendarState | null,
}));
vi.mock('@/platform/storage-items', () => ({
  calendarItem: {
    getValue: async () => stored.calendar,
    setValue: async (value: CalendarState | null) => void (stored.calendar = value),
  },
}));

const { refreshCalendar } = await import('./calendar');

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
    Object.assign(stored, { calendar: null });
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
});
