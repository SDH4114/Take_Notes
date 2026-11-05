// Background part of the highlight module. Owner: agent C.
import { browser, type Browser } from 'wxt/browser';
import { broadcast, isFromWebPage, sendToTab, type BackgroundMessages, type Handlers } from '@/src/core/messages';
import { highlights, settings } from '@/src/core/storage';
import type { Highlight } from '@/src/core/types';
import { normalizeUrl, nowIso } from '@/src/core/util';
import { t } from './strings';

const MENU_SELECTION = 'tn-hl-selection';

/** For messages from a web page's content script: the normalized URL of that page; null for extension pages. */
function senderPage(sender: Browser.runtime.MessageSender | undefined): string | null {
  if (!isFromWebPage(sender)) return null;
  return normalizeUrl(sender?.tab?.url ?? sender?.url ?? 'about:blank');
}

/** Message handlers (exported separately so they can be tested without the extension APIs). */
export function createHighlightHandlers(): Handlers<BackgroundMessages> {
  return {
    // A page may only read its own highlights.
    'highlight/listForUrl': ({ url }, sender) => highlights.listByUrl(senderPage(sender) ?? normalizeUrl(url)),

    'highlight/listAll': ({ projectId }) =>
      projectId === undefined ? highlights.listAll() : highlights.listByProject(projectId),

    'highlight/save': async (h, sender) => {
      const page = senderPage(sender);
      if (page && normalizeUrl(h.url) !== page) throw new Error('Highlight URL does not match the page');
      const now = nowIso();
      const existing = await highlights.get(h.id);
      // Never let a save overwrite a highlight that belongs to another page.
      if (existing && existing.url !== h.url) throw new Error('Highlight id belongs to another page');
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

    'highlight/delete': async ({ id }, sender) => {
      const page = senderPage(sender);
      if (page && (await highlights.get(id))?.url !== page) throw new Error('Highlight belongs to another page');
      await highlights.delete(id);
      broadcast('data/changed', { kind: 'highlight' });
    },
  };
}

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function createHighlightMenus(): void {
  browser.contextMenus.create({ id: MENU_SELECTION, title: t('menuHighlight'), contexts: ['selection'] });
}

export function setupHighlightBackground(): Handlers<BackgroundMessages> {

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
