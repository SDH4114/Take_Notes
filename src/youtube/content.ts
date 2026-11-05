// Content-script part of the youtube module. Owner: youtube agent.
import type { ContentMessages, Handlers } from '@/src/core/messages';

/** Called once per page from entrypoints/content.ts. */
export function setupYoutubeContent(): Handlers<ContentMessages> {
  return {};
}
