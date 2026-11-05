// Typed message contract. Every request type maps to [payload, response].
import { browser, type Browser } from 'wxt/browser';
import type {
  Book, Clip, CrawlProgress, ExportFormat, ExtractResult, Highlight,
  HighlightColor, Project, TocEntry,
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
  'clip/update': [Clip, Clip];
  'clip/delete': [{ id: string }, void];
  'clip/reorder': [{ projectId: string | null; ids: string[] }, void];
  // highlights (owner: highlight module)
  'highlight/listForUrl': [{ url: string }, Highlight[]];
  'highlight/listAll': [{ projectId?: string | null }, Highlight[]];
  'highlight/save': [Highlight, Highlight];
  'highlight/delete': [{ id: string }, void];
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
  'export/highlights': [{ url?: string; projectId?: string | null; format: ExportFormat }, void];
  // youtube (owner: youtube module)
  'youtube/saveTranscript': [{ tabId?: number; projectId?: string | null }, Clip | null];
}

/** Messages handled by the content script (sent with tabs.sendMessage). */
export interface ContentMessages {
  'content/extractPage': [void, ExtractResult];
  'content/extractSelection': [void, ExtractResult | null];
  'content/highlightSelection': [{ color?: HighlightColor }, Highlight | null];
  'content/refreshHighlights': [void, void];
  'content/detectToc': [void, TocEntry[]];
  'content/pickToc': [void, TocEntry[]];
  'content/youtubeTranscript': [void, ExtractResult | null];
}

/** Broadcast events (runtime.sendMessage, no response expected). */
export interface BroadcastEvents {
  'crawl/progress': CrawlProgress;
  'data/changed': { kind: 'clip' | 'project' | 'highlight' | 'book' };
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

export function sendToTab<K extends keyof ContentMessages>(
  tabId: number, type: K, ...[payload]: Payload<ContentMessages, K> extends void ? [] : [Payload<ContentMessages, K>]
): Promise<Response<ContentMessages, K>> {
  return unwrap(browser.tabs.sendMessage(tabId, { type, payload } satisfies Envelope));
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

/** Register handlers; returns true only for messages this side owns. */
export function registerHandlers<M>(handlers: Handlers<M>): void {
  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    const m = msg as Envelope;
    if (!m || m.event || typeof m.type !== 'string') return undefined;
    const h = (handlers as Record<string, ((p: unknown, s: unknown) => unknown) | undefined>)[m.type];
    if (!h) return undefined;
    return Promise.resolve()
      .then(() => h(m.payload, sender))
      .then((data) => ({ ok: true, data }) as Wire<unknown>)
      .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }) as Wire<unknown>);
  });
}

/** Resolve tab id: explicit, else the active tab of the current window. */
export async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId != null) return tabId;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) throw new Error('No active tab');
  return tab.id;
}
