import { Checkbox } from '@base-ui/react/checkbox';
import { Dialog } from '@base-ui/react/dialog';
import { Check, Copy, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { importFromArc } from '@/app/actions';
import { SpaceGlyph } from '@/app/spaces/icons';
import { NotArcSidebarError, parseArcSidebar, type ArcSidebar } from '@/import/arc';
import { planImport, type ImportChoice } from '@/import/plan';
import { useSidebar } from '@/state/sidebar';
import { setImporting, useUi } from '@/state/ui';
import styles from './import.module.css';

const ARC_FILE = '~/Library/Application Support/Arc/StorableSidebar.json';

/** "Import from Arc": choose Arc's sidebar file, then the spaces to bring over. */
export function ImportDialog() {
  const open = useUi((state) => state.importing);
  return (
    <Dialog.Root open={open} onOpenChange={setImporting}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <ImportPopup />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportPopup() {
  const [arc, setArc] = useState<ArcSidebar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    try {
      setArc(parseArcSidebar(JSON.parse(await file.text())));
      setError(null);
    } catch (problem) {
      setError(
        problem instanceof NotArcSidebarError || problem instanceof SyntaxError
          ? "That isn't Arc's sidebar file. Choose StorableSidebar.json."
          : "Couldn't read that file.",
      );
    }
  };

  return (
    <Dialog.Popup
      className={styles.popup}
      initialFocus={chooseRef}
      onDragOver={(event: DragEvent) => event.preventDefault()}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        void read(event.dataTransfer.files[0]);
      }}
    >
      <Dialog.Title className={styles.title}>Import from Arc</Dialog.Title>
      {arc ? (
        <Preview arc={arc} />
      ) : (
        <ChooseFile chooseRef={chooseRef} error={error} onFile={read} />
      )}
    </Dialog.Popup>
  );
}

function ChooseFile({
  chooseRef,
  error,
  onFile,
}: {
  chooseRef: React.RefObject<HTMLButtonElement | null>;
  error: string | null;
  onFile: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <Dialog.Description className={styles.description}>
        Brings over your spaces, pinned tabs, folders and favorites. Arc keeps them in this file:
      </Dialog.Description>
      <div className={styles.path}>
        <code>{ARC_FILE}</code>
        <button
          type="button"
          className={styles.icon}
          aria-label={copied ? 'Copied' : 'Copy path'}
          title="Copy path"
          onClick={() => {
            void navigator.clipboard.writeText(ARC_FILE).then(() => setCopied(true));
          }}
        >
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
        </button>
      </div>
      <p className={styles.hint}>
        In the file dialog, press ⌘⇧G and paste it, or drop the file here.
      </p>
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
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <footer className={styles.footer}>
        <Dialog.Close className={styles.button}>Cancel</Dialog.Close>
        <button
          ref={chooseRef}
          type="button"
          className={styles.primary}
          onClick={() => inputRef.current?.click()}
        >
          Choose file…
        </button>
      </footer>
    </>
  );
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function Preview({ arc }: { arc: ArcSidebar }) {
  // The sidebar as it was when the file was read, so the rows don't change
  // under the dialog as it fades out after an import.
  const [model] = useState(() => useSidebar.getState().model);
  // What each space would add if everything were chosen; placeholder ids are
  // enough here, the real ones are made on import.
  const everything = useMemo(() => {
    let n = 0;
    return planImport(
      model,
      arc,
      { spaceIds: arc.spaces.map((space) => space.id), favorites: true },
      () => `preview-${n++}`,
    );
  }, [model, arc]);

  const hasNew = (id: string) => {
    const summary = everything.summary[id];
    return !!summary && (!summary.into || summary.tabs + summary.folders > 0);
  };
  const [choice, setChoice] = useState<ImportChoice>(() => ({
    spaceIds: arc.spaces.filter((space) => !space.profile && hasNew(space.id)).map((s) => s.id),
    favorites: everything.favorites > 0,
  }));
  const importRef = useRef<HTMLButtonElement>(null);
  useEffect(() => importRef.current?.focus(), []);

  const toggle = (spaceId: string, on: boolean) =>
    setChoice((current) => ({
      ...current,
      spaceIds: on
        ? [...current.spaceIds, spaceId]
        : current.spaceIds.filter((id) => id !== spaceId),
    }));
  const nothing = !choice.spaceIds.length && !choice.favorites;

  return (
    <>
      <Dialog.Description className={styles.description}>
        Pinned tabs, folders and favorites come over. Today tabs stay in Arc.
      </Dialog.Description>
      <div className={styles.list} role="group" aria-label="What to import">
        {arc.spaces.map((space) => {
          const summary = everything.summary[space.id]!;
          const fresh = hasNew(space.id);
          const what =
            summary.tabs + summary.folders ? contents(summary.tabs, summary.folders) : 'Empty';
          const meta = !fresh
            ? 'Already imported'
            : [what, summary.into && 'adds to your space', space.profile]
                .filter(Boolean)
                .join(' · ');
          return (
            <Choice
              key={space.id}
              glyph={<SpaceGlyph icon={space.icon} />}
              name={space.name}
              meta={meta}
              disabled={!fresh}
              checked={fresh && choice.spaceIds.includes(space.id)}
              onChange={(on) => toggle(space.id, on)}
            />
          );
        })}
        {arc.favorites.length > 0 && (
          <Choice
            glyph={<Star size={14} strokeWidth={1.75} />}
            name="Favorites"
            meta={
              everything.favorites ? count(everything.favorites, 'tab') : 'Already imported or full'
            }
            disabled={!everything.favorites}
            checked={!!everything.favorites && choice.favorites}
            onChange={(on) => setChoice((current) => ({ ...current, favorites: on }))}
          />
        )}
      </div>
      {arc.skipped > 0 && (
        <p className={styles.hint}>
          Left out: {arc.skipped === 1 ? 'a note or Arc page' : `${arc.skipped} notes or Arc pages`}{' '}
          that Chrome can't open.
        </p>
      )}
      <footer className={styles.footer}>
        <Dialog.Close className={styles.button}>Cancel</Dialog.Close>
        <button
          ref={importRef}
          type="button"
          className={styles.primary}
          disabled={nothing}
          onClick={() => {
            importFromArc(arc, choice);
            setImporting(false);
          }}
        >
          Import
        </button>
      </footer>
    </>
  );
}

function contents(tabs: number, folders: number) {
  return folders ? `${count(tabs, 'tab')}, ${count(folders, 'folder')}` : count(tabs, 'tab');
}

function Choice({
  glyph,
  name,
  meta,
  checked,
  disabled,
  onChange,
}: {
  glyph: ReactNode;
  name: string;
  meta: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.choice} data-disabled={disabled || undefined}>
      <Checkbox.Root
        className={styles.checkbox}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      >
        <Checkbox.Indicator className={styles.check}>
          <Check size={11} strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className={styles.glyph} aria-hidden>
        {glyph}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
    </label>
  );
}
