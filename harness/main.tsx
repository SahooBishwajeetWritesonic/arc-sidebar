import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { connectTabs } from '@/state/tabs';
import { FakePlatform } from './fake-platform';
import { startingTabs } from './fixtures';
import { Harness } from './Harness';
import '@/app/global.css';

const platform = new FakePlatform(startingTabs);
void connectTabs(platform);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness platform={platform} />
  </StrictMode>,
);
