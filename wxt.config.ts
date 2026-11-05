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
    permissions: ['storage', 'contextMenus', 'downloads', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    commands: {
      'tn-save-selection': { suggested_key: { default: 'Alt+Shift+S' }, description: 'Save selection to TakeNotes' },
      'tn-save-page': { suggested_key: { default: 'Alt+Shift+P' }, description: 'Save page to TakeNotes' },
    },
    browser_specific_settings: {
      gecko: {
        id: 'take-notes@haos',
        strict_min_version: '140.0',
        // Everything stays local; nothing is collected or transmitted.
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
