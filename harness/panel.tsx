import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { runInSidebar } from '@/app/command/sidebar';
import { connect } from '@/state/connect';
import { toggleCommandBar } from '@/state/ui';
import type { FakePlatform } from './fake-platform';
import '@/app/global.css';

// The sidebar as Chrome's side panel loads it, against the fake Chrome in the parent page.
// Its colour scheme follows the Appearance setting, which the harness's Theme control sets.

const platform = (window.parent as Window & { harnessPlatform: FakePlatform }).harnessPlatform;
const connection = connect(platform);
// The frame reloads when the theme changes; stop the old one listening.
addEventListener('pagehide', () => void connection.then((disconnect) => disconnect()));

/** What the harness's command bar frame calls, where the extension sends messages. */
export interface HarnessPanel {
  runInSidebar: typeof runInSidebar;
}
(window as Window & { harnessPanel?: HarnessPanel }).harnessPanel = { runInSidebar };

// In Chrome the shortcut opens the bar in the sidebar when the sidebar has
// focus; here the sidebar frame hears ⌥T itself.
addEventListener('keydown', (event) => {
  if (event.altKey && event.code === 'KeyT') {
    event.preventDefault();
    toggleCommandBar();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
