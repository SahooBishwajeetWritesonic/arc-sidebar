import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { chromePlatform } from '@/platform/chrome';
import { connect } from '@/state/connect';
import { serveCommandBar } from './command-bar';
import { serveNotes } from './notes';
import { serveSelection } from './selection';
import '@/app/global.css';

void connect(chromePlatform, { media: true });
void chromePlatform.currentWindowId().then((windowId) => {
  serveCommandBar(windowId);
  serveNotes(windowId);
  serveSelection(windowId);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
