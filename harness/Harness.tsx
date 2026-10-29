import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CLOSE_MESSAGE, type SwitcherPost } from '@/platform/command-bar';
import { trackModifiers } from '@/platform/modifiers';
import { startingAppearance, type FakePlatform } from './fake-platform';
import { morePages } from './fixtures';
import styles from './harness.module.css';

type Scheme = 'light dark' | 'light' | 'dark';

export function Harness({ platform }: { platform: FakePlatform }) {
  const [width, setWidth] = useState(360);
  const [scheme, setScheme] = useState<Scheme>(() => {
    const appearance = startingAppearance();
    return appearance === 'auto' ? 'light dark' : appearance;
  });
  const [page, setPage] = useState(0);
  const [commandBar, setCommandBar] = useState(false);
  const [switcher, setSwitcher] = useState<'loading' | 'shown' | null>(null);
  const switcherFrame = useRef<HTMLIFrameElement>(null);
  const [held] = useState(() => trackModifiers(window));

  // ⌥T and ⌃. stand in for the command bar and recent-tabs shortcuts. This page plays the
  // overlay script's part, watching the keys until the list is drawn.
  useEffect(() => {
    const post = (message: SwitcherPost) =>
      switcherFrame.current?.contentWindow?.postMessage(message, '*');
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'KeyT') {
        event.preventDefault();
        setCommandBar((open) => !open);
      }
      if (event.ctrlKey && event.code === 'Period') {
        event.preventDefault();
        if (switcherFrame.current) post({ arcSwitcher: 'next' });
        else setSwitcher('loading');
      }
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | (Partial<typeof CLOSE_MESSAGE> & Partial<SwitcherPost> & { harnessSwitcher?: string })
        | null;
      const fromSwitcher = event.source === switcherFrame.current?.contentWindow;
      if (data?.arcCommandBar === CLOSE_MESSAGE.arcCommandBar) {
        if (fromSwitcher) setSwitcher(null);
        else setCommandBar(false);
      }
      if (fromSwitcher && data?.arcSwitcher === 'ready') {
        const stillHeld = held();
        post({ arcSwitcher: 'held', held: stillHeld });
        if (stillHeld) setSwitcher('shown');
      }
      if (fromSwitcher && data?.harnessSwitcher === 'again') post({ arcSwitcher: 'next' });
    };
    addEventListener('keydown', onKey);
    addEventListener('message', onMessage);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('message', onMessage);
    };
  }, []);

  // Shown, the list takes the keyboard (a hidden frame can't take focus).
  useEffect(() => {
    if (switcher === 'shown') switcherFrame.current?.focus();
  }, [switcher]);

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
    <div className={styles.harness} style={{ '--panel-width': `${width}px` } as CSSProperties}>
      <aside className={styles.controls}>
        <h1>Arc Sidebar harness</h1>
        <p>The real app with a fake Chrome. Events arrive with Chrome-like latency.</p>

        <h2>Command bar</h2>
        <button onClick={() => setCommandBar(true)}>Open over the page (⌥T)</button>
        <p>Recent tabs (Arc’s Ctrl-Tab): hold ⌃ and press . over the page.</p>

        <h2>Tabs (as if from Chrome)</h2>
        <button onClick={openTab}>Open tab</button>
        <button onClick={burst}>Open 10 tabs</button>
        <button onClick={closeActive}>Close active tab</button>
        <button onClick={() => platform.closeRandom()}>Close a random tab</button>
        <button onClick={() => platform.reloadRandom()}>Reload a random tab</button>
        <button onClick={() => platform.reloadAll()}>Reload every tab</button>
        <button onClick={() => platform.toggleAudibleRandom()}>Toggle audio</button>
        <button onClick={() => platform.navigateActive()}>Follow a link in the active tab</button>
        <button onClick={() => platform.splitActiveWithNext()}>
          Split the active tab with the next one
        </button>

        <h2>GitHub</h2>
        <button onClick={() => platform.openPullRequestPage()}>Open a pull request</button>
        <button onClick={() => void platform.requestReview()}>Someone asks for a review</button>
        <button onClick={() => void platform.mergePullRequest()}>Merge the newest</button>
        <button onClick={() => void platform.setGitHubSignedIn(false)}>Sign out of GitHub</button>
        <button onClick={() => void platform.setGitHubSignedIn(true)}>Sign in to GitHub</button>

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

      {commandBar && (
        <iframe title="Command bar" className={styles.commandFrame} src="/command.html" />
      )}
      {switcher && (
        <iframe
          ref={switcherFrame}
          title="Recent tabs"
          className={styles.commandFrame}
          src="/command.html?switcher"
          style={{ visibility: switcher === 'shown' ? undefined : 'hidden' }}
        />
      )}

      {/* Mimics Chrome's panel header; the frame gives the panel its own viewport. */}
      <div className={styles.panel} style={{ width }}>
        <div className={styles.chromeHeader}>Arc Sidebar</div>
        <iframe title="Sidebar" className={styles.frame} src="/panel.html" />
      </div>
    </div>
  );
}
