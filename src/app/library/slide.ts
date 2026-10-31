import { animate, motionValue } from 'motion/react';
import { spring } from '@/app/motion';
import { showView, useUi } from '@/state/ui';

/** 0 closed, 1 open. */
export const libraryShown = motionValue(0);

let releaseVelocity = 0;

/** `velocity` is a swipe's speed, in progress per second. */
export function slideLibrary(open: boolean, velocity = 0) {
  if ((useUi.getState().view === 'archive') === open) return settleLibrary(open, false, velocity);
  releaseVelocity = velocity;
  showView(open ? 'archive' : 'sidebar');
}

export function settleLibrary(open: boolean, reduced: boolean, velocity?: number) {
  const target = open ? 1 : 0;
  const speed = velocity ?? releaseVelocity;
  releaseVelocity = 0;
  if (reduced) return libraryShown.jump(target);
  if (libraryShown.get() === target) return;
  void animate(libraryShown, target, { ...spring.space, velocity: speed, restDelta: 0.001 });
}
