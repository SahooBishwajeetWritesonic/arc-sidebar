import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { connect } from '@/state/connect';
import type { FakePlatform } from './fake-platform';
import '@/app/global.css';

// The sidebar as Chrome's side panel loads it, against the fake Chrome in the parent page.
// Its colour scheme follows the Appearance setting, which the harness's Theme control sets.

const platform = (window.parent as Window & { harnessPlatform: FakePlatform }).harnessPlatform;
const connection = connect(platform);
// The frame reloads when the theme changes; stop the old one listening.
addEventListener('pagehide', () => void connection.then((disconnect) => disconnect()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
