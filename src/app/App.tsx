import { MotionConfig } from 'motion/react';
import { useTabs } from '@/state/tabs';
import { Today } from './today/Today';

export function App() {
  const ready = useTabs((state) => state.ready);
  return (
    // reducedMotion="user": with Reduce Motion on, movement is skipped and fades stay.
    <MotionConfig reducedMotion="user">
      <main style={{ padding: '8px var(--pad-side)', color: 'var(--ink)' }}>
        {ready && <Today />}
      </main>
    </MotionConfig>
  );
}
