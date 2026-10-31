import { PreviewCard } from '@base-ui/react/preview-card';
import { useRef, useState, type ReactNode } from 'react';
import { joinMeeting, pressPin } from '@/app/actions';
import { useDrag } from '@/app/drag/drag';
import card from '@/app/pinned/folder-preview.module.css';
import type { Meeting } from '@/platform/calendar';
import { useCalendar } from '@/state/calendar';
import { useSidebar } from '@/state/sidebar';
import { useNow } from './useNow';
import styles from './calendar-preview.module.css';

const DAY = 24 * 3600_000;
/** At most this many: the card stays short, as Arc's does. */
const SHOWN = 6;

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

function dayOf(at: number, now: number) {
  const date = new Date(at).toDateString();
  if (date === new Date(now).toDateString()) return 'Today';
  if (date === new Date(now + DAY).toDateString()) return 'Tomorrow';
  return weekday.format(at);
}

const when = (meeting: Meeting, now: number) =>
  meeting.start <= now
    ? `Now – ${time.format(meeting.end)}`
    : time.formatRange(meeting.start, meeting.end);

interface PreviewProps {
  itemId: string;
  /** What the card hangs under, as wide as it: the pinned tab's row, or the Favorites. */
  anchor: string;
  triggerClassName?: string;
  children: ReactNode;
}

/**
 * Arc's calendar preview: hovering the Live Calendar pin or favorite lists coming meetings,
 * each with Join when it has a call. Not while something's dragged.
 */
export function CalendarPreview({ children, ...props }: PreviewProps) {
  const live = useSidebar((state) => state.model.settings.calendar?.itemId === props.itemId);
  if (!live) return children;
  return <CalendarCard {...props}>{children}</CalendarCard>;
}

function CalendarCard({ itemId, anchor, triggerClassName = card.trigger, children }: PreviewProps) {
  const dragging = useDrag((state) => state.source !== null);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <PreviewCard.Root
      open={open && !dragging}
      onOpenChange={(next) => setOpen(next && useDrag.getState().source === null)}
    >
      <PreviewCard.Trigger
        ref={(element: HTMLElement | null) => void (trigger.current = element)}
        render={<span data-previewed />}
        className={triggerClassName}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          className={card.positioner}
          anchor={() => trigger.current?.closest(anchor) ?? null}
          side="bottom"
          align="start"
          sideOffset={2}
        >
          <PreviewCard.Popup className={card.popup}>
            <Agenda itemId={itemId} onPicked={() => setOpen(false)} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

function Agenda({ itemId, onPicked }: { itemId: string; onPicked: () => void }) {
  const calendar = useCalendar();
  const now = useNow(30_000);
  const coming = (calendar?.meetings ?? [])
    .filter((meeting) => meeting.end > now && meeting.start < now + DAY)
    .slice(0, SHOWN);
  const days = Map.groupBy(coming, (meeting) => dayOf(meeting.start, now));

  return (
    <>
      {calendar === null ? (
        <p className={card.empty}>Reading your calendar…</p>
      ) : !coming.length ? (
        <p className={card.empty}>
          {calendar.problem ? `${calendar.problem}.` : 'No more meetings today.'}
        </p>
      ) : (
        [...days].map(([day, meetings]) => (
          <section key={day} aria-label={day}>
            <h3 className={styles.day}>{day}</h3>
            <ul className={card.list}>
              {meetings.map((meeting) => (
                <li key={meeting.id} className={styles.meeting}>
                  <button
                    type="button"
                    className={styles.open}
                    onClick={() => {
                      pressPin(itemId);
                      onPicked();
                    }}
                  >
                    <span className={styles.title} dir="auto">
                      {meeting.title}
                    </span>
                    <span className={styles.time} data-now={meeting.start <= now || undefined}>
                      {when(meeting, now)}
                    </span>
                  </button>
                  {meeting.joinUrl && (
                    <button
                      type="button"
                      className={styles.join}
                      aria-label={`Join ${meeting.title}`}
                      onClick={() => {
                        joinMeeting(meeting);
                        onPicked();
                      }}
                    >
                      Join
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
