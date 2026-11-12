// Typed message contract. Every request type maps to [payload, response].
import { browser, type Browser } from 'wxt/browser';
import { translator } from './i18n';
import type {
  Book, Clip, CrawlProgress, ExportFormat, ExtractResult, Highlight,
  HighlightColor, Project, TocEntry, TrackInfo,
} from './types';

/** Messages handled by the background script. */
export interface BackgroundMessages {
  // clips (owner: extract module)
  'clip/savePage': [{ tabId?: number; projectId?: string | null }, Clip];
  'clip/saveSelection': [{ tabId?: number; projectId?: string | null }, Clip | null];
  // projects & clips CRUD (owner: projects module)
  'project/list': [void, Project[]];
  'project/create': [{ name: string; description?: string }, Project];
  'project/update': [Project, Project];
  'project/delete': [{ id: string }, void];
  'clip/list': [{ projectId: string | null }, Clip[]];
  /** New empty/handwritten note (kind 'selection' with no page source). */
  /** `status`: kanban column of the new note (cards created on the board). */
  'clip/create': [{ projectId: string | null; title: string; markdown?: string; status?: string }, Clip];
  'clip/update': [Clip, Clip];
  /** Change only these fields on the stored clip (no stale copies of text/title/tags). `null` clears a field. */
  'clip/patch': [{ id: string; patch: { projectId?: string | null; section?: string | null; status?: string | null } }, Clip];
  'clip/delete': [{ id: string }, void];
  'clip/reorder': [{ projectId: string | null; ids: string[] }, void];
  // highlights (owner: highlight module)
  'highlight/listForUrl': [{ url: string }, Highlight[]];
  'highlight/listAll': [{ projectId?: string | null }, Highlight[]];
  'highlight/save': [Highlight, Highlight];
  'highlight/delete': [{ id: string }, void];
  /** Change only the color (the page's copy of the notes may be stale). */
  'highlight/recolor': [{ id: string; color: HighlightColor }, Highlight];
  /** Change only the short note (from the page popover). */
  'highlight/setNote': [{ id: string; note?: string }, Highlight];
  /** Move a highlight to another project (extension pages only). */
  'highlight/move': [{ id: string; projectId: string | null }, Highlight];
  /** Palette for the in-page toolbar (default color first). */
  'highlight/palette': [void, { colors: string[]; defaultColor: string }];
  /** Open (or focus) the highlight's page, scroll to it and flash it. */
  'highlight/open': [{ id: string }, void];
  // crawler (owner: crawl module)
  'crawl/detectToc': [{ tabId?: number }, TocEntry[]];
  'crawl/start': [{ title: string; rootUrl: string; entries: TocEntry[] }, { started: true }];
  'crawl/stop': [void, void];
  'crawl/status': [void, CrawlProgress];
  'book/list': [void, Omit<Book, 'chapters'>[]];
  'book/delete': [{ id: string }, void];
  // export (owner: export module)
  'export/clip': [{ id: string; format: ExportFormat }, void];
  'export/project': [{ projectId: string | null; format: ExportFormat }, void];
  'export/book': [{ id: string; format: ExportFormat }, void];
  'export/board': [{ projectId: string | null; format: 'md' | 'pdf' }, void];
  'export/highlights': [{ url?: string; projectId?: string | null; format: ExportFormat }, void];
  // youtube (owner: youtube module)
  'youtube/tracks': [{ tabId?: number }, TrackInfo[]];
  /** `lang` + `kind` = the track picked in the popup; missing = automatic choice. */
  'youtube/saveTranscript': [{ tabId?: number; projectId?: string | null; lang?: string; kind?: string }, Clip | null];
}

/** Messages handled by the content script (sent with tabs.sendMessage). */
export interface ContentMessages {
  'content/extractPage': [void, ExtractResult];
  'content/extractSelection': [void, ExtractResult | null];
  'content/highlightSelection': [{ color?: HighlightColor }, Highlight | null];
  'content/refreshHighlights': [void, void];
  /** Scroll to a rendered highlight and flash it; false if it could not be found on the page. */
  'content/focusHighlight': [{ id: string }, boolean];
  'content/detectToc': [void, TocEntry[]];
  'content/pickToc': [void, TocEntry[]];
  'content/youtubeTracks': [void, TrackInfo[]];
  'content/youtubeTranscript': [{ languageCode?: string; kind?: string }, ExtractResult | null];
}

/** Broadcast events (runtime.sendMessage, no response expected). */
export interface BroadcastEvents {
  'crawl/progress': CrawlProgress;
  'data/changed': { kind: 'clip' | 'project' | 'highlight' | 'book' };
  /** Navigate an open Library tab in place (a URL change would reload it and could drop unsaved typing). */
  'library/open': { tabId: number; search: string };
}

type Payload<M, K extends keyof M> = M[K] extends [infer P, unknown] ? P : never;
type Response<M, K extends keyof M> = M[K] extends [unknown, infer R] ? R : never;

interface Envelope { type: string; payload: unknown; event?: boolean }
type Wire<R> = { ok: true; data: R } | { ok: false; error: string };

async function unwrap<R>(p: Promise<unknown>): Promise<R> {
  const res = (await p) as Wire<R> | undefined;
  if (!res) throw new Error('No handler responded');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export function send<K extends keyof BackgroundMessages>(
  type: K, ...[payload]: Payload<BackgroundMessages, K> extends void ? [] : [Payload<BackgroundMessages, K>]
): Promise<Response<BackgroundMessages, K>> {
  return unwrap(browser.runtime.sendMessage({ type, payload } satisfies Envelope));
}

const tErr = translator({
  ru: { noContent: 'На этой странице TakeNotes не работает (служебная страница браузера, магазин дополнений или просмотр PDF). Откройте обычный сайт.' },
  en: { noContent: 'TakeNotes cannot work on this page (browser page, add-ons store or PDF viewer). Open a regular website.' },
});

const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;

/**
 * Send to the content script of a tab. Tabs opened before the extension was installed/reloaded have no
 * content script yet: inject it once and retry. Privileged pages (about:, AMO, PDF viewer) get a clear error.
 */
export async function sendToTab<K extends keyof ContentMessages>(
  tabId: number, type: K, ...[payload]: Payload<ContentMessages, K> extends void ? [] : [Payload<ContentMessages, K>]
): Promise<Response<ContentMessages, K>> {
  const msg = { type, payload } satisfies Envelope;
  try {
    return await unwrap(browser.tabs.sendMessage(tabId, msg));
  } catch (e) {
    if (!(e instanceof Error) || !NO_RECEIVER.test(e.message)) throw e;
  }
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
  } catch {
    throw new Error(tErr('noContent'));
  }
  return unwrap(browser.tabs.sendMessage(tabId, msg));
}

export function broadcast<K extends keyof BroadcastEvents>(type: K, payload: BroadcastEvents[K]): void {
  browser.runtime.sendMessage({ type, payload, event: true } satisfies Envelope).catch(() => {});
}

export function onBroadcast<K extends keyof BroadcastEvents>(
  type: K, cb: (payload: BroadcastEvents[K]) => void,
): () => void {
  const l = (msg: unknown) => {
    const m = msg as Envelope;
    if (m?.event && m.type === type) cb(m.payload as BroadcastEvents[K]);
  };
  browser.runtime.onMessage.addListener(l);
  return () => browser.runtime.onMessage.removeListener(l);
}

export type Handlers<M> = {
  [K in keyof M]?: (payload: Payload<M, K>, sender: Browser.runtime.MessageSender) => Promise<Response<M, K>> | Response<M, K>;
};

/** True when the message comes from a content script in a web page (not from an extension page). */
export function isFromWebPage(sender: Browser.runtime.MessageSender | undefined): boolean {
  if (!sender) return false; // direct calls in tests / same-context
  const ext = browser.runtime.getURL('/');
  return !(sender.url ?? '').startsWith(ext);
}

export interface RegisterOptions {
  /**
   * Message types that content scripts in web pages may send. Anything else from a web-page context is ignored,
   * so a bug in page-facing code can't reach destructive operations (delete project, export, crawl…).
   * Omit on the content-script side (it only receives from the extension itself).
   */
  allowFromWebPages?: readonly string[];
}

/** Register handlers; responds only to messages this side owns. */
export function registerHandlers<M>(handlers: Handlers<M>, opts: RegisterOptions = {}): void {
  const allowed = opts.allowFromWebPages ? new Set(opts.allowFromWebPages) : null;
  // Respond with sendResponse + `return true`: Chrome only accepts a returned Promise from version 148 (rolling out
  // gradually), Firefox supports both. Messages must stay JSON-serializable (Chrome uses JSON, not structured clone).
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse: (r: unknown) => void) => {
    const m = msg as Envelope;
    if (!m || m.event || typeof m.type !== 'string') return undefined;
    const h = (handlers as Record<string, ((p: unknown, s: unknown) => unknown) | undefined>)[m.type];
    if (!h) return undefined;
    if (allowed && isFromWebPage(sender) && !allowed.has(m.type)) {
      sendResponse({ ok: false, error: 'Not allowed from a web page' } as Wire<unknown>);
      return undefined;
    }
    Promise.resolve()
      .then(() => h(m.payload, sender))
      .then((data) => ({ ok: true, data }) as Wire<unknown>)
      .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }) as Wire<unknown>)
      .then((res) => { try { sendResponse(res); } catch { /* sender went away (tab closed) */ } });
    return true;
  });
}

/** Resolve tab id: explicit, else the active tab of the current window. */
export async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId != null) return tabId;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) throw new Error('No active tab');
  return tab.id;
}
