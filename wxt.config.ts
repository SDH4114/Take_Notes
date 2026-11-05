import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: '.',
  manifestVersion: 3,
  vite: () => ({ plugins: [preact()] }),
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ru',
    permissions: ['storage', 'activeTab', 'contextMenus', 'downloads', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    browser_specific_settings: {
      gecko: { id: 'take-notes@haos', strict_min_version: '128.0' },
    },
  },
});
