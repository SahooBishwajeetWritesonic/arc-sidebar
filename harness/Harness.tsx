import { useEffect, useState } from 'react';
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

  // The controls follow the chosen scheme; the panel follows the Appearance
  // setting, which this sets through the real service.
  useEffect(() => {
    document.documentElement.style.colorScheme = scheme;
    const appearance = scheme === 'light dark' ? 'auto' : scheme;
    void platform.service.handleIntent({ type: 'setAppearance', appearance });
  }, [scheme, platform]);

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
        <button onClick={() => platform.navigateActive()}>Follow a link in the active tab</button>

        <h2>Archive</h2>
        <button onClick={() => platform.ageTabs(13)}>Make inactive tabs 13 hours old</button>
        <button onClick={() => void platform.runAutoArchive()}>Run auto-archive now</button>

        <h2>Browser</h2>
        <button onClick={() => platform.restartChrome()}>
          Restart Chrome (clears the session)
        </button>
        <button onClick={() => platform.resetEverything()}>Reset everything</button>

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

      {/* Mimics Chrome's panel header; the frame gives the panel its own viewport. */}
      <div className={styles.panel} style={{ width }}>
        <div className={styles.chromeHeader}>Arc Sidebar</div>
        <iframe title="Sidebar" className={styles.frame} src="/panel.html" />
      </div>
    </div>
  );
}
