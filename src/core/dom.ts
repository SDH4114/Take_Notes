// DOM work requested by background code. Firefox' event page and extension pages have a DOM: run it in place.
// Chrome's MV3 background is a service worker without DOM ("can't access the DOM or the window interface"), so the
// same operations run in an offscreen document (entrypoints/offscreen, Chrome only, reasons DOM_PARSER + BLOBS).
import { browser } from 'wxt/browser';
import type { ExtractResult } from './types';

export interface DomOps {
  renderMarkdown: [{ md: string }, string];
  extractHtml: [{ html: string; url: string }, ExtractResult];
  /** Blob (as base64, messages are JSON in Chrome) → object URL owned by the offscreen document. */
  blobUrl: [{ b64: string; type: string }, string];
  revokeUrl: [{ url: string }, void];
}
export type DomOp = keyof DomOps;
export const OFFSCREEN_TARGET = 'tn-offscreen';

export const hasDom = (): boolean => typeof document !== 'undefined' && typeof DOMParser !== 'undefined';

/** Implementations; also used by the offscreen document itself. Loaded lazily so a worker never evaluates them early. */
export async function runDomOp<K extends DomOp>(op: K, payload: DomOps[K][0]): Promise<DomOps[K][1]> {
  switch (op) {
    case 'renderMarkdown': {
      const { renderMarkdown } = await import('@/src/ui/markdown');
      return renderMarkdown((payload as DomOps['renderMarkdown'][0]).md) as DomOps[K][1];
    }
    case 'extractHtml': {
      const { html, url } = payload as DomOps['extractHtml'][0];
      const [{ parseHtml }, { extractArticle }] = await Promise.all([import('@/src/crawl/queue'), import('@/src/extract/article')]);
      return extractArticle(parseHtml(html, url), url) as DomOps[K][1];
    }
    case 'blobUrl': {
      const { b64, type } = payload as DomOps['blobUrl'][0];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type })) as DomOps[K][1];
    }
    case 'revokeUrl':
      URL.revokeObjectURL((payload as DomOps['revokeUrl'][0]).url);
      return undefined as DomOps[K][1];
  }
  throw new Error(`Unknown DOM op ${String(op)}`);
}

interface ChromeOffscreen {
  offscreen?: { createDocument(p: { url: string; reasons: string[]; justification: string }): Promise<void> };
  runtime: { getContexts?(f: { contextTypes: string[] }): Promise<unknown[]> };
}

let creating: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  const api = browser as unknown as ChromeOffscreen;
  if (!api.offscreen) throw new Error('No DOM and no offscreen API');
  const existing = await api.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing?.length) return;
  // Only one offscreen document per extension: serialize concurrent creators.
  creating ??= api.offscreen.createDocument({
    url: browser.runtime.getURL('/offscreen.html' as never),
    reasons: ['DOM_PARSER', 'BLOBS'],
    justification: 'Convert web pages and Markdown to sanitized HTML and create download URLs (the service worker has no DOM).',
  }).finally(() => { creating = null; });
  await creating;
}

/** Run a DOM operation here if possible, else in the offscreen document. */
export async function dom<K extends DomOp>(op: K, payload: DomOps[K][0]): Promise<DomOps[K][1]> {
  if (hasDom()) return runDomOp(op, payload);
  await ensureOffscreen();
  const res = (await browser.runtime.sendMessage({ target: OFFSCREEN_TARGET, op, payload })) as
    | { ok: true; data: DomOps[K][1] } | { ok: false; error: string } | undefined;
  if (!res) throw new Error('Offscreen document did not answer');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
