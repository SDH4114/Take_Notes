import { registerHandlers, type BackgroundMessages } from '@/src/core/messages';
import { setupExtractBackground } from '@/src/extract/background';
import { setupProjectsBackground } from '@/src/projects/background';
import { setupHighlightBackground } from '@/src/highlight/background';
import { setupCrawlBackground } from '@/src/crawl/background';
import { setupExportBackground } from '@/src/export/background';
import { setupYoutubeBackground } from '@/src/youtube/background';

export default defineBackground(() => {
  registerHandlers<BackgroundMessages>({
    ...setupExtractBackground(),
    ...setupProjectsBackground(),
    ...setupHighlightBackground(),
    ...setupCrawlBackground(),
    ...setupExportBackground(),
    ...setupYoutubeBackground(),
  });
});
