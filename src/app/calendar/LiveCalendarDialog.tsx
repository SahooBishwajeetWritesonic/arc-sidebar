import { Dialog } from '@base-ui/react/dialog';
import { useRef, useState } from 'react';
import { setLiveCalendar } from '@/app/actions';
import { copyText } from '@/app/command/run';
import sheet from '@/app/sheet/sheet.module.css';
import { showToast } from '@/app/toast/toast';
import { feedUrl } from '@/platform/calendar';
import { useCalendar } from '@/state/calendar';
import { useSidebar } from '@/state/sidebar';
import { openUrl } from '@/state/tabs';
import { setLiveCalendarFor, useUi } from '@/state/ui';
import SCRIPT from './live-calendar.gs?raw';
import styles from './live-calendar-dialog.module.css';

/** How long before a meeting its countdown can show, in minutes. */
const BEFORE = [1, 5, 10, 15];
const GOOGLE_SETTINGS = 'https://calendar.google.com/calendar/u/0/r/settings';
const NEW_SCRIPT = 'https://script.new';

/** Arc reads the calendar through its sign-in; here, a secret iCal address or your own script. */
export function LiveCalendarDialog() {
  const itemId = useUi((state) => state.liveCalendarFor);
  // Kept while the dialog fades out.
  const last = useRef(itemId);
  if (itemId) last.current = itemId;
  return (
    <Dialog.Root open={itemId !== null} onOpenChange={(open) => !open && setLiveCalendarFor(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className={sheet.backdrop} />
        {last.current && <LiveCalendarPopup itemId={last.current} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LiveCalendarPopup({ itemId }: { itemId: string }) {
  const current = useSidebar((state) => state.model.settings.calendar);
  const problem = useCalendar()?.problem;
  const [address, setAddress] = useState(current?.feed ?? '');
  const [before, setBefore] = useState(current?.before ?? 5);
  const [invalid, setInvalid] = useState(false);
  const copyScript = async () => {
    await copyText(SCRIPT);
    showToast('Copied Live Calendar script');
    openUrl(NEW_SCRIPT);
  };
  const save = () => {
    const feed = feedUrl(address);
    if (!feed) return setInvalid(true);
    setLiveCalendar({ feed, itemId, before });
    setLiveCalendarFor(null);
  };

  return (
    <Dialog.Popup className={sheet.popup}>
      <Dialog.Title className={sheet.title}>Live Calendar</Dialog.Title>
      <Dialog.Description className={sheet.description}>
        Your next meeting shows under Favorites, with a countdown and Join. Paste your calendar’s
        secret address in iCal format, from Integrate calendar in its settings.
      </Dialog.Description>
      <form
        id="live-calendar"
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <input
          className={styles.field}
          aria-label="Calendar address"
          aria-invalid={invalid || undefined}
          placeholder="https://calendar.google.com/calendar/ical/…"
          spellCheck={false}
          autoFocus
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setInvalid(false);
          }}
        />
        <label className={styles.line}>
          <span className={styles.label}>Show meetings</span>
          <select
            className={styles.field}
            value={before}
            onChange={(event) => setBefore(Number(event.target.value))}
          >
            {BEFORE.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} {minutes === 1 ? 'minute' : 'minutes'} before
              </option>
            ))}
          </select>
        </label>
      </form>
      {invalid ? (
        <p className={sheet.error}>That isn’t a web address.</p>
      ) : current && problem ? (
        <p className={sheet.error}>{problem}.</p>
      ) : (
        <button type="button" className={styles.link} onClick={() => openUrl(GOOGLE_SETTINGS)}>
          Open Google Calendar’s settings
        </button>
      )}
      <p className={sheet.hint}>
        No secret address on a work account? Paste the Live Calendar script into a new Apps Script
        project, follow the steps at its top, then paste its web app link here.
      </p>
      <button type="button" className={styles.link} onClick={() => void copyScript()}>
        Copy Script and Open Apps Script
      </button>
      <footer className={sheet.footer}>
        {current && (
          <button
            type="button"
            className={`${sheet.button} ${sheet.destructive} ${sheet.leading}`}
            onClick={() => {
              setLiveCalendar(null);
              setLiveCalendarFor(null);
            }}
          >
            Turn Off
          </button>
        )}
        <Dialog.Close className={sheet.button}>Cancel</Dialog.Close>
        <button
          type="submit"
          form="live-calendar"
          className={sheet.primary}
          disabled={!address.trim()}
        >
          {current ? 'Save' : 'Turn On'}
        </button>
      </footer>
    </Dialog.Popup>
  );
}
