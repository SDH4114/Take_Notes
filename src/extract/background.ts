// Background part of the extract module. Owner: agent A.
import { browser } from 'wxt/browser';
import { broadcast, resolveTabId, sendToTab, type BackgroundMessages, type Handlers } from '@/src/core/messages';
import { clips, settings } from '@/src/core/storage';
import type { Clip, ClipKind } from '@/src/core/types';
import { newId, nowIso } from '@/src/core/util';
import { t } from './strings';

export const MENU_SELECTION = 'tn-extract-selection';
export const MENU_PAGE = 'tn-extract-page';
/** Command names for wxt.config.ts manifest `commands` (the listener is harmless if undeclared). */
export const COMMAND_SAVE_SELECTION = 'tn-save-selection';
export const COMMAND_SAVE_PAGE = 'tn-save-page';

interface SavePayload { tabId?: number; projectId?: string | null }

/** Extract in the tab and persist as a clip. Returns null when there is no selection. */
export async function saveClip(kind: 'page' | 'selection', payload: SavePayload): Promise<Clip | null> {
  const tabId = await resolveTabId(payload.tabId);
  const result = kind === 'page' ? await sendToTab(tabId, 'content/extractPage') : await sendToTab(tabId, 'content/extractSelection');
  if (!result) return null;

  // `payload.projectId` may legitimately be null (Inbox), so only undefined falls back to the default.
  const projectId = payload.projectId !== undefined ? payload.projectId : (await settings.get()).defaultProjectId;
  const now = nowIso();
  const clip: Clip = {
    id: newId(),
    projectId,
    kind: kind satisfies ClipKind,
    title: result.title,
    html: result.html,
    markdown: result.markdown,
    source: result.source,
    tags: [],
    order: await clips.nextOrder(projectId),
    assetIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await clips.put(clip);
  broadcast('data/changed', { kind: 'clip' });
  return clip;
}

/** Toolbar badge feedback: "✓" / "!" for 2 s. Never throws. */
async function flashBadge(text: '✓' | '!'): Promise<void> {
  try {
    await browser.action.setBadgeText({ text });
    setTimeout(() => void browser.action.setBadgeText({ text: '' }).catch(() => {}), 2000);
  } catch {
    // no action API available (tests) or tab closed: feedback is best-effort
  }
}

async function saveWithBadge(kind: 'page' | 'selection', tabId?: number): Promise<void> {
  try {
    const clip = await saveClip(kind, { tabId });
    await flashBadge(clip ? '✓' : '!');
  } catch (e) {
    console.error('[TakeNotes] save failed', e);
    await flashBadge('!');
  }
}

function registerMenusAndCommands(): void {
  browser.runtime?.onInstalled?.addListener(() => {
    void (async () => {
      await browser.contextMenus.removeAll();
      browser.contextMenus.create({ id: MENU_SELECTION, title: t('menuSelection'), contexts: ['selection'] });
      browser.contextMenus.create({ id: MENU_PAGE, title: t('menuPage'), contexts: ['page'] });
    })().catch((e) => console.error('[TakeNotes] menu setup failed', e));
  });

  browser.contextMenus?.onClicked?.addListener((info, tab) => {
    if (info.menuItemId === MENU_SELECTION) void saveWithBadge('selection', tab?.id);
    else if (info.menuItemId === MENU_PAGE) void saveWithBadge('page', tab?.id);
  });

  browser.commands?.onCommand?.addListener((command) => {
    if (command === COMMAND_SAVE_SELECTION) void saveWithBadge('selection');
    else if (command === COMMAND_SAVE_PAGE) void saveWithBadge('page');
  });
}

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupExtractBackground(): Handlers<BackgroundMessages> {
  registerMenusAndCommands();
  return {
    'clip/savePage': (p) => saveClip('page', p) as Promise<Clip>,
    'clip/saveSelection': (p) => saveClip('selection', p),
  };
}
