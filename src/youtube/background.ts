// Background part of the youtube module. Owner: youtube agent.
import type { BackgroundMessages, Handlers } from '@/src/core/messages';

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupYoutubeBackground(): Handlers<BackgroundMessages> {
  return {};
}
