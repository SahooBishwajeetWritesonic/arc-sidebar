import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FakePlatform } from './fake-platform';
import { manyTabs, startingTabs } from './fixtures';
import { Harness } from './Harness';
import '@/app/global.css';

// The fake Chrome lives here; the panel frame (panel.html) connects to it.
// ?tabs=200 opens that many more, for performance runs.
const extra = Number(new URLSearchParams(location.search).get('tabs')) || 0;
const platform = new FakePlatform([...startingTabs, ...manyTabs(extra)]);
window.harnessPlatform = platform;

declare global {
  interface Window {
    harnessPlatform: FakePlatform;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness platform={platform} />
  </StrictMode>,
);
