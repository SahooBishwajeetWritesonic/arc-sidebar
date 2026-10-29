import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { spring } from '@/app/motion';
import styles from '@/app/rows/rows.module.css';
import { setCommandBar } from '@/state/ui';

export function NewTabRow() {
  return (
    <motion.button
      layout="position"
      transition={{ layout: spring.row }}
      type="button"
      className={styles.newTab}
      data-nav-row="newtab"
      // As in Arc, "New Tab" opens the command bar.
      onClick={() => setCommandBar(true)}
    >
      <span className={styles.plate}>
        <Plus className={styles.favicon} size={16} strokeWidth={2} aria-hidden />
        <span className={styles.title}>New Tab</span>
      </span>
    </motion.button>
  );
}
