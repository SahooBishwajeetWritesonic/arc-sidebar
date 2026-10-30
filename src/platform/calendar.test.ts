import { describe, expect, it } from 'vitest';
import {
  NotACalendarError,
  callIn,
  countdown,
  feedOwner,
  feedUrl,
  liveMeeting,
  meetingToJoin,
  meetingsIn,
  type Meeting,
} from './calendar';

/** A Google feed's shape: a time zone, a meeting, a daily one with a skipped and a moved day. */
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Kolkata',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0530',
  'TZOFFSETTO:+0530',
  'TZNAME:IST',
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART:20261030T100000Z',
  'DTEND:20261030T103000Z',
  'UID:review@google.com',
  'SUMMARY:Design review',
  'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Asia/Kolkata:20261001T093000',
  'DTEND;TZID=Asia/Kolkata:20261001T094500',
  'RRULE:FREQ=DAILY',
  'EXDATE;TZID=Asia/Kolkata:20261029T093000',
  'UID:standup@google.com',
  'SUMMARY:Standup',
  'LOCATION:https://us02web.zoom.us/j/123456789?pwd=abc',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'RECURRENCE-ID;TZID=Asia/Kolkata:20261031T093000',
  'DTSTART;TZID=Asia/Kolkata:20261031T100000',
  'DTEND;TZID=Asia/Kolkata:20261031T101500',
  'UID:standup@google.com',
  'SUMMARY:Standup (moved)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261030T120000Z',
  'DTEND:20261030T130000Z',
  'UID:lunch@google.com',
  'SUMMARY:Lunch',
  'ATTENDEE;CN=me@example.com;PARTSTAT=DECLINED:mailto:me@example.com',
  'ATTENDEE;PARTSTAT=ACCEPTED:mailto:someone@example.com',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261030',
  'DTEND;VALUE=DATE:20261031',
  'UID:offsite@google.com',
  'SUMMARY:Offsite',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261030T140000Z',
  'DTEND:20261030T150000Z',
  'UID:cancelled@google.com',
  'STATUS:CANCELLED',
  'SUMMARY:Old sync',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const at = (iso: string) => Date.parse(iso);

describe('meetingsIn', () => {
  const from = at('2026-10-29T00:00:00Z');
  const to = at('2026-11-01T00:00:00Z');

  it('expands repeats, skipping a removed day and moving a changed one', () => {
    const meetings = meetingsIn(ICS, from, to, 'me@example.com');
    expect(meetings.map(({ title, start }) => [title, new Date(start).toISOString()])).toEqual([
      ['Standup', '2026-10-30T04:00:00.000Z'],
      ['Design review', '2026-10-30T10:00:00.000Z'],
      ['Standup (moved)', '2026-10-31T04:30:00.000Z'],
    ]);
    expect(meetings[0]).toMatchObject({
      end: at('2026-10-30T04:15:00Z'),
      joinUrl: 'https://us02web.zoom.us/j/123456789?pwd=abc',
    });
    expect(meetings[1]!.joinUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(new Set(meetings.map((meeting) => meeting.id)).size).toBe(3);
  });

  it('leaves out all-day and cancelled events, and what its owner declined', () => {
    const titles = (me?: string) => meetingsIn(ICS, from, to, me).map((meeting) => meeting.title);
    expect(titles('me@example.com')).not.toContain('Lunch');
    expect(titles()).toContain('Lunch');
    expect(titles()).not.toContain('Offsite');
    expect(titles()).not.toContain('Old sync');
  });

  it('keeps only what overlaps the window', () => {
    const titles = meetingsIn(ICS, at('2026-10-30T10:15:00Z'), at('2026-10-30T11:00:00Z')).map(
      (meeting) => meeting.title,
    );
    expect(titles).toEqual(['Design review']);
  });

  it('refuses what isn’t a calendar', () => {
    expect(() => meetingsIn('<!doctype html><title>Sign in</title>', from, to)).toThrow(
      NotACalendarError,
    );
    expect(() => meetingsIn('BEGIN:VCARD\r\nEND:VCARD', from, to)).toThrow(NotACalendarError);
  });
});

describe('feeds', () => {
  it('reads webcal:// as https, and refuses what isn’t an address', () => {
    expect(feedUrl(' webcal://example.com/cal.ics ')).toBe('https://example.com/cal.ics');
    expect(feedUrl('not a link')).toBeUndefined();
    expect(feedUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('finds whose a Google calendar is from its address', () => {
    const feed = 'https://calendar.google.com/calendar/ical/Me%40example.com/private-abc/basic.ics';
    expect(feedOwner(feed)).toBe('me@example.com');
    expect(
      feedOwner('https://outlook.office365.com/owa/calendar/x/y/calendar.ics'),
    ).toBeUndefined();
  });

  it('finds the call in a meeting’s place or notes', () => {
    expect(
      callIn(undefined, 'Room 4', 'Join: https://teams.microsoft.com/l/meetup-join/19%3a1.'),
    ).toBe('https://teams.microsoft.com/l/meetup-join/19%3a1');
    expect(callIn('<a href="https://zoom.us/j/9?pwd=a&amp;b=c">Zoom</a>')).toBe(
      'https://zoom.us/j/9?pwd=a&b=c',
    );
    expect(callIn('https://example.com/agenda')).toBeUndefined();
  });
});

describe('the live meeting', () => {
  const minute = 60_000;
  const meeting = (id: string, start: number, end: number, joinUrl?: string): Meeting => ({
    id,
    title: id,
    start: start * minute,
    end: end * minute,
    joinUrl,
  });
  const under = meeting('under way', 0, 60, 'https://meet.google.com/aaa-bbbb-ccc');
  const next = meeting('next', 58, 90);

  it('is the one about to start, or else the one under way', () => {
    expect(liveMeeting([under, next], 50 * minute, 5 * minute)).toBe(under);
    expect(liveMeeting([under, next], 54 * minute, 5 * minute)).toBe(next);
    expect(liveMeeting([under, next], 95 * minute, 5 * minute)).toBeUndefined();
    expect(meetingToJoin([under, next], 54 * minute, 5 * minute)).toBe(under);
  });

  it('counts down to the start, then shows what’s left', () => {
    expect(countdown(next, 53.5 * minute)).toBe('in 5 min');
    expect(countdown(under, 40 * minute)).toBe('Now · 20 min left');
    expect(countdown(meeting('zero', 0, 0), 0)).toBe('Now');
  });
});
