// Background part of the highlight module. Owner: agent C.
import { browser, type Browser } from 'wxt/browser';
import { broadcast, isFromWebPage, sendToTab, type BackgroundMessages, type Handlers } from '@/src/core/messages';
import { highlights, settings } from '@/src/core/storage';
import type { Highlight } from '@/src/core/types';
import { normalizeUrl, nowIso } from '@/src/core/util';
import { colorHex, orderedPalette } from '@/src/core/colors';
import { t } from './strings';

export const MENU_HIGHLIGHT = 'tn-hl-selection';
const LOAD_TIMEOUT_MS = 20000;
const SEND_ATTEMPTS = 3;
const SEND_RETRY_MS = 500;

export interface TabsFacade {
  query(): Promise<Array<{ id?: number; url?: string; windowId?: number }>>;
  /** Make the tab active and focus its window. */
  activate(tab: { id: number; windowId?: number }): Promise<void>;
  create(url: string): Promise<{ id: number }>;
  /** Resolves when the tab finished loading; rejects on timeout or when the tab is closed. */
  waitComplete(tabId: number, timeoutMs: number): Promise<void>;
}

export interface OpenDeps {
  getHighlight: (id: string) => Promise<Highlight | undefined>;
  tabs: TabsFacade;
  sleep: (ms: number) => Promise<void>;
  sendToTab: typeof sendToTab;
}

const browserTabs: TabsFacade = {
  query: () => browser.tabs.query({}),
  async activate({ id, windowId }) {
    await browser.tabs.update(id, { active: true });
    if (windowId != null) await browser.windows.update(windowId, { focused: true });
  },
  async create(url) {
    const tab = await browser.tabs.create({ url, active: true });
    if (tab.id == null) throw new Error('Tab was not created');
    return { id: tab.id };
  },
  waitComplete: (tabId, timeoutMs) =>
    new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(onUpdated);
        browser.tabs.onRemoved.removeListener(onRemoved);
        if (err) reject(err); else resolve();
      };
      const onUpdated = (id: number, info: { status?: string }) => {
        if (id === tabId && info.status === 'complete') done();
      };
      const onRemoved = (id: number) => { if (id === tabId) done(new Error('Tab was closed')); };
      const timer = setTimeout(() => done(new Error('Page load timed out')), timeoutMs);
      browser.tabs.onUpdated.addListener(onUpdated);
      browser.tabs.onRemoved.addListener(onRemoved);
      // The tab may have finished before the listener was attached.
      browser.tabs.get(tabId).then((tab) => { if (tab.status === 'complete') done(); }, () => {});
    }),
};

const defaultOpenDeps = (): OpenDeps => ({
  getHighlight: (id) => highlights.get(id),
  tabs: browserTabs,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  sendToTab,
});

/** Ask the content script to focus the highlight; retries while it is not ready yet (page still booting). */
async function focusWithRetry(tabId: number, id: string, deps: OpenDeps): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    if (attempt > 0) await deps.sleep(SEND_RETRY_MS);
    try {
      return await deps.sendToTab(tabId, 'content/focusHighlight', { id });
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** Open (or switch to) the page of a highlight, scroll to it and flash it. Called from extension pages. */
export async function openHighlight(id: string, deps: OpenDeps = defaultOpenDeps()): Promise<void> {
  const h = await deps.getHighlight(id);
  if (!h) throw new Error(t('unknownHighlight'));
  const existing = (await deps.tabs.query()).find((tab) => tab.id != null && tab.url && normalizeUrl(tab.url) === h.url);
  let tabId: number;
  if (existing?.id != null) {
    tabId = existing.id;
    await deps.tabs.activate({ id: tabId, windowId: existing.windowId });
  } else {
    tabId = (await deps.tabs.create(h.url)).id;
    try {
      await deps.tabs.waitComplete(tabId, LOAD_TIMEOUT_MS);
    } catch (e) {
      // Slow page: keep going, the content script retries on its own; a closed tab fails at send time.
      console.warn('[take-notes] waiting for the page failed', e);
    }
  }
  if (!(await focusWithRetry(tabId, id, deps))) throw new Error(t('notFound'));
}

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
        // The long note is edited only in the Library; a page's (possibly stale) copy must never overwrite it.
        if (page) saved.body = existing.body;
      } else {
        const projectId = h.projectId ?? (await settings.get()).defaultProjectId;
        saved = { ...h, projectId, createdAt: now, updatedAt: now };
        if (page) delete saved.body;
      }
      await highlights.put(saved);
      broadcast('data/changed', { kind: 'highlight' });
      return saved;
    },

    'highlight/open': ({ id }) => openHighlight(id),

    'highlight/palette': async () => {
      const s = await settings.get();
      return { colors: orderedPalette(s.highlightPalette, s.highlightColor), defaultColor: colorHex(s.highlightColor) };
    },

    'highlight/move': async ({ id, projectId }, sender) => {
      if (isFromWebPage(sender)) throw new Error('Not allowed from a web page');
      const h = await highlights.get(id);
      if (!h) throw new Error(t('unknownHighlight'));
      const saved = { ...h, projectId, updatedAt: nowIso() };
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
  browser.contextMenus.create({ id: MENU_HIGHLIGHT, title: t('menuHighlight'), contexts: ['selection'] });
}

export function setupHighlightBackground(): Handlers<BackgroundMessages> {

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_HIGHLIGHT || tab?.id == null) return;
    try {
      const { highlightColor } = await settings.get();
      await sendToTab(tab.id, 'content/highlightSelection', { color: highlightColor });
    } catch (e) {
      console.warn('[take-notes] highlight from context menu failed', e);
    }
  });

  return createHighlightHandlers();
}
