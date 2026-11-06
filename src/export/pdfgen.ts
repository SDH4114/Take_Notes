// PDF files generated in JS (pdfmake + html-to-pdfmake) — used where Firefox' saveAsPDF can't help: it always opens a
// save dialog and can't put files into a zip. Input is a PrintDoc (already sanitized HTML from printdoc.ts).
import { isHttpUrl, readBodyCapped } from '@/src/core/util';
import { exportT } from './strings';
import type { PrintDoc } from './printdoc';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PDF_IMAGE = /^image\/(png|jpe?g)$/i; // the only raster formats pdfkit embeds

/** "rgba(r,g,b,a)" over white → "#rrggbb" (pdfmake has no alpha for backgrounds). */
export function flattenRgba(css: string): string | null {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(css);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(m[4])));
  const ch = (v: string) => Math.round(Number(v) * a + 255 * (1 - a)).toString(16).padStart(2, '0');
  return `#${ch(m[1]!)}${ch(m[2]!)}${ch(m[3]!)}`;
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * Rewrite HTML into what html-to-pdfmake understands: <mark> → span with a solid background, <blockquote> → indented
 * div, inline <code> → shaded span, images → data: URLs (PNG/JPEG only; others become their alt text).
 */
export async function prepareForPdf(html: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const tpl = document.createElement('template');
  tpl.innerHTML = html; // already sanitized by printdoc (DOMPurify); a template is inert
  const root = tpl.content;
  const swap = (el: Element, tag: string, style: string) => {
    const n = document.createElement(tag);
    n.setAttribute('style', style);
    n.append(...Array.from(el.childNodes));
    el.replaceWith(n);
  };
  for (const m of Array.from(root.querySelectorAll('mark'))) {
    swap(m, 'span', `background-color: ${flattenRgba(m.getAttribute('style') ?? '') ?? '#fde68a'}`);
  }
  for (const q of Array.from(root.querySelectorAll('blockquote'))) swap(q, 'div', 'margin-left: 14px; color: #333333; font-style: italic');
  for (const c of Array.from(root.querySelectorAll('code'))) {
    if (c.closest('pre')) continue;
    swap(c, 'span', 'background-color: #f0f0f2');
  }
  for (const tag of ['figure', 'figcaption', 'section', 'article', 'aside', 'header', 'footer', 'details', 'summary']) {
    for (const el of Array.from(root.querySelectorAll(tag))) swap(el, 'div', '');
  }
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    let data: string | null = /^data:image\/(png|jpe?g);base64,/i.test(src) ? src : null;
    if (!data && isHttpUrl(src)) {
      try {
        const res = await fetchFn(src, { credentials: 'omit' });
        const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
        if (res.ok && PDF_IMAGE.test(mime)) data = `data:${mime};base64,${toBase64(await readBodyCapped(res, MAX_IMAGE_BYTES))}`;
      } catch {
        data = null; // offline / too big / blocked: fall back to the alt text
      }
    }
    if (data) {
      img.setAttribute('src', data);
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.setAttribute('style', 'width: 460px');
    } else {
      const alt = img.getAttribute('alt')?.trim();
      img.replaceWith(alt ? document.createTextNode(`[${alt}]`) : document.createTextNode(''));
    }
  }
  return tpl.innerHTML;
}

const STYLES = {
  h1: { fontSize: 18, bold: true, marginTop: 10, marginBottom: 6 },
  h2: { fontSize: 15, bold: true, marginTop: 10, marginBottom: 5 },
  h3: { fontSize: 13, bold: true, marginTop: 8, marginBottom: 4 },
  h4: { fontSize: 11.5, bold: true, marginTop: 6, marginBottom: 3 },
  h5: { fontSize: 11, bold: true }, h6: { fontSize: 11, bold: true },
  p: { margin: [0, 3, 0, 6] },
  a: { color: '#0645ad', decoration: null },
  pre: { fontSize: 9, background: '#f5f5f5', margin: [0, 4, 0, 8], preserveLeadingSpaces: true },
  th: { bold: true, fillColor: '#eeeeee' },
  table: { marginBottom: 8 },
};

let lib: Promise<{ pdfMake: typeof import('pdfmake/build/pdfmake').default; html: typeof import('html-to-pdfmake').default }> | null = null;
/** Loaded on first use only (~1.7 MB with fonts), so the background page stays light. */
function loadLib() {
  lib ??= Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts'), import('html-to-pdfmake')])
    .then(([pm, vfs, h2p]) => {
      const pdfMake = pm.default;
      pdfMake.addVirtualFileSystem(vfs.default);
      // Never let pdfmake fetch anything itself: images are inlined beforehand.
      pdfMake.setUrlAccessPolicy(() => false);
      return { pdfMake, html: h2p.default };
    });
  return lib;
}

/** Render a PrintDoc to a PDF Blob (title block, sections, bibliography, page numbers). */
export async function printDocToPdf(doc: PrintDoc, fetchFn?: typeof fetch): Promise<Blob> {
  const { pdfMake, html } = await loadLib();
  const t = exportT(doc.lang);
  const conv = async (h: string) => html(await prepareForPdf(h, fetchFn), { window, defaultStyles: STYLES, removeExtraBlanks: true, tableAutoSize: true });
  const content: unknown[] = [{ text: doc.title, fontSize: 20, bold: true, margin: [0, 0, 0, 4] }];
  if (doc.subtitle?.trim()) content.push({ text: doc.subtitle.trim(), color: '#444444', margin: [0, 0, 0, 4] });
  const meta: unknown[] = [];
  if (doc.source) meta.push(`${t('source')}: `, isHttpUrl(doc.source.url) ? { text: doc.source.title, link: doc.source.url, color: '#0645ad' } : doc.source.title, '  ·  ');
  meta.push(doc.date);
  content.push({ text: meta, fontSize: 9, color: '#555555', margin: [0, 0, 0, 12] });
  const single = doc.sections.length === 1 && doc.sections[0]!.title === doc.title;
  for (const s of doc.sections) {
    if (!single) content.push({ text: s.title, fontSize: s.level === 1 ? 15 : 13, bold: true, margin: [0, 12, 0, 4] });
    if (s.source && !single) {
      content.push({ text: [`${t('source')}: `, isHttpUrl(s.source.url) ? { text: s.source.title, link: s.source.url, color: '#0645ad' } : s.source.title], fontSize: 9, color: '#555555', margin: [0, 0, 0, 6] });
    }
    if (s.html.trim()) content.push(await conv(s.html));
  }
  if (doc.bibliography.length) {
    content.push({ text: t('references'), fontSize: 15, bold: true, margin: [0, 16, 0, 6] });
    content.push({ ol: [...doc.bibliography], fontSize: 10 });
  }
  return pdfMake.createPdf({
    pageSize: 'A4',
    pageOrientation: doc.landscape ? 'landscape' : 'portrait',
    pageMargins: [48, 48, 48, 56],
    info: { title: doc.title, creator: 'TakeNotes' },
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.25 },
    footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: 'center', fontSize: 8, color: '#888888', margin: [0, 20, 0, 0] }),
    content,
  }).getBlob();
}
