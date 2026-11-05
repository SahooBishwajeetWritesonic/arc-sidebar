import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FakePlatform } from './fake-platform';
import {
  calendarFeed,
  downloadFixtures,
  edgeTabs,
  gmailInbox,
  historyPages,
  manyTabs,
  openSearchSites,
  pullRequests,
  startingTabs,
  suggestionsFor,
} from './fixtures';
import { Harness } from './Harness';
import '@/app/global.css';

// The fake Chrome lives here; the panel frame connects to it. ?tabs=N opens N more for perf
// runs; ?fixture=edge adds titles and pages that break naive rows.
const params = new URLSearchParams(location.search);
const extra = Number(params.get('tabs')) || 0;
const edge = params.get('fixture') === 'edge' ? edgeTabs : [];
const platform = new FakePlatform(
  [...startingTabs, ...edge, ...manyTabs(extra)],
  historyPages,
  pullRequests,
  gmailInbox,
  calendarFeed,
  downloadFixtures,
  { openSearch: openSearchSites, suggestions: suggestionsFor },
);
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
