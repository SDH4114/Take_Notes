// Background part of the highlight module. Owner: agent C.
import { browser } from 'wxt/browser';
import { broadcast, sendToTab, type BackgroundMessages, type Handlers } from '@/src/core/messages';
import { highlights, settings } from '@/src/core/storage';
import type { Highlight } from '@/src/core/types';
import { normalizeUrl, nowIso } from '@/src/core/util';
import { t } from './strings';

const MENU_SELECTION = 'tn-hl-selection';

/** Message handlers (exported separately so they can be tested without the extension APIs). */
export function createHighlightHandlers(): Handlers<BackgroundMessages> {
  return {
    'highlight/listForUrl': ({ url }) => highlights.listByUrl(normalizeUrl(url)),

    'highlight/listAll': ({ projectId }) =>
      projectId === undefined ? highlights.listAll() : highlights.listByProject(projectId),

    'highlight/save': async (h) => {
      const now = nowIso();
      const existing = (await highlights.listByUrl(h.url)).find((x) => x.id === h.id);
      let saved: Highlight;
      if (existing) {
        // Existing highlights keep their creation date and project; only content/color/note change.
        saved = { ...h, createdAt: existing.createdAt, projectId: existing.projectId, updatedAt: now };
      } else {
        const projectId = h.projectId ?? (await settings.get()).defaultProjectId;
        saved = { ...h, projectId, createdAt: now, updatedAt: now };
      }
      await highlights.put(saved);
      broadcast('data/changed', { kind: 'highlight' });
      return saved;
    },

    'highlight/delete': async ({ id }) => {
      await highlights.delete(id);
      broadcast('data/changed', { kind: 'highlight' });
    },
  };
}

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupHighlightBackground(): Handlers<BackgroundMessages> {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({ id: MENU_SELECTION, title: t('menuHighlight'), contexts: ['selection'] });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_SELECTION || tab?.id == null) return;
    try {
      const { highlightColor } = await settings.get();
      await sendToTab(tab.id, 'content/highlightSelection', { color: highlightColor });
    } catch (e) {
      console.warn('[take-notes] highlight from context menu failed', e);
    }
  });

  return createHighlightHandlers();
}
