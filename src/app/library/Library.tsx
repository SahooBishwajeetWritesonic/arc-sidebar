import { Archive, ArrowLeft, CircleArrowDown } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { useEffect, useState } from 'react';
import { ArchiveView } from '@/app/archive/ArchiveView';
import { Boundary } from '@/app/chrome/Boundary';
import { DownloadsView } from '@/app/downloads/DownloadsView';
import { fade } from '@/app/motion';
import { showLibrarySection, useUi, type LibrarySection } from '@/state/ui';
import { libraryShown, settleLibrary, slideLibrary } from './slide';
import styles from './library.module.css';

const SECTIONS: { value: LibrarySection; label: string; Icon: typeof Archive }[] = [
  { value: 'downloads', label: 'Downloads', Icon: CircleArrowDown },
  { value: 'archive', label: 'Archived Tabs', Icon: Archive },
];

/** Arc's Library, left of the first space. */
export function Library() {
  const open = useUi((state) => state.view === 'archive');
  const section = useUi((state) => state.librarySection);
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
          {SECTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              className={styles.section}
              aria-current={section === value ? 'page' : undefined}
              onClick={() => showLibrarySection(value)}
            >
              <Icon size={22} strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          ))}
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          >
            <Boundary region={section} what={section === 'archive' ? 'The archive' : 'Downloads'}>
              {section === 'archive' ? <ArchiveView /> : <DownloadsView />}
            </Boundary>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
