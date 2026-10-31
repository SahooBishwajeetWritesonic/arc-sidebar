import { Archive, ArrowLeft } from 'lucide-react';
import { motion, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useState } from 'react';
import { ArchiveView } from '@/app/archive/ArchiveView';
import { Boundary } from '@/app/chrome/Boundary';
import { useUi } from '@/state/ui';
import { libraryShown, settleLibrary, slideLibrary } from './slide';
import styles from './library.module.css';

/** Arc's Library, left of the first space. */
export function Library() {
  const open = useUi((state) => state.view === 'archive');
  const reduced = useReducedMotion() ?? false;
  const [peeking, setPeeking] = useState(false);
  useMotionValueEvent(libraryShown, 'change', (shown) => setPeeking(shown > 0));
  useEffect(() => settleLibrary(open, reduced), [open, reduced]);
  const x = useTransform(libraryShown, (shown) => `${(shown - 1) * 100}%`);
  if (!open && !peeking) return null;

  return (
    <motion.section className={styles.library} style={{ x }} aria-label="Library" inert={!open}>
      <nav className={styles.rail} aria-label="Library sections">
        <div className={styles.sections}>
          <button type="button" className={styles.section} aria-current="page">
            <Archive size={22} strokeWidth={1.75} aria-hidden />
            Archived Tabs
          </button>
        </div>
        <button
          type="button"
          className={styles.back}
          aria-label="Back to sidebar"
          onClick={() => slideLibrary(false)}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
      </nav>
      <div className={styles.content}>
        <Boundary region="archive" what="The archive">
          <ArchiveView />
        </Boundary>
      </div>
    </motion.section>
  );
}
