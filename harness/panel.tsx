import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { connect } from '@/state/connect';
import type { FakePlatform } from './fake-platform';
import '@/app/global.css';

// The sidebar as the side panel loads it, against the fake Chrome in the parent page.
const theme = new URLSearchParams(location.search).get('theme');
document.documentElement.style.colorScheme =
  theme === 'light' ? 'light' : theme === 'system' ? 'light dark' : 'dark';

const platform = (window.parent as Window & { harnessPlatform: FakePlatform }).harnessPlatform;
const connection = connect(platform);
// The frame reloads when the theme changes; stop the old one listening.
addEventListener('pagehide', () => void connection.then((disconnect) => disconnect()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
