import { useEffect, useState } from 'react';
import { App } from '@/app/App';
import type { FakePlatform } from './fake-platform';
import { morePages } from './fixtures';
import styles from './harness.module.css';

type Scheme = 'light dark' | 'light' | 'dark';

export function Harness({ platform }: { platform: FakePlatform }) {
  const [width, setWidth] = useState(360);
  // ?theme=light|dark|system, so screenshots can pick a theme.
  const [scheme, setScheme] = useState<Scheme>(() => {
    const theme = new URLSearchParams(location.search).get('theme');
    return theme === 'light' ? 'light' : theme === 'system' ? 'light dark' : 'dark';
  });
  const [page, setPage] = useState(0);

  // On the root, so colours resolved on <body> follow it too.
  useEffect(() => {
    document.documentElement.style.colorScheme = scheme;
  }, [scheme]);

  const openTab = () => {
    platform.openTab(morePages[page % morePages.length]!);
    setPage(page + 1);
  };
  const burst = () => {
    for (let i = 0; i < 10; i++) platform.openTab(morePages[(page + i) % morePages.length]!);
    setPage(page + 10);
  };
  const closeActive = () => {
    const id = platform.activeTabId();
    if (id !== undefined) platform.closeTab(id);
  };

  return (
    <div className={styles.harness}>
      <aside className={styles.controls}>
        <h1>Arc Sidebar harness</h1>
        <p>The real app with a fake Chrome. Events arrive with Chrome-like latency.</p>

        <h2>Tabs (as if from Chrome)</h2>
        <button onClick={openTab}>Open tab</button>
        <button onClick={burst}>Open 10 tabs</button>
        <button onClick={closeActive}>Close active tab</button>
        <button onClick={() => platform.closeRandom()}>Close a random tab</button>
        <button onClick={() => platform.reloadRandom()}>Reload a random tab</button>
        <button onClick={() => platform.toggleAudibleRandom()}>Toggle audio</button>

        <h2>Panel</h2>
        <label>
          Width {width}px
          <input
            type="range"
            min={300}
            max={600}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </label>
        <label>
          Theme
          <select value={scheme} onChange={(event) => setScheme(event.target.value as Scheme)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="light dark">System</option>
          </select>
        </label>
      </aside>

      {/* Chrome draws a header above every side panel; this approximates it. */}
      <div className={styles.panel} style={{ width }}>
        <div className={styles.chromeHeader}>Arc Sidebar</div>
        <div className={styles.panelBody}>
          <App />
        </div>
      </div>
    </div>
  );
}
