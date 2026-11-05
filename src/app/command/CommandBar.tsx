import {
  Archive,
  ArchiveX,
  ArrowRight,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  CircleArrowDown,
  ClipboardPaste,
  Columns2,
  Copy,
  Download,
  FolderPlus,
  History,
  Import,
  Keyboard,
  Link,
  Link2,
  ListX,
  LocateFixed,
  Moon,
  Palette,
  Pencil,
  Pin,
  PinOff,
  RectangleHorizontal,
  Replace,
  RotateCcw,
  Search,
  SquarePlus,
  Star,
  StarOff,
  Sun,
  SunMoon,
  TextSearch,
  type LucideIcon,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { spring } from '@/app/motion';
import { Favicon } from '@/app/rows/Favicon';
import { SpaceGlyph } from '@/app/spaces/icons';
import { readableOn } from '@/app/theme/color';
import { themeAccent, themeLook } from '@/app/theme/engine';
import { usePreferredScheme } from '@/app/theme/looks';
import type { CommandContext } from '@/command/actions';
import { parseSuggestions } from '@/command/opensearch';
import { learnedTarget, pickTarget, type LearnedPick } from '@/command/picks';
import { SCOPE_NAMES, scopeFor, type Scope } from '@/command/scopes';
import { completeAddress, searchCommands } from '@/command/search';
import { completeLink, linkFor, linkHistoryText, linkPages, siteFor } from '@/command/sites';
import type { ActionId, Command, Result } from '@/command/types';
import { fillSearch, suggestUrl } from '@/model/shortcuts';
import type { Shortcut } from '@/model/types';
import type { Typed } from '@/platform/command-bar';
import type { HistoryEntry } from '@/platform/types';
import { useSidebar } from '@/state/sidebar';
import {
  fetchText,
  learnPick,
  loadPicks,
  navigateActive,
  searchHistory,
  searchInActive,
  selectTodayIds,
  useTabs,
} from '@/state/tabs';
import { runCommand } from './run';
import { SiteDust } from './SiteDust';
import styles from './command.module.css';

/** Where the bar is shown, and how it reaches the sidebar. */
export interface CommandHost {
  close(): void;
  /** Hands a command to this window's sidebar to run; false when it isn't open. */
  runInSidebar(command: Command): Promise<boolean>;
}

/** The drawn bar, for the page to hand over what was typed into its stand-in. */
export interface CommandBarHandle {
  carryOn(typed: Typed): void;
}

interface CommandBarProps {
  host: CommandHost;
  /** Whether this window's sidebar is open; actions that open something there need it. */
  sidebarOpen: boolean;
  /** Centred over the page (in its own frame), or at the top of the sidebar. */
  placement: 'page' | 'sidebar';
  /**
   * Editing the selected tab's address (from the URL bar): the bar starts
   * with it selected, and an address or search loads in that tab.
   */
  address?: string;
  /**
   * Only addresses, searches and history: on a Little Arc's first page,
   * where tabs, spaces and actions have nothing to act on.
   */
  pagesOnly?: boolean;
  /** Once it's drawn, its field focused (over a page, where a stand-in took the first keys). */
  onMount?: (bar: CommandBarHandle) => void;
}

const EMPTY: HistoryEntry[] = [];

/**
 * Arc's command bar: an address, search, tab, space or action. It opens and closes in one
 * frame (Arc dropped its entrance animation as it felt slow, research/08).
 */
export function CommandBar({
  host,
  sidebarOpen,
  placement,
  address,
  pagesOnly = false,
  onMount,
}: CommandBarProps) {
  const ctx = useCommandContext(sidebarOpen);
  const preferred = usePreferredScheme();
  const theme = useSidebar(
    (state) => state.model.spaces.find((space) => space.id === state.spaceId)?.theme,
  );
  // The space's look, as the sidebar draws it.
  const look = useMemo(() => themeLook(theme, preferred), [theme, preferred]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Each Site Search start: the card is pressed like a button and dust bursts from behind it.
  const [burst, setBurst] = useState(0);
  const press = () => {
    if (reduced || !card.current) return;
    const element = card.current;
    setBurst((count) => count + 1);
    void animate(element, { scale: 0.97 }, { duration: 0.08, ease: 'easeOut' }).then(() =>
      animate(element, { scale: 1 }, spring.release),
    );
  };
  const done = useRef(false);

  const [typed, setTyped] = useState(address ?? '');
  // Inline completion only follows typing at the end, as in Chrome: after a
  // Backspace it waits for the next letter.
  const [completing, setCompleting] = useState(false);
  const [actionsOnly, setActionsOnly] = useState(false);
  const [prompt, setPrompt] = useState<{ result: Result; value: string } | null>(null);
  // An action waiting for a tab or address ("Add Split View…").
  const [picking, setPicking] = useState<Result | null>(null);
  // Arc's Site Search: the site being searched, after its keyword and Tab.
  const [site, setSite] = useState<Shortcut | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const shortcuts = ctx.model.settings.shortcuts;
  const accent = themeAccent(theme);
  const colorOf = (shortcut: Shortcut) => shortcut.color ?? accent;

  const slash = typed.startsWith('/') && !picking && !pagesOnly && !site && !scope;
  const actionsMode = (actionsOnly || slash) && !picking && !pagesOnly && !site && !scope;
  const query = slash ? typed.slice(1) : typed;
  const plainTyping = !site && !scope && !actionsMode && !prompt && !picking;
  // A site's keyword, or a scope's: Tab searches that.
  const keyword = plainTyping ? siteFor(query, shortcuts) : undefined;
  const scopeTyped = plainTyping ? scopeFor(query) : undefined;
  // No inline completion over a link ("lh 3300").
  const linked = plainTyping && linkFor(query, shortcuts) !== undefined;
  const history = useHistory(
    actionsMode || site || scope === 'tabs' || scope === 'archive' ? '' : query,
  );
  // For "lh 51" to complete to "lh 5173".
  // Plenty, so one busy port doesn't crowd out the others.
  const linkHistory = useHistory(plainTyping ? linkHistoryText(query, shortcuts) : '', 500);
  const typedAddresses = useTypedAddresses();
  const siteSuggestions = useSiteSuggestions(site, query);
  const picks = usePicks();
  const learning = !site && !scope && !prompt && !picking;
  const learned = useMemo(
    () => (learning ? learnedTarget(picks, query, Date.now()) : null),
    [learning, picks, query],
  );
  const completion = useMemo(() => {
    if (!completing || !plainTyping) return null;
    if (linked) return completeLink(query, linkPages(query, shortcuts, linkHistory));
    return completeAddress(query, [...typedAddresses, ...history]);
  }, [completing, plainTyping, linked, query, shortcuts, linkHistory, typedAddresses, history]);
  const results = useMemo(() => {
    if (prompt) return [];
    const found = searchCommands(query, ctx, history, {
      actionsOnly: actionsMode,
      pickSplit: picking !== null,
      completion,
      site,
      linkHistory,
      siteSuggestions,
      scope,
      learned,
    });
    return pagesOnly
      ? found.filter(({ command }) => command.type === 'openUrl' || command.type === 'search')
      : found;
  }, [
    prompt,
    picking,
    query,
    ctx,
    history,
    actionsMode,
    completion,
    site,
    pagesOnly,
    linkHistory,
    siteSuggestions,
    scope,
    learned,
  ]);

  // For the stand-in's Return, which picks the top result once its text is in.
  const latestResults = useRef(results);
  latestResults.current = results;

  // The selection goes back to the top whenever what's typed changes.
  const listKey = `${actionsMode}:${picking?.key}:${site?.id}:${scope}:${query}`;
  const [selection, setSelection] = useState({ listKey, index: 0 });
  const index = Math.min(selection.listKey === listKey ? selection.index : 0, results.length - 1);
  const select = (next: number) =>
    setSelection({ listKey, index: Math.max(0, Math.min(results.length - 1, next)) });

  const value = prompt
    ? prompt.value
    : completion
      ? typed + completion.text.slice(query.length)
      : typed;

  // Focus by hand: Chrome ignores autofocus in a frame from another origin.
  useLayoutEffect(() => {
    const focus = () => input.current?.focus({ preventScroll: true });
    focus();
    // An address being edited starts selected, so typing replaces it.
    if (address) input.current?.select();
    addEventListener('focus', focus);
    return () => removeEventListener('focus', focus);
  }, []);

  // Over a page, the stand-in took the keys typed while this loaded: carry on
  // from them. At once (flushSync), so a key typed next lands after them.
  useLayoutEffect(() => {
    onMount?.({
      carryOn: ({ text, start, end, submit }) => {
        flushSync(() => {
          setTyped(text);
          setCompleting(false);
        });
        input.current?.setSelectionRange(start, end);
        if (submit) choose(latestResults.current[0]);
      },
    });
    // Once, as it's drawn.
  }, []);

  // The completed part of the address stays selected, so typing replaces it.
  useLayoutEffect(() => {
    if (completion) input.current?.setSelectionRange(typed.length, value.length);
  }, [completion, typed, value]);

  // An action that asks for a name starts with its suggestion selected.
  const asking = prompt?.result.key;
  useLayoutEffect(() => {
    if (asking) input.current?.select();
  }, [asking]);

  useLayoutEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  async function run(command: Command) {
    if (done.current) return;
    done.current = true;
    if (address !== undefined && (command.type === 'openUrl' || command.type === 'search')) {
      if (command.type === 'openUrl') navigateActive(command.url);
      else searchInActive(command.text);
      host.close();
      return;
    }
    const copy =
      command.type === 'action' &&
      (command.action === 'copyUrl' || command.action === 'copyMarkdown');
    // Only a focused page can write the clipboard, so the bar copies, and
    // waits: closing removes its frame, which would cut the copy short.
    if (copy) await runCommand(command);
    const browserOnly =
      command.type === 'openUrl' || command.type === 'search' || command.type === 'switchToTab';
    if (browserOnly) runCommand(command);
    else if (!(await host.runInSidebar(command)) && !copy) runCommand(command);
    host.close();
  }

  function choose(result: Result | undefined) {
    if (!result) return;
    const target = learning && query.trim() ? pickTarget(result) : null;
    if (target) learnPick(query, target);
    if (picking?.command.type === 'action') {
      const { command } = result;
      if (command.type === 'switchToTab') void run({ ...picking.command, tabId: command.tabId });
      if (command.type === 'openUrl') void run({ ...picking.command, url: command.url });
    } else if (result.prompt) {
      setPrompt({ result, value: result.prompt.initial });
    } else if (result.pick) {
      setPicking(result);
      setActionsOnly(false);
      setTyped('');
    } else {
      void run(result.command);
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    if (prompt) {
      setPrompt({ ...prompt, value: next });
      return;
    }
    const inserted = (event.nativeEvent as InputEvent).inputType?.startsWith('insert') ?? false;
    setCompleting(inserted && event.target.selectionStart === next.length);
    setTyped(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === 'ArrowDown' || (ctrl && event.key === 'n')) {
      select(index + 1);
    } else if (event.key === 'ArrowUp' || (ctrl && event.key === 'p')) {
      select(index - 1);
    } else if (event.key === 'Enter') {
      if (prompt) {
        const command = prompt.result.command;
        if (command.type === 'action' && prompt.value.trim()) {
          void run({ ...command, text: prompt.value });
        }
      } else {
        choose(results[index]);
      }
    } else if (event.key === 'Escape') {
      if (prompt) setPrompt(null);
      else if (picking || site || scope) {
        setPicking(null);
        setSite(null);
        setScope(null);
        setTyped('');
      } else host.close();
    } else if (event.key === 'Tab') {
      // After a site's keyword, Tab searches that site; otherwise it toggles actions-only (Arc).
      if (keyword) {
        setSite(keyword);
        setTyped('');
        setCompleting(false);
        press();
      } else if (scopeTyped) {
        setScope(scopeTyped);
        setTyped('');
        setCompleting(false);
      } else if (!prompt && !picking && !site && !scope) setActionsOnly(!actionsOnly);
    } else if (event.key === 'Backspace' && (actionsOnly || site || scope) && !value) {
      setActionsOnly(false);
      setSite(null);
      setScope(null);
    } else {
      if ((event.key === 'ArrowRight' || event.key === 'End') && completion) {
        // Accept the completion; the caret moves to its end by itself.
        setTyped(value);
        setCompleting(false);
      }
      return;
    }
    event.preventDefault();
  }

  const chip = prompt
    ? prompt.result.prompt!.label
    : picking
      ? picking.pick!.label
      : site
        ? site.name
        : scope
          ? SCOPE_NAMES[scope]
          : actionsMode
            ? 'Actions'
            : null;
  const placeholder = picking
    ? 'Search tabs or enter URL…'
    : site
      ? `Search ${site.name}…`
      : scope
        ? `Search ${SCOPE_NAMES[scope].toLowerCase()}…`
        : actionsMode
          ? 'Search actions…'
          : 'Search or Enter URL…';
  const layerStyle = {
    colorScheme: look.scheme,
    '--command-card': look.background,
    '--command-accent': accent,
  } as CSSProperties;

  return (
    <div
      className={styles.layer}
      data-placement={placement}
      style={layerStyle}
      onPointerDown={(event) => {
        // A press outside the card closes the bar, as in Arc.
        if (event.target === event.currentTarget) host.close();
      }}
    >
      <SiteDust burst={burst} color={site ? colorOf(site) : undefined} card={card} />
      <div ref={card} className={styles.card} role="dialog" aria-label="Command bar">
        <div className={styles.field}>
          <Search className={styles.fieldIcon} size={16} strokeWidth={2} aria-hidden />
          {chip && (
            <span
              key={site?.id ?? 'chip'}
              className={styles.chip}
              data-site={site ? '' : undefined}
              style={
                site
                  ? ({
                      '--site': colorOf(site),
                      '--on-site': readableOn(colorOf(site)),
                    } as CSSProperties)
                  : undefined
              }
            >
              {chip}
            </span>
          )}
          <input
            ref={input}
            className={styles.input}
            value={value}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="command-results"
            aria-activedescendant={results[index] ? `command-${index}` : undefined}
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          {(keyword || scopeTyped) && (
            <span
              key={keyword?.id ?? `@${scopeTyped}`}
              className={styles.keyHint}
              style={{ '--site': keyword ? colorOf(keyword) : accent } as CSSProperties}
            >
              Search <b className={styles.keySite}>{keyword?.name ?? SCOPE_NAMES[scopeTyped!]}</b>
              <kbd className={styles.key}>Tab</kbd>
            </span>
          )}
        </div>
        {results.length > 0 && (
          <ul ref={list} id="command-results" className={styles.list} role="listbox">
            {results.map((result, i) => (
              <li
                key={result.key}
                id={`command-${i}`}
                className={styles.row}
                role="option"
                aria-selected={i === index}
                onPointerDown={(event) => event.preventDefault()} // keep focus in the field
                onClick={() => choose(result)}
              >
                <ResultIcon result={result} />
                <span className={styles.title} dir="auto">
                  {result.title}
                  {result.detail && <span className={styles.detail}> {result.detail}</span>}
                </span>
                {result.hint && <span className={styles.hint}>{result.hint}</span>}
                {result.hint && (
                  <span className={styles.go} aria-hidden>
                    <ArrowRight size={14} strokeWidth={2.25} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {actionsMode && !prompt && results.length === 0 && (
          <p className={styles.empty}>No actions match “{query.trim()}”.</p>
        )}
      </div>
    </div>
  );
}

const ACTION_ICONS: Record<ActionId, LucideIcon> = {
  pinTab: Pin,
  unpinTab: PinOff,
  favoriteTab: Star,
  unfavoriteTab: StarOff,
  moveToSpace: ArrowRightLeft,
  archiveTab: Archive,
  closeTab: X,
  copyUrl: Link,
  copyMarkdown: Link2,
  duplicateTab: Copy,
  resetTab: RotateCcw,
  replacePin: Replace,
  renameTab: Pencil,
  splitView: Columns2,
  removeSplit: RectangleHorizontal,
  nextSpace: ChevronRight,
  previousSpace: ChevronLeft,
  newSpace: SquarePlus,
  newFolder: FolderPlus,
  clearToday: ListX,
  pasteUrl: ClipboardPaste,
  resetSpace: RotateCcw,
  togglePinned: ChevronsDownUp,
  revealTab: LocateFixed,
  viewArchive: Archive,
  viewDownloads: CircleArrowDown,
  clearArchive: ArchiveX,
  editTheme: Palette,
  editShortcuts: Keyboard,
  addSiteSearch: TextSearch,
  appearance: SunMoon,
  restoreSidebar: History,
  exportSidebar: Download,
  importArc: Import,
};

function ResultIcon({ result }: { result: Result }) {
  const spaces = useSidebar((state) => state.model.spaces);
  const { command } = result;
  if (command.type === 'search') {
    return <Search className={styles.icon} size={16} strokeWidth={2} aria-hidden />;
  }
  const spaceId =
    command.type === 'switchSpace' ||
    (command.type === 'action' && command.action === 'moveToSpace')
      ? command.spaceId
      : undefined;
  if (spaceId) {
    return (
      <span className={styles.icon}>
        <SpaceGlyph icon={spaces.find((space) => space.id === spaceId)?.icon} />
      </span>
    );
  }
  if (command.type === 'action') {
    const Icon =
      command.action === 'appearance'
        ? command.appearance === 'dark'
          ? Moon
          : command.appearance === 'light'
            ? Sun
            : SunMoon
        : ACTION_ICONS[command.action];
    return <Icon className={styles.icon} size={16} strokeWidth={1.75} aria-hidden />;
  }
  return (
    <span className={styles.icon}>
      <Favicon url={result.url ?? ''} />
    </span>
  );
}

function useCommandContext(sidebarOpen: boolean): CommandContext {
  const model = useSidebar((state) => state.model);
  const session = useSidebar((state) => state.session);
  const spaceId = useSidebar((state) => state.spaceId);
  const tabs = useTabs((state) => state.tabs);
  const activeId = useTabs((state) => state.activeId);
  const previousId = useTabs((state) => state.previousId);
  const todayIds = useTabs(useShallow((state) => selectTodayIds(state, spaceId)));
  const archive = useSidebar((state) => state.archive.entries);
  return useMemo(
    () => ({
      model,
      session,
      spaceId,
      tabs,
      activeId,
      previousId,
      todayIds,
      sidebarOpen,
      archive,
    }),
    [model, session, spaceId, tabs, activeId, previousId, todayIds, sidebarOpen, archive],
  );
}

/** History matching what's typed. The last answer stays until the next arrives. */
function useHistory(text: string, limit?: number): HistoryEntry[] {
  const [found, setFound] = useState(EMPTY);
  const query = text.trim();
  useEffect(() => {
    if (!query) return;
    let current = true;
    void searchHistory(query, limit).then((entries) => current && setFound(entries));
    return () => {
      current = false;
    };
  }, [query, limit]);
  return query ? found : EMPTY;
}

const NO_SUGGESTIONS: string[] = [];

/** A moment after typing stops. The last ones stay until the next arrive, so rows don't flicker. */
function useSiteSuggestions(site: Shortcut | null, text: string): string[] {
  const [found, setFound] = useState({ from: '', list: NO_SUGGESTIONS });
  const template = site ? suggestUrl(site) : undefined;
  const query = text.trim();
  useEffect(() => {
    if (!template || !query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchText(fillSearch(template, query), controller.signal).then((json) => {
        if (!controller.signal.aborted) {
          setFound({ from: template, list: json ? parseSuggestions(json) : NO_SUGGESTIONS });
        }
      });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [template, query]);
  return template && query && found.from === template ? found.list : NO_SUGGESTIONS;
}

function usePicks(): LearnedPick[] {
  const [picks, setPicks] = useState<LearnedPick[]>([]);
  useEffect(() => {
    let current = true;
    void loadPicks().then((loaded) => current && setPicks(loaded));
    return () => {
      current = false;
    };
  }, []);
  return picks;
}

/** Addresses typed before, loaded once, for inline completion. */
function useTypedAddresses(): HistoryEntry[] {
  const [typed, setTyped] = useState(EMPTY);
  useEffect(() => {
    let current = true;
    void searchHistory('', 500).then((entries) => current && setTyped(entries));
    return () => {
      current = false;
    };
  }, []);
  return typed;
}
