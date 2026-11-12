import { describe, expect, it } from 'vitest';
import { blobToBase64, blobUrlViaDom, dom, runDomOp } from '@/src/core/dom';

describe('dom host', () => {
  it('runs in place when a DOM exists (Firefox event page, extension pages)', async () => {
    expect(await dom('renderMarkdown', { md: '**b**' })).toContain('<strong>b</strong>');
    const r = await dom('extractHtml', {
      html: '<html><head><title>T</title></head><body><article><h1>T</h1><p>Hello <a href="/x">x</a> world, enough text here to count as an article body.</p></article></body></html>',
      url: 'https://ex.test/a/b',
    });
    expect(r.markdown).toContain('Hello');
    expect(r.markdown).toContain('https://ex.test/x'); // relative links resolve against the page (<base>)
  });

  it('blob round trip through base64 (Chrome sends JSON only)', async () => {
    const b64 = await blobToBase64(new Blob([new Uint8Array([0, 255, 10])]));
    expect(b64).toBe('AP8K');
    const url = await runDomOp('blobUrl', { b64, type: 'application/zip' });
    expect(url.startsWith('blob:')).toBe(true);
    await runDomOp('revokeUrl', { url });
  });

  it('big blobs go in pieces and come out whole', async () => {
    const bytes = new Uint8Array(10).map((_, i) => i * 25);
    const url = await blobUrlViaDom(new Blob([bytes], { type: 'application/zip' }), 4); // parts 4 + 4 + 2
    const out = new Uint8Array(await (await fetch(url)).arrayBuffer());
    expect([...out]).toEqual([...bytes]);
    await runDomOp('revokeUrl', { url });
  });
});
