import { Dialog } from '@base-ui/react/dialog';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { restoreSidebar } from '@/app/actions';
import styles from '@/app/sheet/sheet.module.css';
import { NotSidebarExportError, parseExportFile, sameSidebar } from '@/model/backup';
import type { Backup, SidebarModel } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { setRestoring, useUi } from '@/state/ui';

/** "Restore Sidebar": go back to one of the service's backups, or to an exported file. */
export function RestoreDialog() {
  const open = useUi((state) => state.restoring !== null);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && setRestoring(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <RestorePopup />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface Copy {
  id: string;
  name: string;
  model: SidebarModel;
  reason?: Backup['reason'];
}

function RestorePopup() {
  // The sidebar and backups as they were when the dialog opened, so rows
  // don't change under it as it fades out after a restore.
  const [current] = useState(() => useSidebar.getState().model);
  const [backups] = useState(() => useUi.getState().restoring ?? []);
  const [file, setFile] = useState<Copy | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The newest backup that differs from now.
  const [chosen, setChosen] = useState(() => {
    const newest = backups.find((backup) => !sameSidebar(backup.model, current));
    return newest ? `backup-${newest.savedAt}` : null;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  const copies = useMemo(() => {
    const now = Date.now();
    const list: (Copy & { same: boolean })[] = backups.map((backup) => ({
      id: `backup-${backup.savedAt}`,
      name: when(backup.savedAt, now),
      model: backup.model,
      reason: backup.reason,
      same: sameSidebar(backup.model, current),
    }));
    if (file) list.unshift({ ...file, same: sameSidebar(file.model, current) });
    return list;
  }, [backups, file, current]);

  const read = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      const json: unknown = JSON.parse(await picked.text());
      if (isArcSidebar(json)) {
        setError("That's Arc's sidebar file. Use Import from Arc instead.");
        return;
      }
      setFile({ id: 'file', name: picked.name, model: parseExportFile(json) });
      setChosen('file');
      setError(null);
    } catch (problem) {
      setError(
        problem instanceof NotSidebarExportError || problem instanceof SyntaxError
          ? "That isn't a sidebar export. Choose a file saved with Export Sidebar."
          : "Couldn't read that file.",
      );
    }
  };

  const selected = copies.find((copy) => copy.id === chosen && !copy.same);

  return (
    <Dialog.Popup
      className={styles.popup}
      initialFocus={chosen ? restoreRef : openRef}
      onDragOver={(event: DragEvent) => event.preventDefault()}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        void read(event.dataTransfer.files[0]);
      }}
    >
      <Dialog.Title className={styles.title}>Restore sidebar</Dialog.Title>
      <Dialog.Description className={styles.description}>
        Go back to an earlier copy of your spaces, pinned tabs and favorites. What you have now is
        saved first.
      </Dialog.Description>
      {copies.length > 0 ? (
        <RadioGroup
          className={styles.list}
          aria-label="Copies"
          value={selected?.id ?? null}
          onValueChange={(value) => setChosen(value as string)}
        >
          {copies.map((copy) => (
            <label key={copy.id} className={styles.choice} data-disabled={copy.same || undefined}>
              <Radio.Root className={styles.radio} value={copy.id} disabled={copy.same}>
                <Radio.Indicator className={styles.dot} />
              </Radio.Root>
              <span className={styles.text}>
                <span className={styles.name}>{copy.name}</span>
                <span className={styles.meta}>{describe(copy)}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      ) : (
        <p className={styles.empty}>
          No backups yet. One is saved each hour while you make changes, and before an import.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          void read(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <footer className={styles.footer}>
        <button
          ref={openRef}
          type="button"
          className={`${styles.button} ${styles.leading}`}
          onClick={() => inputRef.current?.click()}
        >
          Open file…
        </button>
        <Dialog.Close className={styles.button}>Cancel</Dialog.Close>
        <button
          ref={restoreRef}
          type="button"
          className={styles.primary}
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            restoreSidebar(selected.model);
            setRestoring(null);
          }}
        >
          Restore
        </button>
      </footer>
    </Dialog.Popup>
  );
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function describe(copy: Copy & { same: boolean }) {
  if (copy.same) return 'Same as now';
  const tabs = Object.values(copy.model.items).filter((item) => item.kind === 'pin').length;
  const what = `${count(copy.model.spaces.length, 'space')}, ${count(tabs, 'tab')}`;
  const why = copy.reason === 'import' ? 'before an import' : copy.reason && 'before a restore';
  return why ? `${what} · ${why}` : what;
}

/** "Today at 3:15 PM", "Yesterday at 9:02 AM", "Oct 27 at 4:10 PM". */
function when(savedAt: number, now: number) {
  const date = new Date(savedAt);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const midnight = (at: number) => new Date(at).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(now) - midnight(savedAt)) / 86_400_000);
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(!sameYear && { year: 'numeric' }),
  });
  return `${day} at ${time}`;
}

const isArcSidebar = (json: unknown) =>
  typeof json === 'object' && json !== null && 'sidebar' in json && !('app' in json);
