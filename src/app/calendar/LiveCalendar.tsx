import { AnimatePresence, motion } from 'motion/react';
import { joinMeeting, pressPin } from '@/app/actions';
import { fade, spring } from '@/app/motion';
import { Favicon } from '@/app/rows/Favicon';
import { countdown, liveMeetings } from '@/platform/calendar';
import { useCalendar } from '@/state/calendar';
import { useSidebar } from '@/state/sidebar';
import { useNow } from './useNow';
import styles from './live-calendar.module.css';

/** Arc's Live Calendar: the next or current meetings under Favorites, each with a countdown. */
export function LiveCalendar() {
  const calendar = useSidebar((state) => state.model.settings.calendar);
  const pin = useSidebar((state) => (calendar ? state.model.items[calendar.itemId] : undefined));
  if (!calendar || pin?.kind !== 'pin') return null;
  return <Countdown itemId={pin.id} url={pin.url} before={calendar.before * 60_000} />;
}

function Countdown({ itemId, url, before }: { itemId: string; url: string; before: number }) {
  const meetings = useCalendar()?.meetings ?? [];
  const now = useNow(10_000);
  const live = liveMeetings(meetings, now, before);
  return (
    // A group only while it holds meetings, so an empty one isn't announced.
    <div
      role={live.length ? 'group' : undefined}
      aria-label={live.length ? (live.length > 1 ? 'Next meetings' : 'Next meeting') : undefined}
    >
      <AnimatePresence initial={false}>
        {live.map((meeting) => (
          <motion.div
            key={meeting.id}
            className={styles.reveal}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: spring.row, opacity: fade }}
          >
            <div className={styles.pill}>
              <button type="button" className={styles.open} onClick={() => pressPin(itemId)}>
                <Favicon url={url} />
                <span className={styles.text}>
                  <span className={styles.title} dir="auto">
                    {meeting.title}
                  </span>
                  <span className={styles.when}>{countdown(meeting, now)}</span>
                </span>
              </button>
              {meeting.joinUrl && (
                <button
                  type="button"
                  className={styles.join}
                  aria-label={`Join ${meeting.title}`}
                  onClick={() => joinMeeting(meeting)}
                >
                  Join
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
