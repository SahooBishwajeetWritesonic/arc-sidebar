import { Folder, Globe } from 'lucide-react';
import { createPortal } from 'react-dom';
import { GHOST_TILE, setGhostElement, useDrag } from './drag';
import styles from './drag.module.css';

/** As in Arc, the list itself doesn't move during a drag: only the drop line and the ghost. */
export function DragLayer() {
  const ghost = useDrag((state) => state.ghost);
  const target = useDrag((state) => state.target);
  const line = target && 'lineY' in target && target.lineY !== null ? target : null;
  const asTile = target?.section === 'favorites';
  const depth = line?.section === 'pinned' ? line.depth : 0;

  return (
    <>
      {line && (
        <div
          className={styles.line}
          data-drop-line
          style={{ top: line.lineY!, '--depth': depth } as React.CSSProperties}
          aria-hidden
        />
      )}
      {ghost &&
        createPortal(
          <div
            ref={setGhostElement}
            className={styles.ghost}
            data-tile={asTile || undefined}
            style={{ width: asTile ? GHOST_TILE.width : ghost.width }}
            aria-hidden
          >
            {ghost.folder ? (
              <Folder className={styles.icon} size={16} strokeWidth={1.75} />
            ) : ghost.faviconUrl ? (
              <img className={styles.icon} src={ghost.faviconUrl} alt="" />
            ) : (
              <Globe className={styles.icon} size={16} strokeWidth={1.75} />
            )}
            {!asTile && (
              <span className={styles.title} dir="auto">
                {ghost.title}
              </span>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
