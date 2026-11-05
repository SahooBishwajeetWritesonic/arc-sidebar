import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { setShortcuts } from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import sheet from '@/app/sheet/sheet.module.css';
import { themeAccent } from '@/app/theme/engine';
import { displayUrl } from '@/command/url';
import {
  blankCount,
  fillLink,
  fillSearch,
  isSiteSearch,
  isValidShortcutUrl,
  keywordProblem,
  parseKeywords,
  requiredBlanks,
  withScheme,
} from '@/model/shortcuts';
import type { Shortcut } from '@/model/types';
import { newId, useSidebar } from '@/state/sidebar';
import { setEditingShortcuts, useUi } from '@/state/ui';
import styles from './shortcuts.module.css';

export function ShortcutsDialog() {
  const open = useUi((state) => state.editingShortcuts);
  return (
    <Dialog.Root open={open} onOpenChange={setEditingShortcuts}>
      <Dialog.Portal>
        <Dialog.Backdrop className={sheet.backdrop} />
        <ShortcutsPopup />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Keywords as typed; the address maybe without a scheme. */
interface Draft {
  id: string;
  name: string;
  keywords: string;
  url: string;
  color?: string;
}

const toDraft = ({ keywords, ...shortcut }: Shortcut): Draft => ({
  ...shortcut,
  keywords: keywords.join(', '),
});

const toShortcut = ({ keywords, url, ...draft }: Draft): Shortcut => ({
  ...draft,
  keywords: parseKeywords(keywords),
  url: withScheme(url),
});

const isBlank = (draft: Draft) => !draft.name.trim() && !draft.keywords.trim() && !draft.url.trim();

type Field = 'keywords' | 'name' | 'address';

/** Quiet: a field still to fill in, not a mistake. */
interface Problem {
  field: Field;
  text: string;
  quiet?: true;
}

const typedName = (name: string) => name.toLowerCase().replace(/\s+/g, '');

function typedWords(draft: Draft): string[] {
  const words = parseKeywords(draft.keywords);
  const name = typedName(draft.name);
  if (isSiteSearch({ url: draft.url }) && name.length >= 2) words.push(name);
  return words;
}

const nameOf = (draft: Draft) => draft.name.trim() || 'Another shortcut';

/** Saved shortcuts keep their keywords, so a clash is flagged on the new one. */
function problemsOf(
  drafts: readonly Draft[],
  saved: ReadonlySet<string>,
): Map<string, Problem | null> {
  const owners = new Map<string, Draft>();
  const problems = new Map<string, Problem | null>();
  const added = drafts.filter((draft) => !saved.has(draft.id)).reverse();
  for (const draft of [...drafts.filter((d) => saved.has(d.id)), ...added]) {
    problems.set(draft.id, isBlank(draft) ? null : problemOf(draft, owners));
    for (const word of typedWords(draft)) if (!owners.has(word)) owners.set(word, draft);
  }
  return problems;
}

function problemOf(draft: Draft, owners: ReadonlyMap<string, Draft>): Problem | null {
  const keywords = parseKeywords(draft.keywords);
  for (const keyword of keywords) {
    const problem = keywordProblem(keyword);
    if (problem) return { field: 'keywords', text: problem };
    const owner = owners.get(keyword);
    if (owner) return { field: 'keywords', text: `${nameOf(owner)} uses “${keyword}” already.` };
  }
  const url = withScheme(draft.url);
  if (!url) return { field: 'address', text: 'Add the address it opens.', quiet: true };
  const search = isSiteSearch({ url });
  if (search && blankCount(url)) {
    return { field: 'address', text: 'Use %s for a search or {1} for words, not both.' };
  }
  if (!isValidShortcutUrl(url)) {
    return {
      field: 'address',
      text: 'The command bar can’t open this address. Check it for typos.',
    };
  }
  const name = typedName(draft.name);
  const owner = search && name.length >= 2 ? owners.get(name) : undefined;
  if (owner) return { field: 'name', text: `${nameOf(owner)} uses “${name}” already.` };
  if (!keywords.length && !search) {
    return {
      field: 'keywords',
      text: 'Add a keyword to open it from the command bar.',
      quiet: true,
    };
  }
  return null;
}

function exampleOf(draft: Draft): string | null {
  const url = withScheme(draft.url);
  if (!url) return 'Use %s for the search, or {1} for a word typed after the keyword.';
  const [keyword] = parseKeywords(draft.keywords);
  if (isSiteSearch({ url })) {
    const name = draft.name.trim() || 'the site';
    const typed = keyword ?? draft.name.trim().toLowerCase();
    return typed ? `Type ${typed}, then Tab, to search ${name}.` : null;
  }
  if (!keyword) return null;
  const words = Array.from({ length: requiredBlanks(url) }, (_, i) => String(i + 1));
  const opens = fillLink(url, words);
  return opens && `${[keyword, ...words].join(' ')} opens ${displayUrl(opens)}`;
}

/** A page on the site, for its favicon. */
function sampleUrl(draft: Draft): string {
  const url = withScheme(draft.url);
  if (isSiteSearch({ url })) return fillSearch(url, 'test');
  const words = Array.from({ length: blankCount(url) }, (_, i) => String(i + 1));
  return fillLink(url, words) ?? '';
}

function ShortcutsPopup() {
  const accent = useSidebar((state) =>
    themeAccent(state.model.spaces.find((space) => space.id === state.spaceId)?.theme),
  );
  const [drafts, setDrafts] = useState(() =>
    useSidebar.getState().model.settings.shortcuts.map(toDraft),
  );
  const [saved] = useState(() => new Set(drafts.map((draft) => draft.id)));
  const [added, setAdded] = useState<string | null>(null);
  const problems = useMemo(() => problemsOf(drafts, saved), [drafts, saved]);
  const blocked = [...problems.values()].some(Boolean);

  const change = (id: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  const add = () => {
    const id = newId();
    setAdded(id);
    // At the top: the list is long.
    setDrafts((list) => [{ id, name: '', keywords: '', url: '' }, ...list]);
  };

  return (
    <Dialog.Popup className={sheet.popup}>
      <Dialog.Title className={sheet.title}>Site Search & Shortcuts</Dialog.Title>
      <Dialog.Description className={sheet.description}>
        Type a keyword in the command bar. With <code className={styles.code}>%s</code> in the
        address, Tab searches the site. Otherwise the address opens as typed:{' '}
        <code className={styles.code}>{'{1}'}</code> takes the next word, and{' '}
        <code className={styles.code}>{'{1|3000}'}</code> gives it a default.
      </Dialog.Description>
      {drafts.length ? (
        <ul className={styles.list} aria-label="Shortcuts">
          {drafts.map((draft, i) => {
            const label = `Shortcut ${i + 1}`;
            const problem = problems.get(draft.id) ?? null;
            const mistake = problem && !problem.quiet ? problem : null;
            const invalid = (field: Field) => (mistake?.field === field ? true : undefined);
            const note = `shortcut-note-${draft.id}`;
            const search = isSiteSearch({ url: draft.url });
            return (
              <li key={draft.id} className={styles.card}>
                <div className={styles.line}>
                  <span className={styles.favicon}>
                    <Favicon url={sampleUrl(draft)} />
                  </span>
                  <input
                    className={`${styles.field} ${styles.keyword}`}
                    aria-label={`${label}: keywords`}
                    aria-invalid={invalid('keywords')}
                    aria-describedby={note}
                    placeholder="keyword"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoFocus={draft.id === added}
                    value={draft.keywords}
                    onChange={(event) => change(draft.id, { keywords: event.target.value })}
                  />
                  <input
                    className={`${styles.field} ${styles.grow}`}
                    aria-label={`${label}: name`}
                    aria-invalid={invalid('name')}
                    aria-describedby={note}
                    placeholder="Name"
                    value={draft.name}
                    onChange={(event) => change(draft.id, { name: event.target.value })}
                  />
                  {search && (
                    <input
                      type="color"
                      className={styles.swatch}
                      aria-label={`${label}: colour`}
                      title="Colour in the command bar"
                      value={draft.color ?? accent}
                      onChange={(event) => change(draft.id, { color: event.target.value })}
                    />
                  )}
                  <button
                    type="button"
                    className={sheet.icon}
                    aria-label={`Remove shortcut ${i + 1}`}
                    onClick={() => setDrafts((list) => list.filter((d) => d.id !== draft.id))}
                  >
                    <X size={14} />
                  </button>
                </div>
                <input
                  className={`${styles.field} ${styles.address}`}
                  aria-label={`${label}: address`}
                  aria-invalid={invalid('address')}
                  aria-describedby={note}
                  placeholder="example.com/search?q=%s"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  value={draft.url}
                  onChange={(event) => change(draft.id, { url: event.target.value })}
                />
                <p id={note} className={styles.note} data-problem={mistake ? '' : undefined}>
                  {problem ? problem.text : exampleOf(draft)}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={sheet.empty}>
          No shortcuts yet. Add one to open, say, localhost:3300 by typing lh 3300.
        </p>
      )}
      <footer className={sheet.footer}>
        <button type="button" className={`${sheet.button} ${sheet.leading}`} onClick={add}>
          Add Shortcut
        </button>
        <Dialog.Close className={sheet.button}>Cancel</Dialog.Close>
        <button
          type="button"
          className={sheet.primary}
          disabled={blocked}
          onClick={() => {
            setShortcuts(drafts.filter((draft) => !isBlank(draft)).map(toShortcut));
            setEditingShortcuts(false);
          }}
        >
          Save
        </button>
      </footer>
    </Dialog.Popup>
  );
}
