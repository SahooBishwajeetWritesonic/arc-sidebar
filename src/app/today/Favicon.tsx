import { useState } from 'react';
import { Globe } from 'lucide-react';
import type { TabInfo } from '@/platform/types';
import { faviconFor } from '@/state/tabs';
import styles from './today.module.css';

export function Favicon({ tab }: { tab: TabInfo }) {
  const src = faviconFor(tab);
  const [failed, setFailed] = useState<string | undefined>();

  if (tab.loading && !tab.favIconUrl) {
    return <span className={styles.spinner} aria-hidden />;
  }
  if (!src || failed === src) {
    return <Globe className={styles.favicon} size={16} strokeWidth={1.75} aria-hidden />;
  }
  return (
    <img
      className={styles.favicon}
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(src)}
    />
  );
}
