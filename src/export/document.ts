// Pure builders of Markdown export documents (no I/O).
import { formatBibliography } from '@/src/cite';
import { uiLang, type Lang } from '@/src/core/i18n';
import type { Book, Clip, Highlight, Project, Settings, SourceMeta } from '@/src/core/types';
import { normalizeUrl, slugifyFilename } from '@/src/core/util';
import { exportT } from './strings';

// ---------- YAML / frontmatter

const YAML_RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;

/** YAML scalar: plain when it is safe, otherwise a double-quoted (JSON-escaped) string. */
export function yamlScalar(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^[\p{L}][\p{L}\p{N}_\-/.]*$/u.test(value) && !YAML_RESERVED.test(value)) return value;
  return JSON.stringify(value);
}

type FmValue = string | string[] | undefined;

function frontmatter(entries: [string, FmValue][]): string {
  const lines = ['---'];
  for (const [key, v] of entries) {
    if (v == null || (Array.isArray(v) && !v.length) || v === '') continue;
    if (Array.isArray(v)) lines.push(`${key}:`, ...v.map((x) => `  - ${yamlScalar(x)}`));
    else lines.push(`${key}: ${yamlScalar(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

const day = (iso: string | undefined): string | undefined => (iso ? iso.slice(0, 10) : undefined);
const obsidianTag = (t: string) => t.trim().replace(/\s+/g, '-');
const uniq = <T>(xs: T[]) => [...new Set(xs)];

// ---------- markdown helpers

/** Shift ATX headings by `by` levels (clamped to 6); fenced code blocks are left alone. */
export function shiftHeadings(md: string, by: number): string {
  if (by === 0) return md;
  let fence: string | null = null;
  return md
    .split('\n')
    .map((line) => {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (m) {
        const ch = (m[1] ?? '').charAt(0);
        if (!fence) fence = ch;
        else if (ch === fence) fence = null;
        return line;
      }
      if (fence) return line;
      const h = /^(#{1,6})(\s+.*)$/.exec(line);
      return h ? `${'#'.repeat(Math.min(6, (h[1] ?? '').length + by))}${h[2] ?? ''}` : line;
    })
    .join('\n');
}

/** Remove a leading `# Title` that merely repeats the document title. */
function stripLeadingTitle(md: string, title: string): string {
  const body = md.replace(/^\s*\n/, '');
  const m = /^# +(.*?)(?: +#+)?\s*(?:\n|$)/.exec(body);
  if (m && (m[1] ?? '').trim() === title.trim()) return body.slice(m[0].length).replace(/^\s*\n/, '');
  return body;
}

const heading = (level: number, text: string) => `${'#'.repeat(Math.min(6, level))} ${text}`;

function ghSlug(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
}

const wikiSafe = (s: string) => s.replace(/[[\]|#^]/g, ' ').replace(/\s+/g, ' ').trim();

function sourceLine(s: SourceMeta, lang: Lang): string {
  const t = exportT(lang);
  return `${t('source')}: [${s.title || s.url}](${s.url}) (${t('accessed')} ${day(s.accessed)})`;
}

function noteCallout(note: string | undefined): string {
  if (!note?.trim()) return '';
  return `> [!note]\n${note.trim().split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')}\n\n`;
}

// ---------- clip

export function clipToMarkdown(clip: Clip, settings: Settings, lang: Lang = uiLang()): string {
  const s = clip.source;
  let out = '';
  if (settings.obsidian.frontmatter) {
    out += frontmatter([
      ['title', clip.title],
      ['source', s.url],
      ['author', s.authors],
      ['published', day(s.published)],
      ['accessed', day(s.accessed)],
      ['site', s.siteName],
      ['tags', uniq(['takenotes', ...clip.tags.map(obsidianTag)].filter(Boolean))],
    ]) + '\n';
  }
  out += `# ${clip.title}\n\n${sourceLine(s, lang)}\n\n${noteCallout(clip.note)}`;
  out += `${shiftHeadings(stripLeadingTitle(clip.markdown, clip.title), 1).trimEnd()}\n`;
  return out;
}

// ---------- project

export function inboxName(lang: Lang = uiLang()): string {
  return exportT(lang)('inbox');
}

function bibliography(sources: SourceMeta[], style: Project['citationStyle'], lang: Lang): string {
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    const k = normalizeUrl(s.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!unique.length) return '';
  const items = formatBibliography(unique, style).map((e, i) => `${i + 1}. ${e}`);
  return `${heading(2, exportT(lang)('references'))}\n\n${items.join('\n')}\n`;
}

export function projectToMarkdown(project: Project, clips: Clip[], settings: Settings, lang: Lang = uiLang()): string {
  const t = exportT(lang);
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  // Group by section in order of first appearance; the unnamed group is rendered without a heading.
  const groups = new Map<string, Clip[]>();
  for (const c of sorted) {
    const key = c.section?.trim() ?? '';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  let out = '';
  if (settings.obsidian.frontmatter) {
    out += frontmatter([['title', project.name], ['tags', ['takenotes']]]) + '\n';
  }
  out += `# ${project.name}\n\n`;
  if (project.description?.trim()) out += `${project.description.trim()}\n\n`;

  if (sorted.length) {
    out += `${heading(2, t('contents'))}\n\n`;
    for (const [section, list] of groups) {
      const indent = section ? '  ' : '';
      if (section) out += `- [${section}](#${ghSlug(section)})\n`;
      for (const c of list) out += `${indent}- [${c.title}](#${ghSlug(c.title)})\n`;
    }
    out += '\n';
  }

  for (const [section, list] of groups) {
    if (section) out += `${heading(2, section)}\n\n`;
    const level = section ? 3 : 2;
    for (const c of list) {
      out += `${heading(level, c.title)}\n\n${sourceLine(c.source, lang)}\n\n${noteCallout(c.note)}`;
      out += `${shiftHeadings(stripLeadingTitle(c.markdown, c.title), level).trimEnd()}\n\n`;
    }
  }

  if (settings.obsidian.wikilinks && sorted.length > 1) {
    out += `${heading(2, t('related'))}\n\n${sorted.map((c) => `- [[${wikiSafe(c.title)}]]`).join('\n')}\n\n`;
  }
  out += bibliography(sorted.map((c) => c.source), project.citationStyle, lang);
  return out.trimEnd() + '\n';
}

// ---------- book

function bookFrontmatter(book: Book, settings: Settings): string {
  if (!settings.obsidian.frontmatter) return '';
  return frontmatter([
    ['title', book.title],
    ['source', book.rootUrl],
    ['accessed', day(book.source.accessed)],
    ['site', book.source.siteName],
    ['tags', ['takenotes', 'book']],
  ]) + '\n';
}

export function bookToMarkdownExport(book: Book, settings: Settings, lang: Lang = uiLang()): string {
  const t = exportT(lang);
  let out = `${bookFrontmatter(book, settings)}# ${book.title}\n\n${sourceLine(book.source, lang)}\n\n`;
  if (book.chapters.length) {
    out += `${heading(2, t('contents'))}\n\n`;
    for (const c of book.chapters) out += `${'  '.repeat(c.level)}- [${c.title}](#${ghSlug(c.title)})\n`;
    out += '\n';
  }
  for (const c of book.chapters) {
    const level = Math.min(6, 2 + c.level);
    out += `${heading(level, c.title)}\n\n`;
    out += `${shiftHeadings(stripLeadingTitle(c.markdown, c.title), level).trimEnd()}\n\n`;
  }
  return out.trimEnd() + '\n';
}

/** Chapter file names (`NN - Title.md`), index of `book.chapters`. */
function chapterFileNames(book: Book): string[] {
  const width = Math.max(2, String(book.chapters.length).length);
  return book.chapters.map((c, i) => `${String(i + 1).padStart(width, '0')} - ${slugifyFilename(c.title, 60)}.md`);
}

/** One file per chapter plus index.md. Keys are relative paths. */
export function bookToFolderFiles(book: Book, settings: Settings, lang: Lang = uiLang()): Record<string, string> {
  const names = chapterFileNames(book);
  const files: Record<string, string> = {};
  let index = `${bookFrontmatter(book, settings)}# ${book.title}\n\n${sourceLine(book.source, lang)}\n\n`;
  book.chapters.forEach((c, i) => {
    const name = names[i] ?? '';
    const stem = name.slice(0, -3);
    const link = settings.obsidian.wikilinks
      ? `[[${stem}|${wikiSafe(c.title)}]]`
      : `[${c.title}](${encodeURI(name)})`;
    index += `${'  '.repeat(c.level)}- ${link}\n`;
    files[name] = `# ${c.title}\n\n${shiftHeadings(stripLeadingTitle(c.markdown, c.title), 1).trimEnd()}\n`;
  });
  files['index.md'] = index;
  return files;
}

// ---------- highlights (local fallback; agent C may provide highlightsToMarkdown)

