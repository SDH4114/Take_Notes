// Content-script part of the highlight module. Owner: agent C.
import type { ContentMessages, Handlers } from '@/src/core/messages';

/** Called once per page from entrypoints/content.ts. */
export function setupHighlightContent(): Handlers<ContentMessages> {
  return {};
}
