import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { books } from '@/src/core/storage';
import type { CrawlProgress, ExtractResult, TocEntry } from '@/src/core/types';
import { createCrawlHandlers, type CrawlBackgroundDeps } from '@/src/crawl/background';

const entries: TocEntry[] = [
  { url: 'https://s.io/d/', title: 'Root', level: 0 },
  { url: 'https://s.io/d/a.html', title: 'A', level: 1 },
  { url: 'https://s.io/d/b.html', title: 'B', level: 0 },
];

const extract = (doc: Document, url: string): ExtractResult => ({
  title: doc.title,
  html: `<p>${url}</p>`,
  markdown: `md ${url}`,
  source: { url, title: `meta ${url}`, authors: ['Au'], accessed: '2026-01-01T00:00:00.000Z' },
  imageUrls: [],
});

function make(overrides: Partial<CrawlBackgroundDeps> = {}) {
  const events: { type: string; payload: unknown }[] = [];
  const deps: CrawlBackgroundDeps = {
    fetchFn: async () => new Response('<html><head><title>t</title></head><body>x</body></html>', { headers: { 'content-type': 'text/html' } }),
    sleep: async () => {},
    extract,
    sendToTab: vi.fn(async () => entries) as unknown as CrawlBackgroundDeps['sendToTab'],
    resolveTabId: async (id) => id ?? 7,
    broadcast: (type, payload) => { events.push({ type, payload }); },
    ...overrides,
  };
  return { ...createCrawlHandlers(deps), events, deps };
}

beforeEach(async () => {
  for (const b of await books.list()) await books.delete(b.id);
});

describe('crawl background', () => {
  it('crawl/detectToc forwards to the tab', async () => {
    const m = make();
    expect(await m.handlers['crawl/detectToc']!({ tabId: 3 }, {} as never)).toEqual(entries);
    expect(m.deps.sendToTab).toHaveBeenCalledWith(3, 'content/detectToc');
  });

  it('crawl/start saves a book in TOC order and broadcasts progress and data/changed', async () => {
    const m = make();
    expect(await m.handlers['crawl/start']!({ title: 'Docs', rootUrl: 'https://s.io/d/', entries }, {} as never)).toEqual({ started: true });
    await m.idle();
    const list = await books.list();
    expect(list).toHaveLength(1);
    const b = list[0]!;
    expect(b.title).toBe('Docs');
    expect(b.chapters.map((c) => [c.title, c.level, c.markdown])).toEqual([
      ['Root', 0, 'md https://s.io/d/'], ['A', 1, 'md https://s.io/d/a.html'], ['B', 0, 'md https://s.io/d/b.html'],
    ]);
    expect(b.source).toMatchObject({ url: 'https://s.io/d/', title: 'Docs', authors: ['Au'] });
    const progress = m.events.filter((e) => e.type === 'crawl/progress').map((e) => e.payload as CrawlProgress);
    expect(progress.length).toBeGreaterThanOrEqual(3);
    expect(progress.at(-1)).toMatchObject({ state: 'done', bookId: b.id });
    expect(m.events.at(-1)).toEqual({ type: 'data/changed', payload: { kind: 'book' } });
    expect(await m.handlers['crawl/status']!(undefined, {} as never)).toMatchObject({ state: 'done', bookId: b.id });
  });

  it('allows only one crawl at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const m = make({ fetchFn: async () => { await gate; return new Response('<p>x</p>', { headers: { 'content-type': 'text/html' } }); } });
    await m.handlers['crawl/start']!({ title: 'A', rootUrl: 'https://s.io/d/', entries }, {} as never);
    await expect(m.handlers['crawl/start']!({ title: 'B', rootUrl: 'https://s.io/d/', entries }, {} as never)).rejects.toThrow(/already/i);
    release();
    await m.idle();
  });

  it('crawl/stop keeps a partial book with state stopped', async () => {
    const holder: { stop?: () => Promise<void> } = {};
    const m = make({ fetchFn: async () => { await holder.stop?.(); return new Response('<p>x</p>', { headers: { 'content-type': 'text/html' } }); } });
    holder.stop = () => m.handlers['crawl/stop']!(undefined, {} as never) as Promise<void>;
    await m.handlers['crawl/start']!({ title: 'P', rootUrl: 'https://s.io/d/', entries }, {} as never);
    await m.idle();
    const st = await m.handlers['crawl/status']!(undefined, {} as never);
    expect(st.state).toBe('stopped');
    expect((await books.list())[0]?.chapters).toHaveLength(1);
  });

  it('reports error state and saves nothing when every page fails', async () => {
    const m = make({ fetchFn: async () => new Response('nf', { status: 404 }) });
    await m.handlers['crawl/start']!({ title: 'X', rootUrl: 'https://s.io/d/', entries }, {} as never);
    await m.idle();
    expect(await books.list()).toEqual([]);
    expect(await m.handlers['crawl/status']!(undefined, {} as never)).toMatchObject({ state: 'error' });
  });

  it('rejects an empty selection', async () => {
    const m = make();
    await expect(m.handlers['crawl/start']!({ title: 'X', rootUrl: 'https://s.io/', entries: [] }, {} as never)).rejects.toThrow();
  });

  it('book/list omits chapters, newest first; book/delete removes', async () => {
    const m = make();
    await m.handlers['crawl/start']!({ title: 'One', rootUrl: 'https://s.io/d/', entries }, {} as never);
    await m.idle();
    const list = await m.handlers['book/list']!(undefined, {} as never);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('chapters');
    await m.handlers['book/delete']!({ id: list[0]!.id }, {} as never);
    expect(await books.list()).toEqual([]);
  });
});
