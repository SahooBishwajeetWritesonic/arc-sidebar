import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { chromePlatform } from '@/platform/chrome';
import { connect } from '@/state/connect';
import '@/app/global.css';

void connect(chromePlatform);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
