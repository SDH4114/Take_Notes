// Table-of-contents detection for documentation sites. Pure: works on any Document + page URL.
import type { TocEntry } from '@/src/core/types';

const NON_HTML_EXT =
  /\.(pdf|zip|gz|tgz|tar|rar|7z|bz2|xz|png|jpe?g|gif|svg|webp|ico|bmp|avif|mp3|mp4|webm|ogg|wav|avi|mov|mkv|exe|dmg|pkg|deb|apk|css|js|mjs|json|xml|rss|atom|epub|mobi|docx?|xlsx?|pptx?)$/i;

const CANDIDATE_SELECTOR =
  'nav, aside, [role=navigation], .toc, #toc, .sidebar, #sidebar, .menu, #menu, ul, ol';

/** Path segments that name a sub-area of a section rather than the section (metanit: /rust/tutorial/). */
const SUBAREA_SEGMENT = /^tutorials?$/i;
/** Segments that are versions/languages (docs.python.org/3/tutorial/): do not step above them. */
const VERSION_OR_LANG = /^(v?\d[\w.-]*|[a-z]{2}(-[a-z]{2})?|latest|stable)$/i;

/** Directory of the page path; /x/tutorial/ is widened to /x/ so a whole section is in scope. */
export function scopePrefix(url: string): string {
  const u = new URL(url);
  const dir = u.pathname.endsWith('/') ? u.pathname : u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1);
  const segs = dir.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  const parent = segs[segs.length - 2];
  if (last && SUBAREA_SEGMENT.test(last) && parent && !VERSION_OR_LANG.test(parent)) segs.pop();
  return `${u.origin}/${segs.length ? `${segs.join('/')}/` : ''}`;
}

/** Same origin and path under prefix. */
export function inScope(link: string, prefix: string): boolean {
  try {
    const l = new URL(link);
    const p = new URL(prefix);
    return l.origin === p.origin && l.pathname.startsWith(p.pathname);
  } catch {
    return false;
  }
}

const stripHash = (u: URL): string => {
  const c = new URL(u.href);
  c.hash = '';
  return c.href;
};

const cleanTitle = (a: Element): string =>
  (a.textContent ?? '').replace(/\s+/g, ' ').trim() || a.getAttribute('aria-label')?.trim() || a.getAttribute('title')?.trim() || '';

function baseUrl(doc: Document, pageUrl: string): string {
  const b = doc.querySelector('base[href]')?.getAttribute('href');
  if (!b) return pageUrl;
  try {
    return new URL(b, pageUrl).href;
  } catch {
    return pageUrl;
  }
}

/** Resolve an anchor to a crawlable HTTP(S) URL without hash, or null. */
function crawlableUrl(a: Element, base: string): string | null {
  const href = a.getAttribute('href')?.trim();
  if (!href || href.startsWith('#')) return null;
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (NON_HTML_EXT.test(u.pathname)) return null;
  return stripHash(u);
}

const isList = (el: Element): boolean => el.tagName === 'UL' || el.tagName === 'OL';

/** List nesting depth of an anchor relative to (and including) the container. */
function listDepth(a: Element, container: Element): number {
  let d = 0;
  for (let n: Element | null = a; n; n = n.parentElement) {
    if (isList(n)) d++;
    if (n === container) break;
  }
  return d;
}

interface Collected { entries: TocEntry[]; allLinks: number; inLi: number }

function collect(container: Element, pageUrl: string, prefix: string | null): Collected {
  const doc = container.ownerDocument;
  const base = baseUrl(doc, pageUrl);
  const anchors = [...container.querySelectorAll('a[href]')];
  const seen = new Set<string>();
  const raw: { url: string; title: string; depth: number }[] = [];
  let inLi = 0;
  for (const a of anchors) {
    const url = crawlableUrl(a, base);
    if (!url || new URL(url).origin !== new URL(pageUrl).origin) continue;
    if (prefix && !inScope(url, prefix)) continue;
    if (seen.has(url)) continue;
    const title = cleanTitle(a);
    if (!title) continue;
    seen.add(url);
    if (a.closest('li') && container.contains(a.closest('li'))) inLi++;
    raw.push({ url, title, depth: listDepth(a, container) });
  }
  const min = raw.length ? Math.min(...raw.map((r) => r.depth)) : 0;
  return {
    entries: raw.map((r) => ({ url: r.url, title: r.title, level: r.depth - min })),
    allLinks: anchors.length,
    inLi,
  };
}

function score(c: Collected): number {
  const n = c.entries.length;
  if (n < 2) return 0;
  const density = n / Math.max(c.allLinks, 1);
  const listShare = c.inLi / n;
  return n * density * (listShare >= 0.7 ? 1.2 : 1);
}

function candidates(doc: Document): Element[] {
  const set = new Set<Element>();
  for (const el of doc.querySelectorAll(CANDIDATE_SELECTOR)) {
    set.add(el);
    if (isList(el) && el.parentElement && el.parentElement !== doc.body) set.add(el.parentElement);
  }
  // Document order: an outer container comes before its descendants, so ties go to the outer one.
  return [...set].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** Find the most TOC-like link container in the document. Empty when nothing plausible exists. */
export function detectToc(doc: Document, pageUrl: string): TocEntry[] {
  const prefix = scopePrefix(pageUrl);
  let best: Collected | null = null;
  let bestScore = 0;
  for (const el of candidates(doc)) {
    const c = collect(el, pageUrl, prefix);
    const s = score(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best?.entries ?? [];
}

/** Links of a user-chosen container: same origin, HTML only, no path-prefix restriction. */
export function entriesFromContainer(container: Element, pageUrl: string): TocEntry[] {
  return collect(container, pageUrl, null).entries;
}
