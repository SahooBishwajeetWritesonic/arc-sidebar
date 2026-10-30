import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { fade, spring } from '@/app/motion';
import { dismissToast, useToast, type Toast } from './toast';
import styles from './toast.module.css';

/** How long a toast stays; the timer pauses while the pointer is on it. */
const VISIBLE_MS = 5000;

export function ToastLayer() {
  const toast = useToast((state) => state.toast);
  return (
    <div className={styles.layer} aria-live="polite">
      <AnimatePresence>{toast && <ToastView key={toast.id} toast={toast} />}</AnimatePresence>
    </div>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(VISIBLE_MS);
  const total = toast.merge?.total;

  // Another Undo merged in: its time starts again.
  useEffect(() => {
    remaining.current = VISIBLE_MS;
  }, [total]);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissToast(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, toast.id, total]);

  return (
    <motion.div
      className={styles.toast}
      role="status"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: fade }}
      transition={{ y: spring.row, opacity: fade }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <span className={styles.message}>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.action!.run();
            dismissToast(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </motion.div>
  );
}
