import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { assets } from '@/src/core/storage';
import { collectImageUrls, localizeImages } from '@/src/export/images';

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const okFetch = (calls: string[] = [], mime = 'image/png', bytes = PNG) =>
  (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(bytes, { status: 200, headers: { 'content-type': mime } });
  }) as typeof fetch;

describe('collectImageUrls', () => {
  it('finds http(s) images, skips data URIs and dedupes', () => {
    const md = '![a](https://x.com/a.png)\n![b](<https://x.com/b.jpg> "t")\n![c](data:image/png;base64,AAA)\n![d](https://x.com/a.png)';
    expect(collectImageUrls(md)).toEqual(['https://x.com/a.png', 'https://x.com/b.jpg']);
  });
});

describe('localizeImages', () => {
  it('downloads once, stores assets, rewrites markdown to relative paths', async () => {
    const calls: string[] = [];
    const docs = ['![a](https://x.com/img/a.png) text', '![again](https://x.com/img/a.png "Title")'];
    const res = await localizeImages(docs, { fetchFn: okFetch(calls) });
    expect(calls).toEqual(['https://x.com/img/a.png']);
    const paths = Object.keys(res.files);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^images\/[0-9a-f]+\.png$/);
    expect(res.markdown[0]).toBe(`![a](${paths[0]}) text`);
    expect(res.markdown[1]).toBe(`![again](${paths[0]} "Title")`);
    expect([...res.files[paths[0]!]!]).toEqual([...PNG]);
    expect((await assets.findByUrl('https://x.com/img/a.png'))?.filename).toBe(paths[0]);
    expect(res.failed).toEqual([]);
  });

  it('reuses stored assets instead of fetching again', async () => {
    const calls: string[] = [];
    await localizeImages(['![](https://x.com/reuse.png)'], { fetchFn: okFetch(calls) });
    const res = await localizeImages(['![](https://x.com/reuse.png)'], { fetchFn: okFetch(calls) });
    expect(calls).toEqual(['https://x.com/reuse.png']);
    expect(Object.keys(res.files)).toHaveLength(1);
  });

  it('keeps the remote URL on HTTP errors, network errors and non-image responses', async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('404')) return new Response('nope', { status: 404 });
      if (u.includes('html')) return new Response('<p>', { status: 200, headers: { 'content-type': 'text/html' } });
      throw new TypeError('network');
    }) as typeof fetch;
    const md = '![](https://x.com/404.png) ![](https://x.com/html.png) ![](https://x.com/boom.png)';
    const res = await localizeImages([md], { fetchFn });
    expect(res.markdown[0]).toBe(md);
    expect(res.files).toEqual({});
    expect(res.failed.sort()).toEqual(['https://x.com/404.png', 'https://x.com/boom.png', 'https://x.com/html.png']);
  });

  it('does nothing when disabled', async () => {
    const calls: string[] = [];
    const md = '![](https://x.com/off.png)';
    const res = await localizeImages([md], { fetchFn: okFetch(calls), enabled: false });
    expect(calls).toEqual([]);
    expect(res.markdown).toEqual([md]);
    expect(res.files).toEqual({});
  });

  it('limits concurrency to 4', async () => {
    let active = 0;
    let max = 0;
    const fetchFn = (async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    }) as typeof fetch;
    const md = Array.from({ length: 12 }, (_, i) => `![](https://x.com/c${i}.png)`).join('\n');
    await localizeImages([md], { fetchFn });
    expect(max).toBe(4);
  });

  it('stops downloading once the total size limit is exceeded', async () => {
    const md = Array.from({ length: 4 }, (_, i) => `![](https://x.com/big${i}.png)`).join('\n');
    const res = await localizeImages([md], { fetchFn: okFetch([], 'image/png', new Uint8Array(10)), maxTotalBytes: 25, concurrency: 1 });
    expect(Object.keys(res.files)).toHaveLength(2);
    expect(res.markdown[0]!.match(/https:\/\/x\.com\/big/g)).toHaveLength(2);
  });
});
