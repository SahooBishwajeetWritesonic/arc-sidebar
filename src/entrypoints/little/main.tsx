import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { CommandHost } from '@/app/command/CommandBar';
import { LittlePage } from '@/app/command/LittlePage';
import { chromePlatform } from '@/platform/chrome';
import type { Platform } from '@/platform/types';
import { connect } from '@/state/connect';
import '@/app/global.css';

/** A new Little Arc's first page: what's chosen in the command bar loads in this window. */
let leaving = false;
const platform: Platform = {
  ...chromePlatform,
  navigateTab(tabId, url) {
    leaving = true;
    chromePlatform.navigateTab(tabId, url);
  },
  searchWeb(text, tabId) {
    leaving = true;
    chromePlatform.searchWeb(text, tabId);
  },
};
void connect(platform);

const host: CommandHost = {
  // Esc (or a press beside the bar) closes an empty Little Arc. Once
  // something was chosen, the page is on its way out by itself.
  close: () => {
    if (leaving) return;
    void browser.tabs.getCurrent().then((tab) => {
      if (tab?.id !== undefined) void browser.tabs.remove(tab.id);
    });
  },
  runInSidebar: async () => false,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LittlePage host={host} />
  </StrictMode>,
);
