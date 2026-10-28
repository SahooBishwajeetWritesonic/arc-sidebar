import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { chromePlatform } from '@/platform/chrome';
import { connectTabs } from '@/state/tabs';
import '@/app/global.css';

void connectTabs(chromePlatform);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
