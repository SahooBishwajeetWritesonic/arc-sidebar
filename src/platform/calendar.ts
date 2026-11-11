import ICAL from 'ical.js';

/** A meeting from the calendar's feed: one occurrence, for a repeating one. */
export interface Meeting {
  /** The event's id and, for a repeat, which one. */
  id: string;
  title: string;
  start: number;
  end: number;
  joinUrl?: string;
}

/** What the background last read from the Live Calendar's feed. */
export interface CalendarState {
  /** The address it was read from: another address's meetings aren't shown. */
  feed: string;
  meetings: Meeting[];
  checkedAt: number;
  /** Why the last read didn't work, if it didn't (the meetings are the last good ones). */
  problem?: string;
}

export class NotACalendarError extends Error {}

/** Video calls an invitation can carry; the first one found joins. */
const CALL = new RegExp(
  'https://(?:' +
    [
      String.raw`meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}`,
      String.raw`(?:[\w-]+\.)?zoom\.us/(?:j|my|w)/[^\s"<>]+`,
      String.raw`teams\.microsoft\.com/(?:l/meetup-join|meet)/[^\s"<>]+`,
      String.raw`teams\.live\.com/meet/[^\s"<>]+`,
      String.raw`[\w-]+\.webex\.com/[^\s"<>]+`,
      String.raw`whereby\.com/[^\s"<>]+`,
      String.raw`app\.slack\.com/huddle/[^\s"<>]+`,
    ].join('|') +
    ')',
  'i',
);

/** The first video call link in an event's fields (Google's own, its place, its notes). */
export function callIn(...texts: (string | undefined)[]): string | undefined {
  for (const text of texts) {
    const found = text?.match(CALL)?.[0];
    if (found) return found.replace(/[).,;]+$/, '').replaceAll('&amp;', '&');
  }
}

/** Pages that are a calendar, for Live Calendar's menu item: Google's or Outlook's. */
export function isCalendarPage(url: string): boolean {
  return /^https:\/\/(calendar\.google\.com\/|outlook\.(office|office365|live)\.com\/calendar)/.test(
    url,
  );
}

/** A calendar's address as Chrome can read it (webcal:// is https), or undefined. */
export function feedUrl(text: string): string | undefined {
  try {
    const url = new URL(text.trim().replace(/^webcals?:\/\//i, 'https://'));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A Live Calendar script's web app, for when secret iCal links are off. Only you can read it. */
export function isCalendarScript(feed: string): boolean {
  return /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec(?:[?#]|$)/.test(
    feed,
  );
}

/** Whose a Google calendar's feed is (its address names them), to leave out what they declined. */
export function feedOwner(feed: string): string | undefined {
  const id = /\/calendar\/ical\/([^/]+)\//.exec(feed)?.[1];
  const owner = id && decodeURIComponent(id).toLowerCase();
  return owner && owner.includes('@') ? owner : undefined;
}

const DAY = 24 * 3600_000;
/** A repeating event's occurrences are counted at most this far: decades of a daily one. */
const MAX_OCCURRENCES = 20_000;

function declined(event: ICAL.Event, me: string | undefined) {
  return (
    me !== undefined &&
    event.attendees.some(
      (attendee) =>
        String(attendee.getFirstValue()).toLowerCase() === `mailto:${me}` &&
        String(attendee.getParameter('partstat')).toUpperCase() === 'DECLINED',
    )
  );
}

/**
 * Meetings in an iCalendar feed overlapping `from`–`to`, soonest first, repeats expanded.
 * Like Arc, leaves out all-day, cancelled and `me`-declined events.
 */
export function meetingsIn(ics: string, from: number, to: number, me?: string): Meeting[] {
  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(ics));
  } catch {
    throw new NotACalendarError();
  }
  if (calendar.name !== 'vcalendar') throw new NotACalendarError();
  for (const zone of calendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(zone);
  }

  const events = new Map<string, ICAL.Event>();
  const moved: ICAL.Event[] = [];
  for (const component of calendar.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) moved.push(event);
    else events.set(event.uid, event);
  }
  const strays: ICAL.Event[] = [];
  for (const event of moved) {
    const repeating = events.get(event.uid);
    if (repeating) repeating.relateException(event);
    else strays.push(event);
  }

  const meetings: Meeting[] = [];
  function add(event: ICAL.Event, startTime: ICAL.Time, endTime: ICAL.Time, id: string) {
    if (startTime.isDate) return;
    const start = startTime.toJSDate().getTime();
    const end = Math.max(endTime.toJSDate().getTime(), start);
    if (end <= from || start >= to) return;
    const status = String(event.component.getFirstPropertyValue('status') ?? '');
    if (status.toUpperCase() === 'CANCELLED' || declined(event, me)) return;
    const conference = event.component.getFirstPropertyValue('x-google-conference');
    meetings.push({
      id,
      title: event.summary || '(No title)',
      start,
      end,
      joinUrl: callIn(
        conference ? String(conference) : undefined,
        event.location,
        event.description,
      ),
    });
  }

  for (const event of [...events.values(), ...strays]) {
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate, event.uid);
      continue;
    }
    const expansion = event.iterator();
    for (let n = 0, next = expansion.next(); next && n < MAX_OCCURRENCES; n++) {
      const start = next.toJSDate().getTime();
      if (start >= to) break;
      // Long before the window, it can't reach into it.
      if (start + DAY > from) {
        const occurrence = event.getOccurrenceDetails(next);
        add(occurrence.item, occurrence.startDate, occurrence.endDate, `${event.uid}/${next}`);
      }
      next = expansion.next();
    }
  }
  return meetings.sort((a, b) => a.start - b.start);
}

/**
 * Arc's Live Calendar: the meeting starting within `before` ms or, if none
 * is, the one under way (the latest to start).
 */
export function liveMeeting(meetings: Meeting[], now: number, before: number): Meeting | undefined {
  const soon = meetings.find((meeting) => meeting.start > now && meeting.start - now <= before);
  return soon ?? meetings.filter((meeting) => meeting.start <= now && now < meeting.end).at(-1);
}

/** Arc's ⌃⌘J: the live meeting among those with a call to join. */
export const meetingToJoin = (meetings: Meeting[], now: number, before: number) =>
  liveMeeting(
    meetings.filter((meeting) => meeting.joinUrl),
    now,
    before,
  );

/** The countdown under the meeting's name: "in 4 min", then how long is left. */
export function countdown(meeting: Meeting, now: number): string {
  if (meeting.start > now) return `in ${Math.ceil((meeting.start - now) / 60_000)} min`;
  const left = Math.ceil((meeting.end - now) / 60_000);
  return left > 0 ? `Now · ${left} min left` : 'Now';
}
