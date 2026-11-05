import { registerHandlers, type ContentMessages } from '@/src/core/messages';
import { setupExtractContent } from '@/src/extract/content';
import { setupHighlightContent } from '@/src/highlight/content';
import { setupCrawlContent } from '@/src/crawl/content';
import { setupYoutubeContent } from '@/src/youtube/content';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    registerHandlers<ContentMessages>({
      ...setupExtractContent(),
      ...setupHighlightContent(),
      ...setupCrawlContent(),
      ...setupYoutubeContent(),
    });
  },
});
