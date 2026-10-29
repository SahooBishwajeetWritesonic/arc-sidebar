import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Favicon } from '@/app/rows/Favicon';
import { SpaceGlyph } from '@/app/spaces/icons';
import { themeAccent } from '@/app/theme/engine';
import { usePreferredScheme } from '@/app/theme/looks';
import type { SwitcherPost } from '@/platform/command-bar';
import { useSidebar } from '@/state/sidebar';
import { activateTab, closeTab, recentTabs, useTabs } from '@/state/tabs';
import type { CommandHost } from './CommandBar';
import styles from './recent-tabs.module.css';

/** Arc's switcher shows the five most recent tabs. */
const SHOWN = 5;

/**
 * Arc's Ctrl-Tab switcher over the page, the previous tab highlighted. Letting go of its keys
 * switches; W closes the highlighted tab. The page around it says if the keys are still held.
 */
export function RecentTabs({ host }: { host: Pick<CommandHost, 'close'> }) {
  const tabsReady = useTabs((state) => state.ready);
  const sidebarReady = useSidebar((state) => state.ready);
  const ready = tabsReady && sidebarReady;
  const scheme = usePreferredScheme();
  const tabs = useTabs((state) => state.tabs);
  const tabSpaces = useTabs((state) => state.tabSpaces);
  const model = useSidebar((state) => state.model);
  const bindings = useSidebar((state) => state.session.bindings);
  const [ids, setIds] = useState<number[] | null>(null);
  const [index, setIndex] = useState(1);
  // Switches when the shortcut's keys are let go; set once the page says they're held.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (ready) void recentTabs().then((found) => setIds(found));
  }, [ready]);

  const shown = (ids ?? []).filter((id) => tabs.has(id)).slice(0, SHOWN);
  const at = Math.max(0, Math.min(index, shown.length - 1));

  // The handlers below read the latest of these, not the render they were made in.
  const latest = useRef({ shown, at, held });
  latest.current = { shown, at, held };
  const done = useRef(false);

  // Once chosen or dismissed, nothing more: keys let go as it closes don't switch after all.
  const dismiss = () => {
    done.current = true;
    host.close();
  };
  const choose = (i: number) => {
    if (done.current) return;
    const id = latest.current.shown[i];
    dismiss();
    if (id !== undefined) activateTab(id);
  };
  const step = (by: number) => {
    const { length } = latest.current.shown;
    if (length) setIndex((latest.current.at + by + length) % length);
  };
  const closeHighlighted = () => {
    const id = latest.current.shown[latest.current.at];
    if (id === undefined) return;
    closeTab(id);
    setIds((current) => current?.filter((other) => other !== id) ?? null);
  };

  const drawn = ids !== null;
  useEffect(() => {
    if (!drawn) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== parent) return;
      const data = event.data as Partial<SwitcherPost> | null;
      if (data?.arcSwitcher === 'next') step(1);
      if (data?.arcSwitcher === 'held' && 'held' in data) {
        if (data.held) setHeld(true);
        else choose(latest.current.at); // let go while it was opening: Arc switches at once
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') step(event.shiftKey ? -1 : 1);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.code === 'Backquote')
        step(-1);
      else if (event.key === 'Enter') choose(latest.current.at);
      else if (event.key === 'Escape') dismiss();
      else if (event.code === 'KeyW' && !event.metaKey) closeHighlighted();
      else return;
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const stillHeld = event.ctrlKey || event.metaKey || event.altKey;
      if (latest.current.held && !stillHeld) choose(latest.current.at);
    };
    const onBlur = () => dismiss();
    addEventListener('message', onMessage);
    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    addEventListener('blur', onBlur);
    parent.postMessage({ arcSwitcher: 'ready' } satisfies SwitcherPost, '*');
    return () => {
      removeEventListener('message', onMessage);
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
    };
    // Set up once, when it's drawn: the handlers read `latest`.
  }, [drawn]);

  // A pinned tab's space is its pin's; Favorites belong to none.
  const spaceOf = (tabId: number) => {
    const itemId = Object.keys(bindings).find((id) => bindings[id] === tabId);
    const spaceId = itemId ? model.items[itemId]?.spaceId : tabSpaces[tabId];
    return model.spaces.find((space) => space.id === spaceId);
  };

  if (!drawn) return null;
  return (
    <div
      className={styles.layer}
      style={{ colorScheme: scheme }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <ul className={styles.card} role="listbox" aria-label="Recent tabs">
        {shown.map((id, i) => {
          const tab = tabs.get(id)!;
          const space = spaceOf(id);
          return (
            <li
              key={id}
              className={styles.row}
              role="option"
              aria-selected={i === at}
              style={{ '--tint': themeAccent(space?.theme) } as CSSProperties}
              onPointerMove={() => i !== at && setIndex(i)}
              onClick={() => choose(i)}
            >
              <Favicon url={tab.url} loading={tab.loading && !tab.favIconUrl} />
              <span className={styles.title} dir="auto">
                {tab.title}
              </span>
              {space && model.spaces.length > 1 && (
                <span className={styles.space}>
                  <SpaceGlyph icon={space.icon} size={13} />
                  <span>{space.name}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
