// Print documents: model + HTML builder used by entrypoints/print. Page HTML is sanitized with DOMPurify.
import DOMPurify from 'dompurify';
import { formatBibliography } from '@/src/cite';
import { MATH_ATTR, MATH_TEX_ATTR } from '@/src/markdown';
import { uiLang, type Lang } from '@/src/core/i18n';
import type { Book, Clip, Highlight, Project, SourceMeta } from '@/src/core/types';
import { normalizeUrl } from '@/src/core/util';
import { exportT } from './strings';

export interface PrintSection {
  title: string;
  /** 1 = chapter/clip/part, 2 = nested. Section headings are h{level}; body headings are shifted below it. */
  level: 1 | 2;
  /** Already sanitized HTML. */
  html: string;
  source?: { title: string; url: string };
}

export interface PrintDoc {
  title: string;
  /** Plain-text line under the title (e.g. project description). */
  subtitle?: string;
  source?: { title: string; url: string };
  /** YYYY-MM-DD */
  date: string;
  lang: Lang;
  sections: PrintSection[];
  bibliography: string[];
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isHttp = (u: string) => /^https?:\/\//i.test(u);
const today = () => new Date().toISOString().slice(0, 10);

// ---------- HTML preparation

/** Replace TeX-annotated math (KaTeX/MathML) by monospace `$…$` text — no math renderer is bundled. */
function mathToText(root: ParentNode): void {
  // Marker spans produced by src/extract/math.ts (data-tn-math="inline|display", data-tex="…").
  for (const span of Array.from(root.querySelectorAll(`span[${MATH_ATTR}]`))) {
    const code = span.ownerDocument.createElement('code');
    code.className = 'tn-math';
    const tex = span.getAttribute(MATH_TEX_ATTR) ?? span.textContent ?? '';
    code.textContent = span.getAttribute(MATH_ATTR) === 'display' ? `$$${tex}$$` : `$${tex}$`;
    span.replaceWith(code);
  }
  for (const ann of Array.from(root.querySelectorAll('annotation[encoding="application/x-tex"]'))) {
    let el: Element = ann.closest('math') ?? ann;
    const display = el.getAttribute('display') === 'block' || !!el.closest('.katex-display');
    for (const sel of ['.katex', '.katex-display', '.mwe-math-element']) el = el.closest(sel) ?? el;
    if (!el.parentNode) continue; // already replaced together with an enclosing wrapper
    const code = el.ownerDocument.createElement('code');
    code.className = 'tn-math';
    const tex = (ann.textContent ?? '').trim();
    code.textContent = display ? `$$${tex}$$` : `$${tex}$`;
    el.replaceWith(code);
  }
}

/** Sanitize page HTML, shift headings down by `shift`, render math as text, load images eagerly. */
export function prepareHtml(html: string, shift: number): string {
  const pre = document.createElement('template');
  pre.innerHTML = html;
  mathToText(pre.content);
  const clean = DOMPurify.sanitize(pre.innerHTML);

  const tpl = document.createElement('template');
  tpl.innerHTML = clean;
  for (const h of Array.from(tpl.content.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
    const level = Math.min(6, Number(h.tagName[1]) + shift);
    if (level === Number(h.tagName[1])) continue;
    const next = document.createElement(`h${level}`);
    next.append(...Array.from(h.childNodes));
    h.replaceWith(next);
  }
  for (const img of Array.from(tpl.content.querySelectorAll('img'))) {
    img.removeAttribute('loading');
    img.removeAttribute('srcset');
  }
  return tpl.innerHTML;
}

// ---------- document models

const srcRef = (s: SourceMeta) => ({ title: s.title || s.url, url: s.url });

function biblio(sources: SourceMeta[], style: Project['citationStyle']): string[] {
  const seen = new Set<string>();
  const unique = sources.filter((s) => !seen.has(normalizeUrl(s.url)) && !!seen.add(normalizeUrl(s.url)));
  return unique.length ? formatBibliography(unique, style) : [];
}

export function clipPrintDoc(clip: Clip, lang: Lang = uiLang()): PrintDoc {
  return {
    title: clip.title, source: srcRef(clip.source), date: today(), lang, bibliography: [],
    sections: [{ title: clip.title, level: 1, html: prepareHtml(clip.html, 1), source: srcRef(clip.source) }],
  };
}

export function projectPrintDoc(project: Project, clips: Clip[], lang: Lang = uiLang()): PrintDoc {
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const groups = new Map<string, Clip[]>();
  for (const c of sorted) groups.set(c.section?.trim() ?? '', [...(groups.get(c.section?.trim() ?? '') ?? []), c]);
  const sections: PrintSection[] = [];
  for (const [section, list] of groups) {
    const level = section ? 2 : 1;
    if (section) sections.push({ title: section, level: 1, html: '' });
    for (const c of list) {
      sections.push({ title: c.title, level, html: prepareHtml(c.html, level), source: srcRef(c.source) });
    }
  }
  return {
    title: project.name, subtitle: project.description, date: today(), lang, sections,
    bibliography: biblio(sorted.map((c) => c.source), project.citationStyle),
  };
}

export function bookPrintDoc(book: Book, lang: Lang = uiLang()): PrintDoc {
  return {
    title: book.title, source: srcRef(book.source), date: today(), lang, bibliography: [],
    sections: book.chapters.map((c) => {
      const level = c.level > 0 ? 2 : 1;
      return { title: c.title, level, html: prepareHtml(c.html, level), source: { title: c.url, url: c.url } };
    }),
  };
}

export function highlightsPrintDoc(items: Highlight[], name: string, lang: Lang = uiLang()): PrintDoc {
  const byUrl = new Map<string, Highlight[]>();
  for (const h of items) byUrl.set(h.url, [...(byUrl.get(h.url) ?? []), h]);
  const sections: PrintSection[] = [...byUrl.values()].map((list) => ({
    title: list[0]!.source.title || list[0]!.url,
    level: 1,
    source: srcRef(list[0]!.source),
    html: list
      .map((h) => `<blockquote>${escapeHtml(h.text.trim())}</blockquote>${h.note?.trim() ? `<p class="note">${escapeHtml(h.note.trim())}</p>` : ''}`)
      .join(''),
  }));
  return { title: name, date: today(), lang, sections, bibliography: [] };
}

// ---------- HTML

function link(r: { title: string; url: string }): string {
  return isHttp(r.url) ? `<a href="${escapeHtml(r.url)}">${escapeHtml(r.title)}</a>` : escapeHtml(r.title);
}

/** Body HTML of the print page (title page, contents, chapters, bibliography). */
export function buildPrintHtml(doc: PrintDoc): string {
  const t = exportT(doc.lang);
  let out = `<header class="title-page"><h1>${escapeHtml(doc.title)}</h1>`;
  if (doc.subtitle?.trim()) out += `<p class="subtitle">${escapeHtml(doc.subtitle.trim())}</p>`;
  if (doc.source) out += `<p class="meta">${t('source')}: ${link(doc.source)}</p>`;
  out += `<p class="meta">${doc.date}</p></header>`;

  if (doc.sections.length > 1) {
    out += `<nav class="toc"><h2>${t('contents')}</h2><ul>`;
    doc.sections.forEach((s, i) => {
      out += `<li class="l${s.level}"><a href="#s${i + 1}">${escapeHtml(s.title)}</a></li>`;
    });
    out += '</ul></nav>';
  }

  doc.sections.forEach((s, i) => {
    out += `<section class="chapter" id="s${i + 1}"><h${s.level}>${escapeHtml(s.title)}</h${s.level}>`;
    if (s.source) out += `<p class="src">${t('source')}: ${link(s.source)}</p>`;
    out += `${s.html}</section>`;
  });

  if (doc.bibliography.length) {
    out += `<section class="biblio"><h1>${t('references')}</h1><ol>`;
    for (const e of doc.bibliography) out += `<li>${escapeHtml(e)}</li>`;
    out += '</ol></section>';
  }
  return out;
}

export const PRINT_CSS = `
@page { margin: 18mm 16mm; }
html { font-size: 11pt; }
body { font-family: Georgia, "Times New Roman", "Noto Serif", serif; line-height: 1.45; color: #000; background: #fff; max-width: none; margin: 0; }
h1, h2, h3, h4, h5, h6 { font-family: "Helvetica Neue", Arial, sans-serif; line-height: 1.25; break-after: avoid; }
h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; } h4, h5, h6 { font-size: 11pt; }
.title-page { min-height: 85vh; display: flex; flex-direction: column; justify-content: center; text-align: center; }
.title-page h1 { font-size: 28pt; }
.title-page .meta, .title-page .subtitle { color: #333; }
.toc, .chapter, .biblio { break-before: page; }
.toc ul { list-style: none; padding: 0; }
.toc li { margin: .25em 0; }
.toc li.l2 { margin-left: 1.5em; }
.toc a { color: inherit; text-decoration: none; }
.src { font-size: 9.5pt; color: #444; }
a { color: #0645ad; word-break: break-word; }
img, svg, video { max-width: 100%; height: auto; }
figure, pre, blockquote, tr, img { break-inside: avoid; }
pre { font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 9pt; white-space: pre-wrap; overflow-wrap: anywhere; background: #f5f5f5; border: 1px solid #ccc; padding: .5em .7em; }
code { font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: .92em; overflow-wrap: anywhere; }
code.tn-math { background: #f5f5f5; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #555; padding: .3em .5em; vertical-align: top; }
thead { display: table-header-group; }
blockquote { margin: 1em 0; padding: .1em 1em; border-left: 3px solid #999; color: #222; }
p.note { margin-left: 1em; font-style: italic; }
.biblio ol { padding-left: 1.6em; }
`;
