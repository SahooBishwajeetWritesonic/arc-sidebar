import { AnimatePresence, motion } from 'motion/react';
import { joinMeeting, pressPin } from '@/app/actions';
import { fade, spring } from '@/app/motion';
import { Favicon } from '@/app/rows/Favicon';
import { countdown, liveMeeting } from '@/platform/calendar';
import { useCalendar } from '@/state/calendar';
import { useSidebar } from '@/state/sidebar';
import { useNow } from './useNow';
import styles from './live-calendar.module.css';

/** Arc's Live Calendar: the next or current meeting under Favorites, with a countdown. */
export function LiveCalendar() {
  const calendar = useSidebar((state) => state.model.settings.calendar);
  const pin = useSidebar((state) => (calendar ? state.model.items[calendar.itemId] : undefined));
  if (!calendar || pin?.kind !== 'pin') return null;
  return <Countdown itemId={pin.id} url={pin.url} before={calendar.before * 60_000} />;
}

function Countdown({ itemId, url, before }: { itemId: string; url: string; before: number }) {
  const meetings = useCalendar()?.meetings ?? [];
  const now = useNow(10_000);
  const meeting = liveMeeting(meetings, now, before);
  return (
    <AnimatePresence initial={false}>
      {meeting && (
        <motion.div
          key="live"
          className={styles.reveal}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ height: spring.row, opacity: fade }}
        >
          <div className={styles.pill} role="group" aria-label="Next meeting">
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
              <button type="button" className={styles.join} onClick={() => joinMeeting(meeting)}>
                Join
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
