import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useRef, useState } from 'react';
import { forgetArchived } from '@/app/actions';
import styles from '@/app/sheet/sheet.module.css';
import { useSidebar } from '@/state/sidebar';
import { setClearingArchive, useUi } from '@/state/ui';

/** Arc's Clear Archive asks first: there's no Undo for it. */
export function ClearArchiveDialog() {
  const open = useUi((state) => state.clearingArchive);
  return (
    <AlertDialog.Root open={open} onOpenChange={setClearingArchive}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={styles.backdrop} />
        <ClearArchivePopup />
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function ClearArchivePopup() {
  // As it was when asked, so the text doesn't change as it fades out.
  const [ids] = useState(() => useSidebar.getState().archive.entries.map((entry) => entry.id));
  const count = `${ids.length} archived ${ids.length === 1 ? 'tab' : 'tabs'}`;
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog.Popup className={styles.popup} initialFocus={cancel}>
      <AlertDialog.Title className={styles.title}>Clear the archive?</AlertDialog.Title>
      <AlertDialog.Description className={styles.description}>
        This removes all {count} from every space. It can’t be undone.
      </AlertDialog.Description>
      <footer className={styles.footer}>
        <button
          type="button"
          className={`${styles.button} ${styles.destructive}`}
          onClick={() => {
            forgetArchived(ids);
            setClearingArchive(false);
          }}
        >
          Clear Archive
        </button>
        {/* The default, on the right, and focused: Return keeps the archive. */}
        <AlertDialog.Close ref={cancel} className={styles.primary}>
          Cancel
        </AlertDialog.Close>
      </footer>
    </AlertDialog.Popup>
  );
}
