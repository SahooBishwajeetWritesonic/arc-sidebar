import { Tooltip } from '@base-ui/react/tooltip';
import { useEffect, useRef } from 'react';
import { useDrag } from '@/app/drag/drag';
import { titleTooltip } from './Title';
import styles from './title-tooltip.module.css';

/** Skipped while dragging and over preview cards. */
export function TitleTooltip() {
  const actions = useRef<Tooltip.Root.Actions>(null);
  const dragging = useDrag((state) => state.source !== null);
  useEffect(() => {
    if (dragging) actions.current?.close();
  }, [dragging]);

  return (
    <Tooltip.Root
      handle={titleTooltip}
      actionsRef={actions}
      disableHoverablePopup
      onOpenChange={(open, details) => {
        if (!open) return;
        const target = details.event?.target;
        const title = target instanceof Element ? target.closest('[data-title]') : null;
        if (title?.closest('[data-previewed]') || useDrag.getState().source !== null)
          details.cancel();
      }}
    >
      {({ payload }) => (
        <Tooltip.Portal>
          <Tooltip.Positioner
            className={styles.positioner}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
          >
            <Tooltip.Popup className={styles.popup} dir="auto" data-title-tooltip>
              {payload}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}
