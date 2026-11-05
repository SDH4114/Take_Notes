// Content-script part of the crawl module. Owner: agent D.
import type { ContentMessages, Handlers } from '@/src/core/messages';

/** Called once per page from entrypoints/content.ts. */
export function setupCrawlContent(): Handlers<ContentMessages> {
  return {};
}
