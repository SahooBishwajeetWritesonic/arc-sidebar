import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FakePlatform } from './fake-platform';
import { startingTabs } from './fixtures';
import { Harness } from './Harness';
import '@/app/global.css';

// The fake Chrome lives here; the panel frame (panel.html) connects to it.
const platform = new FakePlatform(startingTabs);
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
