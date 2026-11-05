// Crawler engine: sequential, polite, testable (fetch/sleep/extract are injected).
import { readBodyCapped, sameOrigin } from '@/src/core/util';
import type { BookChapter, CrawlProgress, ExtractResult, TocEntry } from '@/src/core/types';

export interface CrawlerDeps {
  fetchFn: (url: string) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  extract: (doc: Document, url: string) => ExtractResult;
}

export interface CrawlerOptions {
  delayMs: number;
  maxPages: number;
  onProgress?: (p: CrawlProgress) => void;
  /** When set, pages redirected to another origin are rejected (redirects could point into a local network). */
  rootUrl?: string;
}

/** Max HTML size per page. */
const MAX_PAGE_BYTES = 8 * 1024 * 1024;

export interface CrawledPage {
  entry: TocEntry;
  result: ExtractResult;
}

export interface CrawlResult {
  state: 'done' | 'stopped' | 'error';
  pages: CrawledPage[];
  errors: CrawlProgress['errors'];
}

const BACKOFF_MS = 2000;
const MAX_RETRY_AFTER_MS = 60_000;

/** Retry-After: delta-seconds or HTTP date -> ms (capped); null when absent/invalid. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

function labelFromContentType(ct: string | null): string | null {
  return /charset\s*=\s*["']?([\w:.-]+)/i.exec(ct ?? '')?.[1] ?? null;
}

function labelFromMeta(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  return /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(head)?.[1] ?? null;
}

/** Decode an HTML body: charset from header, else <meta>, else UTF-8. Unknown labels fall back to UTF-8. */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const label = labelFromContentType(contentType) ?? labelFromMeta(bytes) ?? 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function isHtmlType(ct: string | null): boolean {
  if (!ct) return true;
  return /^(text\/html|application\/xhtml\+xml)/i.test(ct.trim());
}

export class Crawler {
  private stopped = false;
  private errors: CrawlProgress['errors'] = [];

  constructor(private deps: CrawlerDeps, private opts: CrawlerOptions) {}

  stop(): void {
    this.stopped = true;
  }

  private emit(state: CrawlProgress['state'], done: number, total: number, current?: string): void {
    this.opts.onProgress?.({ state, done, total, current, errors: [...this.errors] });
  }

  async run(entries: TocEntry[]): Promise<CrawlResult> {
    const list = entries.slice(0, Math.max(0, this.opts.maxPages));
    const pages: CrawledPage[] = [];
    this.errors = [];
    this.stopped = false;

    for (let i = 0; i < list.length; i++) {
      const entry = list[i]!;
      if (i > 0) await this.deps.sleep(this.opts.delayMs);
      if (this.stopped) break;
      this.emit('running', i, list.length, entry.url);
      try {
        const { doc, url } = await this.fetchPage(entry.url);
        pages.push({ entry, result: this.deps.extract(doc, url) });
      } catch (e) {
        this.errors.push({ url: entry.url, message: e instanceof Error ? e.message : String(e) });
      }
    }

    const state: CrawlResult['state'] = this.stopped
      ? 'stopped'
      : list.length > 0 && pages.length === 0 ? 'error' : 'done';
    this.emit(state, pages.length + this.errors.length, list.length);
    return { state, pages, errors: [...this.errors] };
  }

  /** One request with a single retry on network error, 5xx or 429. */
  private async fetchPage(url: string): Promise<{ doc: Document; url: string }> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.deps.fetchFn(url);
      } catch (e) {
        if (attempt === 0) { await this.deps.sleep(BACKOFF_MS); continue; }
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await this.deps.sleep(retryAfterMs(res.headers.get('retry-after')) ?? BACKOFF_MS);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type');
      if (!isHtmlType(ct)) throw new Error(`skipped: not HTML (${ct})`);
      const finalUrl = res.url || url;
      if (this.opts.rootUrl && !sameOrigin(finalUrl, this.opts.rootUrl)) throw new Error(`redirected off-site: ${finalUrl}`);
      const text = decodeHtml(await readBodyCapped(res, MAX_PAGE_BYTES), ct);
      const doc = new DOMParser().parseFromString(text, 'text/html');
      doc.querySelectorAll('base').forEach((b) => b.remove());
      const base = doc.createElement('base');
      base.href = finalUrl;
      doc.head.prepend(base);
      return { doc, url: finalUrl };
    }
  }
}

export function toChapter(page: CrawledPage): BookChapter {
  return {
    url: page.entry.url,
    title: page.entry.title,
    level: page.entry.level,
    html: page.result.html,
    markdown: page.result.markdown,
    assetIds: [],
  };
}
