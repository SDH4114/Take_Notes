import { registerHandlers, type ContentMessages } from '@/src/core/messages';
import { setupExtractContent } from '@/src/extract/content';
import { setupHighlightContent } from '@/src/highlight/content';
import { setupCrawlContent } from '@/src/crawl/content';
import { setupYoutubeContent } from '@/src/youtube/content';
import { gateHandlers } from '@/src/sites/content';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Every request from the extension is refused while TakeNotes is off globally or for this site.
    registerHandlers<ContentMessages>(gateHandlers<ContentMessages>({
      ...setupExtractContent(),
      ...setupHighlightContent(),
      ...setupCrawlContent(),
      ...setupYoutubeContent(),
    }));
  },
});
