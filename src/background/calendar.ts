import { browser } from 'wxt/browser';
import type { LiveCalendar } from '@/model/types';
import {
  NotACalendarError,
  feedOwner,
  meetingToJoin,
  meetingsIn,
  type CalendarState,
  type Meeting,
} from '@/platform/calendar';
import { calendarItem } from '@/platform/storage-items';
import { showNote } from './copy';

/** Meetings are kept this far ahead, so a missed read or two still leaves the next ones… */
const AHEAD_MS = 36 * 3600_000;
/** …and this far back, for a long one still under way. */
const BEHIND_MS = 12 * 3600_000;

/** Why a read didn't work, in words the sidebar shows. */
class Problem extends Error {}

let reading = Promise.resolve();
let watched: string | null | undefined;

export function watchCalendar(calendar: LiveCalendar | null) {
  const feed = calendar?.feed ?? null;
  if (feed === watched) return;
  watched = feed;
  void refreshCalendar(feed);
}

/** One read at a time, in order. A failed read keeps the last good meetings and says why. */
export function refreshCalendar(
  feed: string | null,
  fetchFeed: typeof fetch = fetch,
  now = Date.now,
): Promise<void> {
  reading = reading.then(() => read(feed, fetchFeed, now())).catch(() => {});
  return reading;
}

async function read(feed: string | null, fetchFeed: typeof fetch, now: number) {
  if (!feed) return calendarItem.setValue(null);
  let state: CalendarState;
  try {
    state = { feed, meetings: await meetingsAt(feed, fetchFeed, now), checkedAt: now };
  } catch (error) {
    const last = await calendarItem.getValue();
    state = {
      feed,
      meetings: last?.feed === feed ? last.meetings : [],
      checkedAt: now,
      problem: error instanceof Problem ? error.message : 'Couldn’t reach the calendar',
    };
  }
  await calendarItem.setValue(state);
}

async function meetingsAt(feed: string, fetchFeed: typeof fetch, now: number): Promise<Meeting[]> {
  // The address is the key: no cookies, and nothing cached on the way.
  const response = await fetchFeed(feed, { credentials: 'omit', cache: 'no-store' });
  if (response.status === 404) throw new Problem('No calendar at this address');
  if (!response.ok) throw new Problem(`The calendar didn’t answer (${response.status})`);
  try {
    return meetingsIn(await response.text(), now - BEHIND_MS, now + AHEAD_MS, feedOwner(feed));
  } catch (error) {
    if (error instanceof NotACalendarError) throw new Problem('This address isn’t a calendar');
    throw error;
  }
}

/** Arc's ⌃⌘J: opens the call of the meeting about to start, or under way. */
export async function joinMeeting(
  windowId: number,
  calendar: LiveCalendar | null,
  now = Date.now(),
) {
  if (!calendar) return showNote(windowId, 'Turn on Live Calendar to join meetings');
  const state = await calendarItem.getValue();
  const meetings = state?.feed === calendar.feed ? state.meetings : [];
  const url = meetingToJoin(meetings, now, calendar.before * 60_000)?.joinUrl;
  if (url) await browser.tabs.create({ windowId, url });
  else await showNote(windowId, 'No meeting to join right now');
}
