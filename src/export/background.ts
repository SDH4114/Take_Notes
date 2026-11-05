// Background part of the export module. Owner: agent E.
import type { BackgroundMessages, Handlers } from '@/src/core/messages';

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupExportBackground(): Handlers<BackgroundMessages> {
  return {};
}
