import { create } from 'zustand';
import type { CalendarState, Meeting } from '@/platform/calendar';
import type { Platform } from '@/platform/types';
import { useSidebar } from './sidebar';

/** Live Calendar's meetings, as the background last read them. */
const useCalendarStore = create<{ calendar: CalendarState | null }>()(() => ({ calendar: null }));

export function connectCalendar(platform: Platform): () => void {
  return platform.onCalendarChange((calendar) => useCalendarStore.setState({ calendar }));
}

const current = (calendar: CalendarState | null, feed: string | undefined) =>
  calendar && calendar.feed === feed ? calendar : null;

/** Only what was read from the current feed; null before it's read, or while off. */
export function useCalendar(): CalendarState | null {
  const feed = useSidebar((state) => state.model.settings.calendar?.feed);
  return useCalendarStore((state) => current(state.calendar, feed));
}

export function calendarMeetings(): Meeting[] {
  const feed = useSidebar.getState().model.settings.calendar?.feed;
  return current(useCalendarStore.getState().calendar, feed)?.meetings ?? [];
}
