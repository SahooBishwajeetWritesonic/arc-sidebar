import { Folder, Globe, Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SpaceGlyph } from '@/app/spaces/icons';
import { GHOST_CHIP, GHOST_TILE, setGhostElement, useDrag } from './drag';
import styles from './drag.module.css';

/** As in Arc, the list itself doesn't move during a drag: only the drop line and the ghost. */
export function DragLayer() {
  const ghost = useDrag((state) => state.ghost);
  const copying = useDrag((state) => state.copying);
  const target = useDrag((state) => state.target);
  const line = target && 'lineY' in target && target.lineY !== null ? target : null;
  // In the page, so it scrolls with the rows.
  const page = line && document.querySelector<HTMLElement>('[data-sidebar] [data-active-page]');
  const asTile = target?.section === 'favorites';
  const asChip = target?.section === 'space';
  const depth = line?.section === 'pinned' ? line.depth : 0;

  return (
    <>
      {line &&
        page &&
        createPortal(
          <div
            className={styles.line}
            data-drop-line
            style={{ top: line.lineY!, '--depth': depth } as React.CSSProperties}
            aria-hidden
          />,
          page,
        )}
      {ghost &&
        createPortal(
          <div
            ref={setGhostElement}
            className={styles.ghost}
            data-tile={asTile || undefined}
            data-chip={asChip || undefined}
            data-count={ghost.count}
            data-copy={copying || undefined}
            style={{ width: asTile ? GHOST_TILE.width : asChip ? GHOST_CHIP : ghost.width }}
            aria-hidden
          >
            {ghost.icon ? (
              <span className={styles.icon}>
                <SpaceGlyph icon={ghost.icon} />
              </span>
            ) : ghost.folder ? (
              <Folder className={styles.icon} size={16} strokeWidth={1.75} />
            ) : ghost.faviconUrl ? (
              <img className={styles.icon} src={ghost.faviconUrl} alt="" />
            ) : (
              <Globe className={styles.icon} size={16} strokeWidth={1.75} />
            )}
            {!asTile && !asChip && (
              <span className={styles.title} dir="auto">
                {ghost.title}
              </span>
            )}
            {ghost.count && <span className={styles.count}>{ghost.count}</span>}
            {copying && (
              <span className={styles.copy} aria-hidden>
                <Plus size={11} strokeWidth={3} />
              </span>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
