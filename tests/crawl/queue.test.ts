import { describe, expect, it } from 'vitest';
import type { ExtractResult, TocEntry, CrawlProgress } from '@/src/core/types';
import { Crawler, decodeHtml, type CrawlerDeps } from '@/src/crawl/queue';

const entry = (n: number): TocEntry => ({ url: `https://s.io/d/${n}.html`, title: `Ch ${n}`, level: 0 });
const html = (body: string, head = '<meta charset="utf-8">') => `<html><head>${head}<title>T</title></head><body>${body}</body></html>`;

function resp(body: string | Uint8Array, init: { status?: number; headers?: Record<string, string>; url?: string } = {}): Response {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const r = new Response(bytes as BodyInit, { status: init.status ?? 200, headers: { 'content-type': 'text/html; charset=utf-8', ...init.headers } });
  if (init.url) Object.defineProperty(r, 'url', { value: init.url });
  return r;
}

const fakeExtract = (doc: Document, url: string): ExtractResult => ({
  title: doc.querySelector('h1')?.textContent ?? '',
  html: doc.body.innerHTML,
  markdown: doc.body.textContent ?? '',
  source: { url, title: doc.title, authors: [], accessed: '2026-01-01T00:00:00.000Z' },
  imageUrls: [],
});

function setup(fetchFn: (url: string) => Promise<Response>, opts: { delayMs?: number; maxPages?: number } = {}) {
  const sleeps: number[] = [];
  const fetched: string[] = [];
  const progress: CrawlProgress[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const deps: CrawlerDeps = {
    fetchFn: async (url) => {
      fetched.push(url);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try { return await fetchFn(url); } finally { inFlight--; }
    },
    sleep: async (ms) => { sleeps.push(ms); },
    extract: fakeExtract,
  };
  const crawler = new Crawler(deps, { delayMs: opts.delayMs ?? 1000, maxPages: opts.maxPages ?? 100, onProgress: (p) => progress.push(structuredClone(p)) });
  return { crawler, sleeps, fetched, progress, maxInFlight: () => maxInFlight };
}

describe('Crawler', () => {
  it('fetches sequentially in TOC order with delay between requests', async () => {
    const s = setup(async (u) => resp(html(`<h1>${u}</h1>`)));
    const r = await s.crawler.run([entry(1), entry(2), entry(3)]);
    expect(r.state).toBe('done');
    expect(s.fetched).toEqual([entry(1).url, entry(2).url, entry(3).url]);
    expect(r.pages.map((p) => p.entry.title)).toEqual(['Ch 1', 'Ch 2', 'Ch 3']);
    expect(s.sleeps).toEqual([1000, 1000]);
    expect(s.maxInFlight()).toBe(1);
  });

  it('honors maxPages', async () => {
    const s = setup(async () => resp(html('<h1>x</h1>')), { maxPages: 2 });
    const r = await s.crawler.run([entry(1), entry(2), entry(3)]);
    expect(r.pages).toHaveLength(2);
    expect(s.progress.at(-1)?.total).toBe(2);
  });

  it('reports progress per step with current url', async () => {
    const s = setup(async () => resp(html('<h1>x</h1>')));
    await s.crawler.run([entry(1), entry(2)]);
    expect(s.progress[0]).toMatchObject({ state: 'running', done: 0, total: 2, current: entry(1).url });
    expect(s.progress.at(-1)).toMatchObject({ state: 'done', done: 2, total: 2 });
  });

  it('retries once on network error with backoff', async () => {
    let n = 0;
    const s = setup(async () => { if (n++ === 0) throw new TypeError('network'); return resp(html('<h1>ok</h1>')); });
    const r = await s.crawler.run([entry(1)]);
    expect(r.pages).toHaveLength(1);
    expect(r.errors).toEqual([]);
    expect(s.fetched).toHaveLength(2);
    expect(s.sleeps).toEqual([2000]);
  });

  it('retries once on 5xx, then records an error and continues', async () => {
    const s = setup(async (u) => (u === entry(1).url ? resp('boom', { status: 503 }) : resp(html('<h1>ok</h1>'))));
    const r = await s.crawler.run([entry(1), entry(2)]);
    expect(s.fetched.filter((u) => u === entry(1).url)).toHaveLength(2);
    expect(r.pages.map((p) => p.entry.title)).toEqual(['Ch 2']);
    expect(r.errors).toEqual([{ url: entry(1).url, message: 'HTTP 503' }]);
    expect(r.state).toBe('done');
  });

  it('does not retry 404', async () => {
    const s = setup(async () => resp('nf', { status: 404 }));
    const r = await s.crawler.run([entry(1)]);
    expect(s.fetched).toHaveLength(1);
    expect(r.errors[0]?.message).toBe('HTTP 404');
    expect(r.state).toBe('error');
  });

  it('honors Retry-After on 429 (seconds)', async () => {
    let n = 0;
    const s = setup(async () => (n++ === 0 ? resp('slow', { status: 429, headers: { 'retry-after': '7' } }) : resp(html('<h1>ok</h1>'))));
    const r = await s.crawler.run([entry(1)]);
    expect(r.pages).toHaveLength(1);
    expect(s.sleeps).toEqual([7000]);
  });

  it('skips non-HTML content-type', async () => {
    const s = setup(async () => resp('%PDF', { headers: { 'content-type': 'application/pdf' } }));
    const r = await s.crawler.run([entry(1)]);
    expect(r.pages).toEqual([]);
    expect(r.errors[0]?.message).toMatch(/not HTML/);
  });

  it('records extractor failures and continues', async () => {
    const s = setup(async () => resp(html('<h1>x</h1>')));
    let n = 0;
    s.crawler['deps'].extract = (d, u) => { if (n++ === 0) throw new Error('bad'); return fakeExtract(d, u); };
    const r = await s.crawler.run([entry(1), entry(2)]);
    expect(r.pages).toHaveLength(1);
    expect(r.errors).toEqual([{ url: entry(1).url, message: 'bad' }]);
  });

  it('stop() ends the run after the current page and keeps collected pages', async () => {
    const holder: { c?: Crawler } = {};
    const s = setup(async () => { holder.c?.stop(); return resp(html('<h1>x</h1>')); });
    holder.c = s.crawler;
    const r = await s.crawler.run([entry(1), entry(2), entry(3)]);
    expect(r.state).toBe('stopped');
    expect(r.pages).toHaveLength(1);
    expect(s.fetched).toHaveLength(1);
  });

  it('sets <base href> from the response url so relative URLs resolve', async () => {
    const seen: string[] = [];
    const s = setup(async () => resp(html('<h1>x</h1><a href="../a.html">a</a>')));
    s.crawler['deps'].extract = (d, u) => { seen.push(new URL(d.querySelector('a')!.getAttribute('href')!, d.querySelector('base')!.href).href); return fakeExtract(d, u); };
    await s.crawler.run([{ url: 'https://s.io/d/x/1.html', title: 't', level: 0 }]);
    expect(seen).toEqual(['https://s.io/d/a.html']);
  });
});

describe('decodeHtml', () => {
  const win1251 = (s: string) => Uint8Array.from([...s].map((ch) => (ch === 'П' ? 0xcf : ch === 'р' ? 0xf0 : ch.charCodeAt(0))));

  it('uses charset from the Content-Type header', () => {
    expect(decodeHtml(win1251('Пр<p>'), 'text/html; charset=windows-1251')).toBe('Пр<p>');
  });
  it('falls back to <meta charset>', () => {
    const body = win1251('<meta charset="windows-1251"><p>Пр</p>');
    expect(decodeHtml(body, 'text/html')).toContain('Пр');
  });
  it('understands http-equiv meta', () => {
    const body = win1251('<meta http-equiv="Content-Type" content="text/html; charset=windows-1251"><p>Пр</p>');
    expect(decodeHtml(body, null)).toContain('Пр');
  });
  it('defaults to UTF-8 and survives an unknown charset label', () => {
    expect(decodeHtml(new TextEncoder().encode('Привет'), 'text/html')).toBe('Привет');
    expect(decodeHtml(new TextEncoder().encode('Привет'), 'text/html; charset=bogus-9')).toBe('Привет');
  });
});
