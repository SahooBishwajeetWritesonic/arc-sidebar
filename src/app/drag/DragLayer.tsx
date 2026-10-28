import { Folder, Globe } from 'lucide-react';
import { createPortal } from 'react-dom';
import { setGhostElement, useDrag } from './drag';
import styles from './drag.module.css';

/** As in Arc, the list itself doesn't move during a drag: only the drop line and the ghost. */
export function DragLayer() {
  const ghost = useDrag((state) => state.ghost);
  const target = useDrag((state) => state.target);
  const line = target && target.lineY !== null ? target : null;
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
            style={{ width: ghost.width }}
            aria-hidden
          >
            {ghost.folder ? (
              <Folder className={styles.icon} size={16} strokeWidth={1.75} />
            ) : ghost.faviconUrl ? (
              <img className={styles.icon} src={ghost.faviconUrl} alt="" />
            ) : (
              <Globe className={styles.icon} size={16} strokeWidth={1.75} />
            )}
            <span className={styles.title}>{ghost.title}</span>
          </div>,
          document.body,
        )}
    </>
  );
}
