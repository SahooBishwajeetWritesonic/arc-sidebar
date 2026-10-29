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
      // The URL bar's site menu: full-page capture and site permissions.
      'debugger',
      'contentSettings',
    ],
    // The command bar covers any page, as Arc's does.
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Toggle Arc Sidebar' },
    commands: {
      'command-bar': {
        suggested_key: { default: 'Alt+T' },
        description: 'Open the command bar',
      },
      // Arc's ⌘⇧C is Chrome's DevTools shortcut, which extensions can't take
      // by default; set it yourself in chrome://extensions/shortcuts.
      'copy-url': {
        suggested_key: { default: 'Alt+Shift+C' },
        description: 'Copy URL',
      },
      'copy-url-markdown': { description: 'Copy URL as Markdown' },
    },
    web_accessible_resources: [{ resources: ['command.html'], matches: ['<all_urls>'] }],
  },
  // Load the unpacked build into the everyday Chrome profile instead of
  // launching a second browser (saves RAM on a 16 GB machine).
  webExt: { disabled: true },
});
