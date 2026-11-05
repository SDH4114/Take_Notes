// Background part of the crawl module. Owner: agent D.
import type { BackgroundMessages, Handlers } from '@/src/core/messages';

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupCrawlBackground(): Handlers<BackgroundMessages> {
  return {};
}
