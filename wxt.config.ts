import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Arc Sidebar',
    description: "Arc's sidebar, in Chrome's side panel",
    permissions: ['sidePanel', 'tabs', 'storage', 'unlimitedStorage', 'favicon'],
    action: { default_title: 'Toggle Arc Sidebar' },
  },
  // Load the unpacked build into the everyday Chrome profile instead of
  // launching a second browser (saves RAM on a 16 GB machine).
  webExt: { disabled: true },
});
