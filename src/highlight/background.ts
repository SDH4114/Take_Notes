// Background part of the highlight module. Owner: agent C.
import type { BackgroundMessages, Handlers } from '@/src/core/messages';

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupHighlightBackground(): Handlers<BackgroundMessages> {
  return {};
}
