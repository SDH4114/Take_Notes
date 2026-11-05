// Background part of the projects module. Owner: agent B.
import type { BackgroundMessages, Handlers } from '@/src/core/messages';

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupProjectsBackground(): Handlers<BackgroundMessages> {
  return {};
}
