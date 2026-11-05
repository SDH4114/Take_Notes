// Background part of the crawl module. Owner: agent D.
import {
  broadcast, resolveTabId, sendToTab,
  type BackgroundMessages, type Handlers,
} from '@/src/core/messages';
import * as storage from '@/src/core/storage';
import type { Book, CrawlProgress, ExtractResult, SourceMeta, TocEntry } from '@/src/core/types';
import { isHttpUrl, newId, normalizeUrl, nowIso, sameOrigin } from '@/src/core/util';
import { extractArticle } from '@/src/extract/article';
import { Crawler, toChapter, type CrawledPage } from './queue';

export interface CrawlBackgroundDeps {
  fetchFn: (url: string) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  extract: (doc: Document, url: string) => ExtractResult;
  sendToTab: typeof sendToTab;
  resolveTabId: (tabId?: number) => Promise<number>;
  broadcast: typeof broadcast;
}

const IDLE: CrawlProgress = { state: 'idle', done: 0, total: 0, errors: [] };

/** Source meta of the root page (falls back to the first page), titled with the book title. */
function bookSource(title: string, rootUrl: string, pages: CrawledPage[]): SourceMeta {
  const root = normalizeUrl(rootUrl);
  const page = pages.find((p) => normalizeUrl(p.entry.url) === root) ?? pages[0]!;
  return { ...page.result.source, url: rootUrl, title };
}

export function createCrawlHandlers(deps: CrawlBackgroundDeps): {
  handlers: Handlers<BackgroundMessages>;
  /** Resolves when the running crawl (if any) has finished. For tests. */
  idle: () => Promise<void>;
} {
  let progress: CrawlProgress = IDLE;
  let crawler: Crawler | null = null;
  let starting = false;
  let job: Promise<void> = Promise.resolve();

  const setProgress = (p: CrawlProgress) => {
    progress = p;
    deps.broadcast('crawl/progress', p);
  };

  async function runJob(title: string, rootUrl: string, entries: TocEntry[], c: Crawler): Promise<void> {
    try {
      const result = await c.run(entries);
      if (result.pages.length === 0) return; // crawler already published the final state
      const book: Book = {
        id: newId(),
        title,
        rootUrl,
        source: bookSource(title, rootUrl, result.pages),
        chapters: result.pages.map(toChapter),
        createdAt: nowIso(),
      };
      await storage.books.put(book);
      setProgress({ ...progress, state: result.state === 'stopped' ? 'stopped' : 'done', bookId: book.id, current: undefined });
      deps.broadcast('data/changed', { kind: 'book' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setProgress({ ...progress, state: 'error', current: undefined, errors: [...progress.errors, { url: rootUrl, message }] });
    } finally {
      crawler = null;
    }
  }

  const handlers: Handlers<BackgroundMessages> = {
    async 'crawl/detectToc'({ tabId }) {
      return deps.sendToTab(await deps.resolveTabId(tabId), 'content/detectToc');
    },

    async 'crawl/start'({ title, rootUrl, entries }) {
      if (crawler || starting) throw new Error('A crawl is already running');
      if (entries.length === 0) throw new Error('No chapters selected');
      // Defense in depth: the page-side TOC filter can't be trusted, re-check scope here.
      const scoped = entries.filter((e) => isHttpUrl(e.url) && sameOrigin(e.url, rootUrl));
      if (scoped.length === 0) throw new Error('No chapters on this site');
      starting = true; // set synchronously so two quick clicks can't both pass the guard
      let s: { delayMs: number; maxPages: number };
      try {
        s = (await storage.settings.get()).crawl;
      } finally {
        starting = false;
      }
      entries = scoped;
      const c = new Crawler(deps, { delayMs: s.delayMs, maxPages: s.maxPages, onProgress: setProgress, rootUrl });
      crawler = c;
      progress = { state: 'running', done: 0, total: Math.min(entries.length, s.maxPages), errors: [] };
      job = runJob(title, rootUrl, entries, c);
      return { started: true };
    },

    'crawl/stop'() {
      crawler?.stop();
    },

    'crawl/status'() {
      return progress;
    },

    async 'book/list'() {
      return (await storage.books.list())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ chapters, ...rest }) => (void chapters, rest));
    },

    async 'book/delete'({ id }) {
      await storage.books.delete(id);
      deps.broadcast('data/changed', { kind: 'book' });
    },
  };

  return { handlers, idle: () => job };
}

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupCrawlBackground(): Handlers<BackgroundMessages> {
  return createCrawlHandlers({
    fetchFn: (url) => fetch(url, { credentials: 'omit' }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    extract: extractArticle,
    sendToTab,
    resolveTabId,
    broadcast,
  }).handlers;
}
