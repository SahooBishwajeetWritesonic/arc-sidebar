import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Arc Sidebar',
    description: "Arc's sidebar, in Chrome's side panel",
    permissions: [
      'sidePanel',
      'tabs',
      'storage',
      'unlimitedStorage',
      'favicon',
      'alarms',
      'history',
      'search',
      'scripting',
      'contextMenus',
      'offscreen',
      'clipboardWrite',
      // Arc's Paste URL as New Tab (⌘⌥V, and a folder's menu).
      'clipboardRead',
      // The URL bar's site menu: full-page capture and site permissions.
      'debugger',
      'contentSettings',
    ],
    // The command bar covers any page, as Arc's does.
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Toggle Arc Sidebar' },
    // Arc's shortcuts. Chrome suggests at most four keys and none it uses itself (Arc's ⌘S, ⌘T,
    // ⌘L, ⌘D, ⌘⇧C), so the top four get ⌥ keys; set the rest at chrome://extensions/shortcuts.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+S' },
        description: 'Show or hide the sidebar',
      },
      'command-bar': {
        suggested_key: { default: 'Alt+T' },
        description: 'Open the command bar',
      },
      'copy-url': {
        suggested_key: { default: 'Alt+Shift+C' },
        description: 'Copy URL',
      },
      capture: {
        suggested_key: { default: 'Alt+Shift+2' },
        description: 'Capture part of the page',
      },
      'edit-url': { description: 'Edit the current URL' },
      'copy-url-markdown': { description: 'Copy URL as Markdown' },
      'little-arc': { description: 'New Little Arc' },
      'recent-tabs': { description: "Recent tabs (Arc's Ctrl+Tab)" },
      'next-tab': { description: 'Next tab in the sidebar' },
      'previous-tab': { description: 'Previous tab in the sidebar' },
      'pin-tab': { description: 'Pin or unpin the current tab' },
      'clear-today': { description: 'Clear Today' },
      'next-space': { description: 'Next space' },
      'previous-space': { description: 'Previous space' },
      ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`space-${n}`, { description: `Go to space ${n}` }]),
      ),
      ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`tab-${n}`, { description: `Go to tab ${n}` }]),
      ),
      'tab-9': { description: 'Go to the last tab' },
    },
    web_accessible_resources: [{ resources: ['command.html'], matches: ['<all_urls>'] }],
  },
  // Load the unpacked build into the everyday Chrome profile instead of
  // launching a second browser (saves RAM on a 16 GB machine).
  webExt: { disabled: true },
});
