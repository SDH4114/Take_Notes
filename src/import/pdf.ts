// PDF → Markdown for importing the user's own notes. Layout analysis is pure (unit-tested); pdf.js is loaded
// lazily by extractPdf() so the ~1.7 MB library only reaches the page that imports a PDF.

/** One text run on a page; y grows upwards (PDF space), `size` ≈ font size. */
export interface PdfItem { str: string; x: number; y: number; width: number; size: number }

/** A visual line; `right` = x where its text ends. */
interface Line { text: string; y: number; size: number; x: number; right: number }

/** Below this many letters per page on average the PDF is treated as a scan (no text layer). */
export const SCAN_CHARS_PER_PAGE = 20;

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Group a page's items into visual lines (top to bottom), inserting spaces where runs are apart. */
export function pageLines(items: PdfItem[]): Line[] {
  const runs = items.filter((i) => i.str.length).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { items: PdfItem[]; y: number; size: number }[] = [];
  for (const it of runs) {
    const size = it.size || 10;
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(l.size, size) * 0.5);
    if (line) { line.items.push(it); line.size = Math.max(line.size, size); }
    else lines.push({ items: [it], y: it.y, size });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const sorted = l.items.sort((a, b) => a.x - b.x);
      let text = '';
      let end = -Infinity;
      for (const it of sorted) {
        const gap = it.x - end;
        if (text && gap > l.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
        text += it.str;
        end = it.x + it.width;
      }
      return { text: text.replace(/\s+/g, ' ').trim(), y: l.y, size: l.size, x: sorted[0]!.x, right: end };
    })
    .filter((l) => l.text);
}

/** "Page 3", "- 3 -", "стр. 3 из 10", "3" → the same key so running headers/footers can be found. */
const repeatKey = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const isPageNumber = (s: string) => /^[-–—\s]*(?:(?:стр|с|page|p)\.?\s*)?\d+(?:\s*(?:из|of|\/)\s*\d+)?[-–—\s]*$/i.test(s);

/** Remove page numbers and lines repeated at the top/bottom of most pages (running headers/footers). */
export function stripHeadersFooters(pages: Line[][]): Line[][] {
  // Page numbers may sit one line in from the edge (under a running header); repeated text only on the very edge.
  const near = (p: Line[]) => new Set([p[0], p[1], p[p.length - 2], p[p.length - 1]].filter((l): l is Line => !!l));
  const outer = (p: Line[]) => new Set([p[0], p[p.length - 1]].filter((l): l is Line => !!l));
  const counts = new Map<string, number>();
  if (pages.length >= 3) {
    for (const p of pages) for (const k of new Set([...outer(p)].map((l) => repeatKey(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const repeated = (l: Line) => (counts.get(repeatKey(l.text)) ?? 0) >= Math.max(3, pages.length / 2);
  return pages.map((p) => {
    const n = near(p), o = outer(p);
    return p.filter((l) => !((n.has(l) && isPageNumber(l.text)) || (o.has(l) && repeated(l))));
  });
}

const BULLET = /^([•●▪◦‣∙·■□➢►–-])\s*/;
const NUMBERED = /^(\d{1,3}|[a-zа-я])[.)]\s+/i;
const endsSentence = (s: string) => /[.!?:;»")\]]$/.test(s);
const startsLower = (s: string) => /^\p{Ll}/u.test(s);

/** Escape characters that would turn plain PDF text into Markdown structure. */
const escapeLine = (s: string) => s.replace(/^(#{1,6}\s|>|\d+\.\s)/, '\\$1').replace(/([*_`[\]<])/g, '\\$1');

function joinLines(a: string, b: string): string {
  // "приме-" + "ром" → "примером": Russian layouts hyphenate words. In Latin text a line-end hyphen is more often a
  // real compound ("lower-" + "order"), so it is kept.
  if (/\p{Script=Cyrillic}-$/u.test(a) && startsLower(b)) return a.slice(0, -1) + b;
  if (/\p{L}-$/u.test(a) && startsLower(b)) return a + b;
  return `${a} ${b}`;
}

/**
 * Turn pages of text items into Markdown: paragraphs from vertical gaps, headings from font size,
 * bullet / numbered lists, de-hyphenated line breaks, running headers/footers removed.
 */
export function itemsToMarkdown(pages: PdfItem[][]): { markdown: string; heading?: string; chars: number } {
  const linesByPage = stripHeadersFooters(pages.map(pageLines));
  const all = linesByPage.flat();
  const chars = all.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
  if (!all.length) return { markdown: '', chars: 0 };

  // Body size = the size most text is set in (weighted by length).
  const body = median(all.flatMap((l) => Array(Math.min(l.text.length, 200)).fill(Math.round(l.size * 2) / 2) as number[]));
  const level = (l: Line): number => {
    if (l.text.length > 120 || endsSentence(l.text) && l.text.length > 60) return 0;
    if (l.size >= body * 1.5) return 2;
    if (l.size >= body * 1.18) return 3;
    return 0;
  };

  interface Block { text: string; kind: 'h' | 'p' | 'li'; indented: boolean }
  const blocks: Block[] = [];
  let cur: Block | null = null;
  /** x where the current block starts: a wrapped list item continues indented past its bullet. */
  let curX = 0;
  let heading: string | undefined;
  const flush = () => { if (cur) blocks.push(cur); cur = null; };

  linesByPage.forEach((lines, pageIndex) => {
    if (!lines.length) return;
    // Text column of this page: body lines start at `left`; a line ending well before `right` was broken on purpose.
    const left = Math.min(...lines.map((l) => l.x));
    const right = Math.max(...lines.map((l) => l.right));
    const short = (l: Line) => l.right < right - (right - left) * 0.2;
    const indented = (l: Line) => l.x > left + l.size * 0.8;
    let prev: Line | null = null;
    lines.forEach((l, i) => {
      const h = level(l);
      if (h) {
        // Multi-line headings: consecutive lines of the same heading size merge.
        const last = blocks[blocks.length - 1];
        if (!cur && prev && level(prev) === h && last?.kind === 'h' && last.text.startsWith('#'.repeat(h) + ' ') && prev.y - l.y < l.size * 1.6) {
          last.text += ` ${l.text}`;
        } else {
          flush();
          blocks.push({ kind: 'h', text: `${'#'.repeat(h)} ${escapeLine(l.text).replace(/^\\(#)/, '$1')}`, indented: false });
        }
        heading ??= l.text;
        prev = l;
        return;
      }
      const bullet = BULLET.exec(l.text);
      const numbered = !bullet && NUMBERED.exec(l.text);
      const gap = prev ? prev.y - l.y : 0;
      const c = cur as Block | null;
      const newBlock = !c
        || bullet || numbered
        || (prev && gap > Math.max(prev.size, l.size) * 1.7)
        || (i === 0 && pageIndex > 0 && (endsSentence(c.text) || !startsLower(l.text)))
        || (c.kind === 'li' && l.x <= curX + 1)
        // A short line followed by a capital: the line was ended on purpose (list without bullet glyphs, short lines).
        || (i > 0 && prev && short(prev) && !startsLower(l.text))
        // Indented capital after a finished sentence: a new paragraph ("красная строка") or the first list item.
        || (prev && indented(l) && !indented(prev) && endsSentence(prev.text) && !startsLower(l.text));
      if (newBlock) {
        flush();
        curX = l.x;
        if (bullet) cur = { kind: 'li', text: `- ${escapeLine(l.text.slice(bullet[0].length))}`, indented: indented(l) };
        else if (numbered) cur = { kind: 'li', text: `${numbered[1]}. ${escapeLine(l.text.slice(numbered[0].length))}`, indented: indented(l) };
        else cur = { kind: 'p', text: escapeLine(l.text), indented: indented(l) };
      } else {
        c!.text = joinLines(c!.text, escapeLine(l.text));
        c!.indented &&= indented(l);
      }
      prev = l;
    });
  });
  flush();

  // Bullets drawn as graphics leave no text: two or more consecutive indented blocks (every line indented) are a list.
  // A paragraph with a first-line indent ("красная строка") is not: its next lines start at the margin.
  for (let i = 0; i < blocks.length;) {
    let j = i;
    while (j < blocks.length && blocks[j]!.kind === 'p' && blocks[j]!.indented) j++;
    if (j - i >= 2) for (let k = i; k < j; k++) { blocks[k]!.kind = 'li'; blocks[k]!.text = `- ${blocks[k]!.text}`; }
    i = Math.max(j, i + 1);
  }

  // Keep consecutive list items together (one list), separate everything else by a blank line.
  let markdown = '';
  blocks.forEach((b, i) => {
    if (i) markdown += b.kind === 'li' && blocks[i - 1]!.kind === 'li' ? '\n' : '\n\n';
    markdown += b.text;
  });
  return { markdown: markdown + '\n', heading, chars };
}

/** pdf.js getTextContent() items → PdfItem (position from the transform matrix, size = its vertical scale). */
export function textItems(items: readonly unknown[]): PdfItem[] {
  return items.flatMap((raw) => {
    const it = raw as { str?: unknown; transform?: number[]; width?: number; height?: number };
    if (typeof it.str !== 'string' || !Array.isArray(it.transform)) return [];
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = it.transform;
    return [{ str: it.str, x: e, y: f, width: it.width ?? 0, size: Math.hypot(c, d) || Math.hypot(a, b) || (it.height ?? 0) }];
  });
}

export interface PdfText { markdown: string; heading?: string; chars: number; pages: number; title?: string; author?: string }

/** Read a PDF with pdf.js (lazily imported) and return its text as Markdown + metadata. Throws on broken files. */
export async function extractPdf(bytes: Uint8Array, onPage?: (done: number, total: number) => void): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // pdf.js transfers the buffer to its worker: give it a copy so the caller's bytes stay usable.
  const task = pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: PdfItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(textItems(content.items));
      page.cleanup();
      onPage?.(n, doc.numPages);
    }
    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: unknown; Author?: unknown };
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    return { ...itemsToMarkdown(pages), pages: doc.numPages, title: str(info.Title), author: str(info.Author) };
  } finally {
    await task.destroy();
  }
}
