import {
  animate,
  LayoutGroup,
  motion,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WheelGestures } from 'wheel-gestures';
import { switchSpace } from '@/app/actions';
import { spring } from '@/app/motion';
import { Pinned } from '@/app/pinned/Pinned';
import { Today } from '@/app/today/Today';
import type { Space } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { SpaceHeader } from './SpaceHeader';
import { constrainTrack, releaseTarget, SWIPE_SCALE } from './swipe';
import styles from './spaces.module.css';

/** A wheel notch from a mouse (Shift+scroll) rather than a trackpad's stream. */
const MOUSE_NOTCH = 50;

/**
 * Spaces side by side on a track, sliding on Arc's critically damped spring. Only the shown
 * space and its neighbours render (plus any crossed by a slide); the others are inert.
 */
export function SpacePager() {
  const spaces = useSidebar((state) => state.model.spaces);
  const spaceId = useSidebar((state) => state.spaceId);
  const index = Math.max(
    0,
    spaces.findIndex((space) => space.id === spaceId),
  );
  const viewport = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const reduced = useReducedMotion();

  // Read by the wheel handler, which is set up once.
  const live = useRef({ index, spaces, width: 0, releaseVelocity: null as number | null });
  live.current.index = index;
  live.current.spaces = spaces;

  // Pages crossed by a slide stay rendered until it settles.
  const [crossing, setCrossing] = useState<[number, number] | null>(null);
  const slide = useRef(0);
  const shownIndex = useRef(index);

  useLayoutEffect(() => {
    const element = viewport.current!;
    const measure = () => {
      live.current.width = element.clientWidth;
      if (!x.isAnimating()) x.set(-live.current.index * live.current.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [x]);

  // Slide to the shown space. A new switch mid-slide retargets from where it is.
  useEffect(() => {
    const from = shownIndex.current;
    shownIndex.current = index;
    const target = -index * live.current.width;
    const velocity = live.current.releaseVelocity ?? x.getVelocity();
    live.current.releaseVelocity = null;
    if (reduced || live.current.width === 0) {
      x.set(target);
      return;
    }
    if (x.get() === target) return;
    const token = ++slide.current;
    setCrossing([Math.min(from, index), Math.max(from, index)]);
    void animate(x, target, { ...spring.space, velocity }).then(() => {
      if (token === slide.current) setCrossing(null);
    });
  }, [index, reduced, x]);

  useEffect(() => trackSwipes(viewport.current!, x, live), [x]);

  const rendered = (i: number) =>
    Math.abs(i - index) <= 1 || (crossing !== null && i >= crossing[0] && i <= crossing[1]);

  return (
    <div ref={viewport} className={styles.viewport}>
      <motion.div className={styles.track} style={{ x }}>
        {spaces.map((space, i) => (
          <motion.section
            key={space.id}
            layoutRoot
            className={styles.page}
            data-active-page={i === index || undefined}
            inert={i !== index}
            aria-label={space.name}
          >
            {rendered(i) && (
              <LayoutGroup id={space.id}>
                <SpaceHeader spaceId={space.id} />
                <Pinned spaceId={space.id} />
                <Today spaceId={space.id} />
              </LayoutGroup>
            )}
          </motion.section>
        ))}
      </motion.div>
    </div>
  );
}

type Swipe =
  | { kind: 'ignore' }
  | { kind: 'done' }
  | { kind: 'track'; start: number; base: number; samples: { t: number; x: number }[] };

/**
 * Two-finger horizontal swipes drag the track. When the fingers lift (momentum begins)
 * the swipe commits to a page and the rest of the momentum is ignored.
 */
function trackSwipes(
  element: HTMLElement,
  x: MotionValue<number>,
  live: {
    current: { index: number; spaces: Space[]; width: number; releaseVelocity: number | null };
  },
) {
  const gestures = WheelGestures({ preventWheelAction: 'x' });
  const unobserve = gestures.observe(element);
  const sidebar = element.closest<HTMLElement>('[data-sidebar]');
  // Rows don't light up under the pointer while it swipes.
  const setSwiping = (on: boolean) => {
    if (!sidebar) return;
    if (on) sidebar.dataset.swiping = '';
    else delete sidebar.dataset.swiping;
  };
  let swipe: Swipe | null = null;

  const goTo = (target: number, velocity: number) => {
    const { index, spaces, width } = live.current;
    const space = spaces[target];
    if (!space) return;
    // Hand the release speed to the slide only if it points the same way.
    const towards = Math.sign(-target * width - x.get()) === Math.sign(velocity);
    const speed = towards ? velocity * 1000 : 0;
    if (target === index) {
      void animate(x, -target * width, { ...spring.space, velocity: speed });
    } else {
      live.current.releaseVelocity = speed;
      switchSpace(space.id);
    }
  };

  const off = gestures.on('wheel', (state) => {
    if (state.isStart) swipe = null;
    const [dx, dy] = state.axisMovement;

    if (!swipe) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return; // too early to tell the axis
      if (Math.abs(dy) > Math.abs(dx) || live.current.spaces.length < 2) {
        swipe = { kind: 'ignore' };
        return;
      }
      const delta = state.event.deltaX;
      if (Math.abs(delta) >= MOUSE_NOTCH && Number.isInteger(delta)) {
        // A mouse: one space per burst.
        swipe = { kind: 'done' };
        goTo(live.current.index + (dx < 0 ? 1 : -1), 0);
        return;
      }
      x.stop();
      setSwiping(true);
      swipe = {
        kind: 'track',
        start: live.current.index,
        base: x.get() - SWIPE_SCALE * dx,
        samples: [],
      };
    }

    if (swipe.kind !== 'track') {
      if (state.isEnding) swipe = null;
      return;
    }

    if (state.isMomentum || state.isEnding) {
      const { samples } = swipe;
      const first = samples[0];
      const last = samples.at(-1);
      const velocity =
        first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      const { spaces, width } = live.current;
      goTo(releaseTarget(x.get(), velocity, swipe.start, spaces.length, width), velocity);
      setSwiping(false);
      swipe = state.isEnding ? null : { kind: 'done' };
      return;
    }

    const { spaces, width } = live.current;
    x.set(constrainTrack(swipe.base + SWIPE_SCALE * dx, swipe.start, spaces.length, width));
    const now = performance.now();
    swipe.samples.push({ t: now, x: x.get() });
    while (swipe.samples.length > 2 && now - swipe.samples[0]!.t > 100) swipe.samples.shift();
  });

  return () => {
    off();
    unobserve();
    setSwiping(false);
  };
}
