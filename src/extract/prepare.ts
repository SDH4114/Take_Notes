// Shared preprocessing and post-processing for page and selection extraction.
import DOMPurify from 'dompurify';
import { detectCodeLanguage, htmlToMarkdown } from '@/src/markdown';
import { replaceMath } from './math';

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original'];
const LAZY_SRCSET_ATTRS = ['data-srcset', 'data-lazy-srcset'];
/** Tiny data: URIs are lazy-load placeholders (1x1 gifs, etc). */
const MAX_PLACEHOLDER_DATA_URI = 400;

function toAbs(value: string | null, base: string): string | null {
  if (!value || !value.trim()) return null;
  try {
    return new URL(value.trim(), base).toString();
  } catch {
    return null;
  }
}

function absSrcset(srcset: string, base: string): string {
  return srcset
    .split(/,\s+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [u = '', ...desc] = c.split(/\s+/);
      return [toAbs(u, base) ?? u, ...desc].join(' ');
    })
    .join(', ');
}

function fixImages(root: Element, base: string): void {
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const lazy = LAZY_ATTRS.map((a) => img.getAttribute(a)).find((v) => v?.trim());
    const lazySet = LAZY_SRCSET_ATTRS.map((a) => img.getAttribute(a)).find((v) => v?.trim());
    if (lazy) img.setAttribute('src', lazy);
    if (lazySet) img.setAttribute('srcset', lazySet);
    for (const a of [...LAZY_ATTRS, ...LAZY_SRCSET_ATTRS]) img.removeAttribute(a);

    let src = img.getAttribute('src');
    if (src?.startsWith('data:') && src.length <= MAX_PLACEHOLDER_DATA_URI && !lazy) src = null;
    if (!src && img.getAttribute('srcset')) src = img.getAttribute('srcset')!.trim().split(/[\s,]+/)[0] ?? null;
    const abs = src?.startsWith('data:') ? src : toAbs(src, base);
    if (!abs) {
      img.remove();
      continue;
    }
    img.setAttribute('src', abs);
    const set = img.getAttribute('srcset');
    if (set) img.setAttribute('srcset', absSrcset(set, base));
  }
}

function fixLinks(root: Element, base: string): void {
  for (const a of Array.from(root.querySelectorAll('a[href]'))) {
    const abs = toAbs(a.getAttribute('href'), base);
    if (abs) a.setAttribute('href', abs);
    else a.removeAttribute('href');
  }
}

function fixCode(root: Element): void {
  for (const pre of Array.from(root.querySelectorAll('pre'))) {
    const lang = detectCodeLanguage(pre);
    if (!lang) continue;
    let code = pre.querySelector('code');
    if (!code) {
      code = pre.ownerDocument.createElement('code');
      while (pre.firstChild) code.appendChild(pre.firstChild);
      pre.appendChild(code);
    }
    if (!/(^|\s)language-/.test(code.className)) code.classList.add(`language-${lang}`);
  }
}

function dropNoise(root: Element): void {
  // Wikipedia section edit links ("[править]" / "[edit]") and similar chrome.
  for (const el of Array.from(root.querySelectorAll('.mw-editsection, .mw-editsection-bracket, .mw-cite-backlink, .noprint'))) el.remove();
  // Our own highlight marks (src/highlight/render.ts) must not leak into saved clips: unwrap, keep the text.
  for (const mark of Array.from(root.querySelectorAll('mark.tn-hl'))) mark.replaceWith(...Array.from(mark.childNodes));
  // Footnote refs: keep the "[1]" label as plain text.
  for (const sup of Array.from(root.querySelectorAll('sup.reference'))) sup.replaceWith(sup.ownerDocument.createTextNode(sup.textContent ?? ''));
}

/** Mutates `root`: math markers, code languages, absolute URLs, lazy images, noise. */
export function prepareContent(root: Element, baseUrl: string): void {
  dropNoise(root);
  replaceMath(root);
  fixCode(root);
  fixImages(root, baseUrl);
  fixLinks(root, baseUrl);
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'noscript'],
    FORBID_ATTR: ['style'],
  });
}

export function collectImageUrls(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const urls = new Set<string>();
  for (const img of Array.from(doc.querySelectorAll('img[src]'))) {
    const src = img.getAttribute('src')!;
    if (/^https?:\/\//i.test(src)) urls.add(src);
  }
  return [...urls];
}

/** Sanitize prepared HTML and derive markdown and image urls from the sanitized result. */
export function finishHtml(preparedHtml: string, baseUrl: string): { html: string; markdown: string; imageUrls: string[] } {
  const html = sanitizeHtml(preparedHtml);
  return { html, markdown: htmlToMarkdown(html, baseUrl), imageUrls: collectImageUrls(html) };
}
