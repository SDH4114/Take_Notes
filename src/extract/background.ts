// Background part of the extract module. Owner: agent A.
import type { BackgroundMessages, Handlers } from '@/src/core/messages';

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupExtractBackground(): Handlers<BackgroundMessages> {
  return {};
}
