import { PreviewCard } from '@base-ui/react/preview-card';
import { useRef, useState, type ReactNode } from 'react';
import { pressPin } from '@/app/actions';
import { useDrag } from '@/app/drag/drag';
import { Favicon } from '@/app/rows/Favicon';
import { descendants } from '@/model/tree';
import type { PinItem } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';
import styles from './folder-preview.module.css';

/**
 * Arc's Folder Preview: hovering a closed folder's name shows its tabs, to scroll or search.
 * A picked tab peeks out under the closed folder. Not while something's dragged.
 */
export function FolderPreview({
  folderId,
  name,
  children,
}: {
  folderId: string;
  name: string;
  children: ReactNode;
}) {
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
        render={<span />}
        className={styles.trigger}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        {/* Under the whole row, as wide as it. */}
        <PreviewCard.Positioner
          className={styles.positioner}
          anchor={() => trigger.current?.closest('[data-nav-row]') ?? null}
          side="bottom"
          align="start"
          sideOffset={2}
        >
          <PreviewCard.Popup className={styles.popup}>
            <Tabs folderId={folderId} name={name} onPicked={() => setOpen(false)} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

function Tabs({
  folderId,
  name,
  onPicked,
}: {
  folderId: string;
  name: string;
  onPicked: () => void;
}) {
  const model = useSidebar((state) => state.model);
  const bindings = useSidebar((state) => state.session.bindings);
  const tabs = useTabs((state) => state.tabs);
  const activeId = useTabs((state) => state.activeId);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const pins = descendants(model, folderId).filter((item): item is PinItem => item.kind === 'pin');
  const titleOf = (pin: PinItem) => pin.customTitle ?? pin.title;
  const shown = needle
    ? pins.filter((pin) => `${titleOf(pin)} ${pin.url}`.toLowerCase().includes(needle))
    : pins;
  const pick = (pin: PinItem) => {
    pressPin(pin.id);
    onPicked();
  };

  return (
    <>
      <input
        className={styles.search}
        type="search"
        placeholder={`Search ${name}`}
        aria-label={`Search ${name}`}
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && shown[0]) pick(shown[0]);
        }}
      />
      {shown.length ? (
        <ul className={styles.list} aria-label={`Tabs in ${name}`}>
          {shown.map((pin) => {
            const tabId = bindings[pin.id];
            const tab = tabId === undefined ? undefined : tabs.get(tabId);
            return (
              <li key={pin.id}>
                <button
                  type="button"
                  className={styles.item}
                  data-selected={(tab && tab.id === activeId) || undefined}
                  onClick={() => pick(pin)}
                >
                  <Favicon url={tab?.url ?? pin.url} />
                  <span className={styles.title} dir="auto">
                    {titleOf(pin)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>{needle ? 'No tabs match.' : 'Nothing in this folder yet.'}</p>
      )}
    </>
  );
}
