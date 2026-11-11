import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { vendorLintPatches } from './build/vendor-lint-patches';

// One codebase, two targets: `wxt -b firefox` (default here) and `wxt -b chrome`.
export default defineConfig({
  srcDir: '.',
  manifestVersion: 3,
  // vendorLintPatches: removes AMO-linter-flagged code from third-party libraries (see the file).
  vite: () => ({ plugins: [preact(), vendorLintPatches()] }),
  manifest: ({ browser }) => {
    const firefox = browser === 'firefox';
    return {
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'ru',
      homepage_url: 'https://amikolabs.com',
      // Chrome: the service worker has no DOM → offscreen document (src/core/dom.ts). `sidePanel` is added by WXT.
      permissions: ['storage', 'contextMenus', 'downloads', 'tabs', 'scripting', ...(firefox ? [] : ['offscreen'])],
      host_permissions: ['<all_urls>'],
      commands: {
        'tn-save-selection': { suggested_key: { default: 'Alt+Shift+S' }, description: 'Save selection to TakeNotes' },
        'tn-save-page': { suggested_key: { default: 'Alt+Shift+P' }, description: 'Save page to TakeNotes' },
      },
      ...(firefox
        ? {
          // Firefox shows this as the add-on developer.
          developer: { name: 'AmikoLabs', url: 'https://amikolabs.com' },
          browser_specific_settings: {
            gecko: {
              // Add-on ID = owner. Changing it makes Firefox treat this as a different add-on (old local data is not carried over).
              id: 'take-notes@amikolabs.com',
              strict_min_version: '140.0',
              // Everything stays local; nothing is collected or transmitted.
              data_collection_permissions: { required: ['none'] },
            },
            // Firefox for Android supports data_collection_permissions only from 142.
            gecko_android: { strict_min_version: '142.0' },
          },
        }
        // sidePanel.open() needs 116; runtime.getContexts (offscreen check) 116.
        : { minimum_chrome_version: '116' }),
    };
  },
});
