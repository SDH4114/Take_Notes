// Pure builders of Markdown export documents (no I/O).
import { formatBibliography } from '@/src/cite';
import { uiLang, type Lang } from '@/src/core/i18n';
import type { BoardColumn, Book, Clip, Highlight, Project, Settings, SourceMeta } from '@/src/core/types';
import { normalizeUrl, slugifyFilename } from '@/src/core/util';
import { exportT } from './strings';
import { highlightsForClip, markHighlightsInMarkdown } from '@/src/highlight/apply';
import { highlightsToMarkdown } from '@/src/highlight/markdown';

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

// ---------- highlights inside notes

/** The clip body with its page's highlights marked as ==text==. */
function markedBody(clip: Clip, hls: readonly Highlight[]): string {
  const mine = highlightsForClip(clip, hls);
  return mine.length ? markHighlightsInMarkdown(clip.markdown, mine).markdown : clip.markdown;
}

/** `## Выделения` with every highlight as a quote (+ note), so nothing is lost when inline marking fails. */
function highlightQuotes(list: readonly Highlight[], level: number, lang: Lang): string {
  if (!list.length) return '';
  let out = `${heading(level, exportT(lang)('highlights'))}\n\n`;
  for (const h of list) {
    out += `${h.text.trim().split(/\r?\n/).map((l) => `> ${l}`).join('\n')}\n\n`;
    if (h.note?.trim()) out += `${h.note.trim()}\n\n`;
    if (h.body?.trim()) out += `${shiftHeadings(h.body.trim(), level + 1)}\n\n`;
  }
  return out;
}

/** Highlights relevant to a set of clips: made on their pages or filed in the project itself. */
export function projectHighlights(clips: readonly Clip[], all: readonly Highlight[], projectId: string | null | undefined): Highlight[] {
  const urls = new Set(clips.filter((c) => c.source.url).map((c) => normalizeUrl(c.source.url)));
  return all.filter((h) => urls.has(h.url) || (projectId !== undefined && h.projectId === projectId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------- clip

export function clipToMarkdown(clip: Clip, settings: Settings, lang: Lang = uiLang(), hls: readonly Highlight[] = []): string {
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
  out += `${shiftHeadings(stripLeadingTitle(markedBody(clip, hls), clip.title), 1).trimEnd()}\n`;
  const quotes = highlightQuotes(highlightsForClip(clip, hls), 2, lang);
  if (quotes) out += `\n${quotes.trimEnd()}\n`;
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

export function projectToMarkdown(
  project: Project, clips: Clip[], settings: Settings, lang: Lang = uiLang(), hls: readonly Highlight[] = [],
): string {
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
      out += `${shiftHeadings(stripLeadingTitle(markedBody(c, hls), c.title), level).trimEnd()}\n\n`;
    }
  }

  if (hls.length) out += `${heading(2, t('highlights'))}\n\n${shiftHeadings(highlightsToMarkdown([...hls]), 1).trimEnd()}\n\n`;

  if (settings.obsidian.wikilinks && sorted.length > 1) {
    out += `${heading(2, t('related'))}\n\n${sorted.map((c) => `- [[${wikiSafe(c.title)}]]`).join('\n')}\n\n`;
  }
  out += bibliography(sorted.map((c) => c.source), project.citationStyle, lang);
  return out.trimEnd() + '\n';
}

/** Pick `base`, else `base 2`, `base 3`… not yet in `used` (case-insensitive); marks the result as used. */
function uniqueName(base: string, used: Set<string>): string {
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/**
 * Unique `Title.md` names for clips (in order). Named after the title so [[Title]] links written in notes resolve
 * when the folder is opened in Obsidian (Obsidian matches by file name, in any folder); duplicates get " 2", " 3"…
 */
export function clipFileNames(clips: readonly Clip[]): string[] {
  const used = new Set<string>(['index', 'board']);
  return clips.map((c) => `${uniqueName(slugifyFilename(c.title || 'note', 80), used)}.md`);
}

const folderOf = (c: Clip) => (c.section ?? '').trim().replace(/\s+/g, ' ');

/** One Markdown file per highlight: quote, source, short note, long note, link to the page's note. */
export function highlightFile(h: Highlight, settings: Settings, lang: Lang, noteTitle?: string): string {
  const t = exportT(lang);
  let out = '';
  if (settings.obsidian.frontmatter) {
    out += frontmatter([
      ['source', h.source.url || h.url], ['site', h.source.siteName], ['accessed', day(h.source.accessed)],
      ['created', day(h.createdAt)], ['color', h.color], ['tags', ['takenotes', 'highlight']],
    ]) + '\n';
  }
  out += `# ${snippetTitle(h.text)}\n\n`;
  out += `${h.text.trim().split(/\r?\n/).map((l) => `> ${l}`).join('\n')}\n\n`;
  out += `${sourceLine(h.source, lang)}\n\n`;
  if (noteTitle) out += `${t('fromNote')}: ${settings.obsidian.wikilinks ? `[[${wikiSafe(noteTitle)}]]` : noteTitle}\n\n`;
  if (h.note?.trim()) out += `${heading(2, t('shortNote'))}\n\n${h.note.trim()}\n\n`;
  if (h.body?.trim()) out += `${heading(2, t('longNote'))}\n\n${shiftHeadings(h.body.trim(), 2)}\n`;
  return out.trimEnd() + '\n';
}

/** First words of a highlight, for titles and file names. */
export function snippetTitle(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat || '…';
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : max)}…`;
}

/** File names `highlights/NNN - snippet.md`, oldest first. */
export function highlightFileNames(hls: readonly Highlight[]): string[] {
  const width = Math.max(3, String(hls.length).length);
  return hls.map((h, i) => `${String(i + 1).padStart(width, '0')} - ${slugifyFilename(snippetTitle(h.text, 50), 60)}.md`);
}

/** Kanban board as Markdown in the Obsidian Kanban plugin format (also readable as plain lists). */
export function boardToMarkdown(
  title: string, columns: readonly BoardColumn[], cardsByColumn: ReadonlyMap<string, readonly Clip[]>, settings: Settings,
): string {
  let out = `---\nkanban-plugin: basic\n---\n\n# ${title}\n\n`;
  for (const col of columns) {
    out += `## ${col.name}\n\n`;
    for (const c of cardsByColumn.get(col.id) ?? []) {
      const name = c.title.trim() || '…';
      out += `- [ ] ${settings.obsidian.wikilinks ? `[[${wikiSafe(name)}]]` : name}\n`;
    }
    out += '\n';
  }
  return out.trimEnd() + '\n';
}

export interface ProjectLayout {
  /** Clip id → path without extension, e.g. "Chapter 1/Ownership". */
  path: Map<string, string>;
  /** Root notes first, then each folder in order of first appearance. */
  groups: { folder: string; clips: Clip[] }[];
}

/** Where each note goes in a whole-project export (shared by the Markdown and PDF archives). */
export function projectLayout(sorted: readonly Clip[]): ProjectLayout {
  const names = clipFileNames(sorted);
  const usedDirs = new Set<string>(['highlights', 'images']);
  const dirOf = new Map<string, string>();
  const groups = new Map<string, { folder: string; clips: Clip[] }>([['', { folder: '', clips: [] }]]);
  const path = new Map<string, string>();
  sorted.forEach((c, i) => {
    const f = folderOf(c);
    const key = f.toLowerCase();
    if (f && !dirOf.has(key)) {
      dirOf.set(key, uniqueName(slugifyFilename(f, 60), usedDirs));
      groups.set(key, { folder: f, clips: [] });
    }
    groups.get(key)!.clips.push(c);
    const stem = names[i]!.replace(/\.md$/, '');
    path.set(c.id, f ? `${dirOf.get(key)}/${stem}` : stem);
  });
  return { path, groups: [...groups.values()].filter((g) => g.folder || g.clips.length) };
}

export interface ProjectFolderInput {
  highlights?: readonly Highlight[];
  board?: { columns: readonly BoardColumn[]; cards: ReadonlyMap<string, readonly Clip[]> };
}

/**
 * Whole project as a folder (Obsidian-friendly): index.md (contents + bibliography), one file per note inside its
 * project folder (Clip.section), `highlights/` with one file per highlight, board.md. Keys are relative paths.
 */
export function projectToFolderFiles(
  project: Project, clips: Clip[], settings: Settings, lang: Lang = uiLang(), input: ProjectFolderInput | readonly Highlight[] = {},
): Record<string, string> {
  const { highlights: hls = [], board } = Array.isArray(input) ? { highlights: input as readonly Highlight[], board: undefined } : (input as ProjectFolderInput);
  const t = exportT(lang);
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const files: Record<string, string> = {};
  const link = (path: string, label: string) => {
    const stem = path.replace(/\.md$/, '');
    return settings.obsidian.wikilinks ? `[[${stem}|${wikiSafe(label)}]]` : `[${label}](${encodeURI(path)})`;
  };

  const layout = projectLayout(sorted);

  let index = settings.obsidian.frontmatter ? frontmatter([['title', project.name], ['tags', ['takenotes']]]) + '\n' : '';
  index += `# ${project.name}\n\n`;
  if (project.description?.trim()) index += `${project.description.trim()}\n\n`;
  if (sorted.length) index += `${heading(2, t('contents'))}\n\n`;
  const write = (c: Clip) => {
    const path = `${layout.path.get(c.id)!}.md`;
    let md = clipToMarkdown(c, settings, lang, hls);
    // Images live in the top-level images/ folder.
    if (path.includes('/')) md = md.replace(/(\]\(|src=")images\//g, '$1../images/');
    files[path] = md;
    return path;
  };
  for (const g of layout.groups) {
    if (g.folder) index += `\n${heading(3, g.folder)}\n\n`;
    for (const c of g.clips) index += `- ${link(write(c), c.title)}\n`;
  }
  if (sorted.length) index += '\n';

  if (hls.length) {
    const hlNames = highlightFileNames(hls);
    const noteByUrl = new Map(sorted.filter((c) => c.source.url).map((c) => [normalizeUrl(c.source.url), c.title] as const));
    index += `${heading(2, t('highlights'))}\n\n`;
    hls.forEach((h, i) => {
      const path = `highlights/${hlNames[i]}`;
      files[path] = highlightFile(h, settings, lang, noteByUrl.get(h.url));
      index += `- ${link(path, snippetTitle(h.text))}\n`;
    });
    index += '\n';
  }
  if (board && sorted.length) {
    files['board.md'] = boardToMarkdown(`${t('board')}: ${project.name}`, board.columns, board.cards, settings);
    index += `${heading(2, t('board'))}\n\n- ${link('board.md', t('board'))}\n\n`;
  }
  index += bibliography(sorted.map((c) => c.source), project.citationStyle, lang);
  files['index.md'] = index.trimEnd() + '\n';
  return files;
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

