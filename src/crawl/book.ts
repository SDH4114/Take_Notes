// Pure helper: assemble a whole book into one Markdown document.
import type { Book } from '@/src/core/types';
import { translator, type Lang } from '@/src/core/i18n';
import { strings } from './strings';

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^(#{1,6})(\s+.*)$/;

/** Shift ATX headings by `shift` levels (cap 6), skipping fenced code blocks. */
function shiftHeadings(md: string, shift: number): string {
  let fence: string | null = null;
  return md
    .split('\n')
    .map((line) => {
      const f = FENCE.exec(line);
      if (f) {
        if (!fence) fence = f[1]!;
        else if (f[1] === fence) fence = null;
        return line;
      }
      if (fence) return line;
      const h = HEADING.exec(line);
      return h ? `${'#'.repeat(Math.min(6, h[1]!.length + shift))}${h[2]}` : line;
    })
    .join('\n');
}

/** Remove a leading "# Title" line when it repeats the chapter title. */
function dropDuplicateTitle(md: string, title: string): string {
  const m = /^\s*#\s+(.+?)\s*(?:\n|$)/.exec(md);
  if (m && m[1]!.trim().toLowerCase() === title.trim().toLowerCase()) return md.slice(m[0].length);
  return md;
}

/** Default book title from a page URL: "<Section> — <host>", e.g. "Rust — metanit.com". */
export function defaultBookTitle(pageUrl: string): string {
  const u = new URL(pageUrl);
  const section = u.pathname.split('/').filter(Boolean)[0];
  if (!section || section.includes('.')) return u.hostname;
  const name = decodeURIComponent(section).replace(/[-_]+/g, ' ');
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} — ${u.hostname}`;
}

export function bookToMarkdown(book: Book, lang?: Lang): string {
  const t = translator(strings, lang);
  const accessed = book.source.accessed.slice(0, 10);
  const out: string[] = [`# ${book.title}`, '', `${t('source')}: ${book.rootUrl} (${t('accessed')}: ${accessed})`, ''];

  if (book.chapters.length) {
    out.push(`## ${t('contents')}`, '');
    book.chapters.forEach((c, i) => out.push(`${'  '.repeat(c.level)}- [${c.title}](#chapter-${i + 1})`));
    out.push('');
  }

  book.chapters.forEach((c, i) => {
    const depth = Math.min(6, 2 + c.level);
    const body = shiftHeadings(dropDuplicateTitle(c.markdown, c.title), depth).trim();
    out.push(`<a id="chapter-${i + 1}"></a>`, '', `${'#'.repeat(depth)} ${c.title}`, '', body, '');
  });

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
