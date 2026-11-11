import { browser } from 'wxt/browser';
import type { LiveCalendar } from '@/model/types';
import {
  NotACalendarError,
  feedOwner,
  isCalendarScript,
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
  // The address is the key: no cookies, nothing cached. A script needs your login, though.
  const script = isCalendarScript(feed);
  const response = await fetchFeed(feed, {
    credentials: script ? 'include' : 'omit',
    cache: 'no-store',
  });
  if (script && /accounts\.google\.com|\/ServiceLogin/.test(response.url)) {
    throw new Problem('Sign in to Google in Chrome to read this calendar');
  }
  if (response.status === 404) throw new Problem('No calendar at this address');
  if (!response.ok) throw new Problem(`The calendar didn’t answer (${response.status})`);
  try {
    return meetingsIn(await response.text(), now - BEHIND_MS, now + AHEAD_MS, feedOwner(feed));
  } catch (error) {
    if (error instanceof NotACalendarError) throw new Problem('This address isn’t a calendar');
    throw error;
  }
}

/** Long enough for Google Calendar to save a change made just before leaving it. */
const AFTER_LEAVING_MS = 3_000;

export interface CalendarTab {
  tabId: number | undefined;
  feed: string | null;
}

let soon: ReturnType<typeof setTimeout> | undefined;
/** The tab each window shows, and the focused window. */
const shown = new Map<number, number>();
let focused: number | undefined;

/** Leaving and coming back within the moment reads once. */
function readSoon(feed: string) {
  clearTimeout(soon);
  soon = setTimeout(() => void refreshCalendar(feed), AFTER_LEAVING_MS);
}

/** The worker forgets this when it stops. */
export function seedShownTabs(tabs: readonly { id?: number; windowId: number }[]) {
  for (const tab of tabs) if (tab.id !== undefined) shown.set(tab.windowId, tab.id);
}

/** Leaving the calendar's tab re-reads it soon, so a change made there shows in seconds. */
export function noteTabShown(tabId: number, windowId: number, calendar: CalendarTab) {
  const left = shown.get(windowId);
  shown.set(windowId, tabId);
  if (calendar.feed && left !== tabId && left === calendar.tabId) readSoon(calendar.feed);
}

/** The same for leaving its window, for another window or app. */
export function noteWindowFocused(windowId: number, calendar: CalendarTab) {
  const left = focused;
  focused = windowId;
  if (left === undefined || left === windowId || !calendar.feed) return;
  if (calendar.tabId !== undefined && shown.get(left) === calendar.tabId) readSoon(calendar.feed);
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
