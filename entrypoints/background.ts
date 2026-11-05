import { registerHandlers, type BackgroundMessages } from '@/src/core/messages';
import { browser } from 'wxt/browser';
import { createExtractMenus, setupExtractBackground } from '@/src/extract/background';
import { setupProjectsBackground } from '@/src/projects/background';
import { createHighlightMenus, setupHighlightBackground } from '@/src/highlight/background';
import { setupCrawlBackground } from '@/src/crawl/background';
import { setupExportBackground } from '@/src/export/background';
import { setupYoutubeBackground } from '@/src/youtube/background';

export default defineBackground(() => {
  // One owner for context menus: wipe and recreate all items on install/update to avoid duplicate-id errors.
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus
      .removeAll()
      .then(() => {
        createExtractMenus();
        createHighlightMenus();
      })
      .catch((e) => console.error('[TakeNotes] menu setup failed', e));
  });
  registerHandlers<BackgroundMessages>({
    ...setupExtractBackground(),
    ...setupProjectsBackground(),
    ...setupHighlightBackground(),
    ...setupCrawlBackground(),
    ...setupExportBackground(),
    ...setupYoutubeBackground(),
  }, {
    // The only messages content scripts send; highlight handlers additionally check the sender's page URL.
    allowFromWebPages: ['highlight/save', 'highlight/delete', 'highlight/listForUrl', 'highlight/palette'],
  });
});
