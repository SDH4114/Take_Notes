// Pure helpers for importing the user's own notes (Markdown folders / zips, Obsidian vaults, our own exports).
import type { SourceMeta } from '@/src/core/types';
import { codeSpans } from '@/src/highlight/apply';

export interface ImportFile { path: string; bytes: Uint8Array }

export interface ImportedNote {
  title: string;
  /** Folder inside the project (Clip.section); '' = top level. */
  section: string;
  markdown: string;
  tags: string[];
  source: SourceMeta;
}

const NOTE_EXT = /\.(md|markdown|txt)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
export const isNotePath = (p: string) => NOTE_EXT.test(p);
export const isPdfPath = (p: string) => /\.pdf$/i.test(p);
export const isImagePath = (p: string) => IMAGE_EXT.test(p);

/** Normalize a path: forward slashes, no leading "./" or "/", no empty segments. */
export function cleanPath(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.').join('/');
}

/** Drop the folder every path starts with (the vault / zip root), so it doesn't become a folder of every note. */
export function stripCommonRoot(paths: string[]): (p: string) => string {
  const firsts = new Set(paths.map((p) => (p.includes('/') ? p.split('/')[0] : '')));
  const root = firsts.size === 1 ? [...firsts][0]! : '';
  return root ? (p) => p.slice(root.length + 1) : (p) => p;
}

/** Hidden / app folders that are not notes: .obsidian, .trash, .git, __MACOSX, node_modules … */
export function isIgnoredPath(p: string): boolean {
  return p.split('/').some((s) => s.startsWith('.') || s === '__MACOSX' || s === 'node_modules');
}

// ---------- frontmatter

export type FmData = Record<string, string | string[]>;

const unquote = (v: string): string => {
  const s = v.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s) as string; } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};

/**
 * Minimal YAML frontmatter reader: `key: value`, `key: [a, b]` and `key:` + `  - item` lists.
 * Enough for Obsidian notes and our own exports; anything fancier is ignored, never thrown on.
 */
export function parseFrontmatter(text: string): { data: FmData; body: string } {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text.replace(/^﻿/, '') };
  const data: FmData = {};
  let listKey: string | null = null;
  for (const line of m[1]!.split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]!));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) { listKey = null; continue; }
    const key = kv[1]!.toLowerCase();
    const raw = kv[2]!.trim();
    if (!raw) { data[key] = []; listKey = key; continue; }
    listKey = null;
    if (raw.startsWith('[') && raw.endsWith(']')) data[key] = raw.slice(1, -1).split(',').map(unquote).filter(Boolean);
    else data[key] = unquote(raw);
  }
  return { data, body: text.slice(m[0].length) };
}

const asList = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : v.split(',').map((s) => s.trim())).filter(Boolean);
const asText = (v: string | string[] | undefined): string => (Array.isArray(v) ? v.join(', ') : (v ?? '')).trim();

/** "2024-05-01" → ISO string; anything unparsable → undefined. */
function isoDate(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// ---------- note

/** Our export's "Источник: [title](url) (дата обращения …)" line under the title. */
const SOURCE_LINE = /^(?:Источник|Source): \[([^\]]*)\]\(([^)\s]+)\)(?: \((?:дата обращения|accessed)[^)]*\))?\s*$/;

/** Inline #tags outside code (Obsidian style: letters, digits, _ - /; not pure numbers, not headings). */
export function inlineTags(md: string): string[] {
  const noCode = md.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '');
  const out = new Set<string>();
  for (const m of noCode.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]+)/gu)) {
    const tag = m[1]!.replace(/\/+$/, '');
    if (tag && !/^\d+$/.test(tag)) out.add(tag);
  }
  return [...out];
}

const fileStem = (path: string) => (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

/** Folder of a path relative to the import root: "a/b/note.md" → "a / b" (we keep one level of folders). */
export function sectionOf(path: string): string {
  const dirs = path.split('/').slice(0, -1);
  return dirs.join(' / ');
}

/** One Markdown file → note fields. `accessed` = import time (used when the file has no date). */
export function noteFromMarkdown(path: string, text: string, accessed: string): ImportedNote {
  const { data, body: raw } = parseFrontmatter(text.replace(/\r\n?/g, '\n'));
  let body = raw.replace(/^\s*\n/, '');
  const h1 = /^# +(.+?)(?: +#+)?\s*(?:\n|$)/.exec(body);
  const title = asText(data.title) || h1?.[1]?.trim() || fileStem(path) || 'Untitled';
  // The note shows its title separately: a leading "# Title" that repeats it is dropped, as on our export.
  if (h1 && h1[1]!.trim() === title) body = body.slice(h1[0].length).replace(/^\s*\n/, '');

  let url = asText(data.source) || asText(data.url);
  let sourceTitle = '';
  const first = body.split('\n', 1)[0] ?? '';
  const sl = SOURCE_LINE.exec(first);
  if (sl) {
    sourceTitle = sl[1]!;
    url ||= sl[2]!;
    body = body.slice(first.length).replace(/^\s*\n/, '');
  }
  if (!/^https?:\/\//i.test(url)) url = '';

  const fmTags = asList(data.tags ?? data.tag).map((t) => t.replace(/^#/, ''));
  const tags = [...new Set([...fmTags, ...inlineTags(body)])].filter((t) => t.toLowerCase() !== 'takenotes');
  const authors = asList(data.author ?? data.authors);

  return {
    title,
    section: sectionOf(path),
    markdown: body.trimEnd() + (body.trim() ? '\n' : ''),
    tags,
    source: {
      url,
      title: url ? (sourceTitle || title) : '',
      authors,
      ...(asText(data.site) ? { siteName: asText(data.site) } : {}),
      ...(isoDate(asText(data.published)) ? { published: isoDate(asText(data.published)) } : {}),
      accessed: isoDate(asText(data.accessed)) ?? accessed,
    },
  };
}

/** index.md written by our project export (frontmatter tag "takenotes"). Its presence marks the import as our export. */
export function isOurExportIndex(path: string, text: string): boolean {
  return path === 'index.md' && asList(parseFrontmatter(text).data.tags).includes('takenotes');
}

/** Files our project export writes besides the notes; when the import is our export they are not notes. */
export const isExportExtraPath = (path: string) => path === 'index.md' || path === 'board.md' || path.startsWith('highlights/');
export const isExportHighlightPath = (path: string) => path.startsWith('highlights/');
export const isExportBoardPath = (path: string) => path === 'board.md';

// ---------- highlights

/** One highlight file of our export (`highlights/NNN - snippet.md`, written by highlightFile()). */
export interface ImportedHighlight {
  text: string;
  /** Raw stored value ("#rrggbb" or a legacy name); goes through colorHex() before saving. */
  color?: string;
  note?: string;
  body?: string;
  source: SourceMeta;
  createdAt?: string;
  /** "Заметка: [[osnovy/vladenie]]" — export path or title of the note the highlight belongs to. */
  noteRef?: string;
}

const FROM_NOTE = /^(?:Заметка|Note): (.+)$/;
const SHORT_NOTE = /^## (?:Короткая заметка|Short note)\s*$/;
const LONG_NOTE = /^## (?:Заметка|Note)\s*$/;

/** `[[path|Title]]` / `[[Title]]` → { target, label }; plain text → label only. */
export function parseWikilink(raw: string): { target?: string; label: string } {
  const m = /^\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]$/.exec(raw.trim());
  if (!m) return { label: raw.trim() };
  return { target: m[1]!.trim(), label: (m[2] ?? m[1]!).trim() };
}

/** Undo the export's shiftHeadings(md, by): "### x" → "# x" for by=2; never below level 1; fenced code untouched. */
function unshiftHeadings(md: string, by: number): string {
  let fence: string | null = null;
  return md.split('\n').map((line) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
      return line;
    }
    if (fence) return line;
    const h = /^(#{1,6})(\s+.*)$/.exec(line);
    return h ? `${'#'.repeat(Math.max(1, h[1]!.length - by))}${h[2]}` : line;
  }).join('\n');
}

const QUOTES_HEADING = /^## (?:Выделения|Highlights)\s*$/;

/**
 * Body of a note file of our export → the note as it was in the Library: drops the trailing "## Выделения" section
 * that clipToMarkdown() appends (only when every quote in it is one of `known` highlight texts, so a user's own
 * section survives) and undoes the +1 heading shift.
 */
export function noteFromExportBody(md: string, known: (text: string) => boolean): string {
  const lines = md.split('\n');
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (QUOTES_HEADING.test(lines[i]!)) { start = i; break; }
  if (start >= 0) {
    const quotes: string[] = [];
    let cur: string[] | null = null;
    for (const line of lines.slice(start + 1)) {
      if (/^>/.test(line)) (cur ??= []).push(line.replace(/^> ?/, ''));
      else if (cur) { quotes.push(cur.join(' ')); cur = null; }
    }
    if (cur) quotes.push(cur.join(' '));
    if (quotes.length && quotes.every(known)) md = `${lines.slice(0, start).join('\n').trimEnd()}\n`;
  }
  return unshiftHeadings(md, 1);
}

/**
 * A highlight file of our export → highlight fields. Layout: optional frontmatter, `# snippet`, `> quote` lines,
 * optional source line, optional "Заметка/Note: [[…]]", `## Короткая заметка`/`## Short note`, `## Заметка`/`## Note`
 * (long note, headings shifted by 2). Returns null when there is no quote (not a highlight file).
 */
export function highlightFromMarkdown(text: string, accessed: string): ImportedHighlight | null {
  const { data, body } = parseFrontmatter(text.replace(/\r\n?/g, '\n'));
  const lines = body.split('\n');
  let i = 0;
  const skipBlank = () => { while (i < lines.length && !lines[i]!.trim()) i++; };
  skipBlank();
  if (/^# /.test(lines[i] ?? '')) { i++; skipBlank(); }
  const quote: string[] = [];
  for (; i < lines.length && /^>/.test(lines[i]!); i++) quote.push(lines[i]!.replace(/^> ?/, ''));
  const hlText = quote.join('\n').trim();
  if (!hlText) return null;

  let url = asText(data.source);
  let sourceTitle = '';
  let noteRef: string | undefined;
  let short: string[] | null = null;
  let long: string[] | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (long) { long.push(line); continue; }
    if (LONG_NOTE.test(line)) { long = []; continue; }
    if (SHORT_NOTE.test(line) && !short) { short = []; continue; }
    if (short) { short.push(line); continue; }
    const sl = SOURCE_LINE.exec(line);
    if (sl) { sourceTitle = sl[1]!; url ||= sl[2]!; continue; }
    const fn = FROM_NOTE.exec(line);
    if (fn) { const l = parseWikilink(fn[1]!); noteRef = l.target ?? l.label; }
  }
  if (!/^https?:\/\//i.test(url)) url = '';
  const note = short?.join('\n').trim();
  const longBody = long ? unshiftHeadings(long.join('\n'), 2).trim() : '';
  return {
    text: hlText,
    ...(asText(data.color) ? { color: asText(data.color) } : {}),
    ...(note ? { note } : {}),
    ...(longBody ? { body: longBody } : {}),
    source: {
      url,
      title: url ? sourceTitle : '',
      authors: [],
      ...(asText(data.site) ? { siteName: asText(data.site) } : {}),
      accessed: isoDate(asText(data.accessed)) ?? accessed,
    },
    ...(isoDate(asText(data.created)) ? { createdAt: isoDate(asText(data.created)) } : {}),
    ...(noteRef ? { noteRef } : {}),
  };
}

/** Text of a ==mark== without inline Markdown: links → label, emphasis/code markers dropped, spaces collapsed. */
export function markPlainText(md: string): string {
  return md
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|[^\p{L}\p{N}])[*_](?=\S)|(?<=\S)[*_](?=$|[^\p{L}\p{N}])/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Obsidian highlights `==text==` (outside code and data URLs, inside one paragraph). Marks for which `take(text)`
 * is true are unwrapped (the highlight record shows them from now on) and their plain texts returned.
 */
export function extractMarks(md: string, take: (text: string) => boolean = () => true): { markdown: string; marks: string[] } {
  const skip = codeSpans(md);
  for (const m of md.matchAll(/data:[^\s)>]+/g)) skip.push([m.index!, m.index! + m[0].length]);
  // "==" outside code / data URLs; a rejected pair ("a == b") hands its closing "==" on as the next opener.
  const at = [...md.matchAll(/==/g)].map((m) => m.index!).filter((i) => !skip.some(([a, b]) => i < b && i + 2 > a));
  const marks: string[] = [];
  const cuts: number[] = [];
  for (let k = 0; k + 1 < at.length;) {
    const inner = md.slice(at[k]! + 2, at[k + 1]);
    const text = inner && inner.trim() === inner && !/\n\s*\n/.test(inner) ? markPlainText(inner) : '';
    if (!text) { k++; continue; }
    if (take(text)) { marks.push(text); cuts.push(at[k]!, at[k + 1]!); }
    k += 2;
  }
  let markdown = md;
  for (const i of cuts.reverse()) markdown = markdown.slice(0, i) + markdown.slice(i + 2);
  return { markdown, marks };
}

// ---------- board

export interface ImportedBoardCard { target?: string; title: string }
export interface ImportedBoard { columns: { name: string; cards: ImportedBoardCard[] }[] }

/**
 * board.md of our export (Obsidian Kanban format, written by boardToMarkdown): `## Column` headings with
 * `- [ ] [[path|Title]]` / `- [ ] Title` cards. Obsidian's trailing `%% kanban:settings` block and archive are ignored.
 */
export function boardFromMarkdown(text: string): ImportedBoard | null {
  const { body } = parseFrontmatter(text.replace(/\r\n?/g, '\n'));
  const columns: ImportedBoard['columns'] = [];
  for (const line of body.split('\n')) {
    if (/^(%%|\*\*\*)/.test(line.trim())) break;
    const h = /^## +(.+?)\s*$/.exec(line);
    if (h) { columns.push({ name: h[1]!, cards: [] }); continue; }
    const item = /^[-*] +(?:\[[ xX]\] +)?(.+?)\s*$/.exec(line);
    if (item && columns.length) {
      const l = parseWikilink(item[1]!);
      if (l.label) columns.at(-1)!.cards.push({ ...(l.target ? { target: l.target } : {}), title: l.label });
    }
  }
  return columns.length ? { columns } : null;
}

// ---------- images

/** Image references in a note: ![alt](rel/path.png "t") and Obsidian ![[file.png|300]]. */
const MD_IMAGE = /!\[([^\]]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;
const WIKI_IMAGE = /!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g;

/** Resolve "../images/a.png" relative to the note at "dir/note.md" → "images/a.png" (import-root relative). */
export function resolveRelative(notePath: string, ref: string): string {
  let target = ref;
  try { target = decodeURIComponent(ref); } catch { /* keep as is */ }
  const parts = notePath.split('/').slice(0, -1);
  for (const seg of target.replace(/\\/g, '/').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export interface ImageLookup {
  /** Exact import-root-relative path. */
  byPath: Map<string, string>;
  /** Lower-cased file name → path (Obsidian ![[name]] resolves by name anywhere in the vault). */
  byName: Map<string, string>;
}

export function imageLookup(paths: string[]): ImageLookup {
  const byPath = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const p of paths.filter(isImagePath)) {
    byPath.set(p, p);
    const name = (p.split('/').pop() ?? p).toLowerCase();
    if (!byName.has(name)) byName.set(name, p);
  }
  return { byPath, byName };
}

const isRemote = (u: string) => /^[a-z][a-z0-9+.-]*:/i.test(u);

/**
 * Rewrite local image references to reference-style images whose definitions sit at the end of the note:
 * `![alt][img-1]` … `[img-1]: <data:image/png;base64,…>`. Keeps the editor readable (the long data URLs are at
 * the bottom) while preview, PDF and exports work without any extra storage. `dataUrl(path)` returns null for
 * files that are missing or too big; those references are left untouched.
 */
export function embedImages(notePath: string, md: string, lookup: ImageLookup, dataUrl: (path: string) => string | null): string {
  const defs: string[] = [];
  const idByPath = new Map<string, string>();
  const ref = (path: string | undefined): string | null => {
    if (!path) return null;
    const known = idByPath.get(path);
    if (known) return known;
    const url = dataUrl(path);
    if (!url) return null;
    const id = `img-${idByPath.size + 1}`;
    idByPath.set(path, id);
    defs.push(`[${id}]: <${url}>`);
    return id;
  };
  const find = (target: string) => lookup.byPath.get(resolveRelative(notePath, target))
    ?? lookup.byName.get((target.split('/').pop() ?? target).toLowerCase());

  let out = md.replace(MD_IMAGE, (all, alt: string, url: string) => {
    if (isRemote(url)) return all;
    const id = ref(find(url));
    return id ? `![${alt}][${id}]` : all;
  });
  out = out.replace(WIKI_IMAGE, (all, name: string) => {
    if (!isImagePath(name.trim())) return all;
    const id = ref(find(name.trim()));
    return id ? `![${fileStem(name.trim())}][${id}]` : all;
  });
  return defs.length ? `${out.trimEnd()}\n\n${defs.join('\n')}\n` : out;
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
};
export const imageMime = (path: string) => MIME[(path.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Text of a file: UTF-8 (BOM stripped); invalid bytes become U+FFFD rather than failing the import. */
export const decodeText = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
