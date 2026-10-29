import { Check, Link } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconSwap } from '@/app/rows/IconSwap';
import { addressLabel, isDeveloperSite } from '@/model/urls';
import { useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';
import { editAddress } from '@/state/ui';
import { copyPageUrl } from './page-actions';
import { SiteMenu } from './SiteMenu';
import styles from './url-bar.module.css';

/**
 * Arc's URL bar: the page's site (its whole address in Developer Mode). Clicking it
 * edits the address in the command bar, as ⌘L does.
 */
export function UrlBar() {
  const tab = useTabs((state) =>
    state.activeId === null ? undefined : state.tabs.get(state.activeId),
  );
  const developerSites = useSidebar((state) => state.model.settings.developerSites);
  const [menuOpen, setMenuOpen] = useState(false);
  // The copy button shows a tick for a moment after it copies.
  const [copied, setCopied] = useState(0);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(0), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const url = tab?.url ?? '';
  const developer = isDeveloperSite(developerSites, url);
  const label = addressLabel(url, developer);

  return (
    <header className={styles.bar} data-menu-open={menuOpen || undefined}>
      <div className={styles.pill}>
        <button
          type="button"
          className={styles.address}
          title={label ? url : undefined}
          aria-label={label ? `Edit address, ${url}` : 'Search or enter an address'}
          onClick={() => editAddress(label ? url : '')}
        >
          {label ? (
            <span className={styles.text} dir="auto">
              {label}
            </span>
          ) : (
            <span className={styles.prompt}>Search or Enter URL…</span>
          )}
        </button>
        {tab && label && (
          <div className={styles.accessories}>
            <button
              type="button"
              className={styles.accessory}
              aria-label="Copy URL"
              title="Copy URL"
              onClick={() => {
                copyPageUrl(tab);
                setCopied(Date.now());
              }}
            >
              <IconSwap
                on={copied > 0}
                off={<Link size={15} strokeWidth={1.75} />}
                to={<Check size={15} strokeWidth={2} />}
              />
            </button>
            <SiteMenu tab={tab} developer={developer} onOpenChange={setMenuOpen} />
          </div>
        )}
      </div>
    </header>
  );
}
