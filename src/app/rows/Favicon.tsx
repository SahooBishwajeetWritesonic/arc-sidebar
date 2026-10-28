import { useState } from 'react';
import { Globe } from 'lucide-react';
import { faviconFor } from '@/state/tabs';
import styles from './rows.module.css';

export function Favicon({ url, loading }: { url: string; loading?: boolean }) {
  const src = faviconFor(url);
  const [failed, setFailed] = useState<string | undefined>();

  if (loading) return <span className={styles.spinner} aria-hidden />;
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
