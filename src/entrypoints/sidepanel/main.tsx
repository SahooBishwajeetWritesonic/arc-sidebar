import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { chromePlatform } from '@/platform/chrome';
import { connect } from '@/state/connect';
import { serveCommandBar } from './command-bar';
import '@/app/global.css';

void connect(chromePlatform, { media: true });
void chromePlatform.currentWindowId().then(serveCommandBar);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
