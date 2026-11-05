// Content-script part of the extract module. Owner: agent A.
import type { ContentMessages, Handlers } from '@/src/core/messages';

/** Called once per page from entrypoints/content.ts. */
export function setupExtractContent(): Handlers<ContentMessages> {
  return {};
}
