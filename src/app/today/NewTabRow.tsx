import { Plus } from 'lucide-react';
import { openNewTab } from '@/state/tabs';
import styles from './today.module.css';

export function NewTabRow() {
  return (
    <button type="button" className={styles.newTab} onClick={openNewTab}>
      <span className={styles.plate}>
        <Plus className={styles.favicon} size={16} strokeWidth={2} aria-hidden />
        <span className={styles.title}>New Tab</span>
      </span>
    </button>
  );
}
