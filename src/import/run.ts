// Import the user's own notes into the Library. Runs in the Library page (DOM, File API, no message size limits),
// writes through storage.ts like other extension pages, then broadcasts data/changed.
import { unzipSync } from 'fflate';
import { broadcast, send } from '@/src/core/messages';
import { colorHex } from '@/src/core/colors';
import { assets, boards, clips, folders, highlights, settings } from '@/src/core/storage';
import type { Asset, Clip, Highlight, SourceMeta } from '@/src/core/types';
import { clipHighlightUrl, newId, normalizeUrl, nowIso, slugifyFilename } from '@/src/core/util';
import { defaultColumns, importColumns } from '@/src/library/board';
import { folderList } from '@/src/library/folders';
import { lt } from '@/src/library/strings';
import { renderMarkdown } from '@/src/ui/markdown';
import {
  boardFromMarkdown, bytesToBase64, cleanPath, decodeText, embedImages, extractMarks, highlightFromMarkdown, imageLookup,
  imageMime, isExportBoardPath, isExportExtraPath, isExportHighlightPath, isIgnoredPath, isImagePath, isNotePath,
  isOurExportIndex, isPdfPath, markPlainText, noteFromExportBody, noteFromMarkdown, stripCommonRoot, type ImportedBoard, type ImportedHighlight,
  type ImportFile, type ImportedNote,
} from './parse';
import { it } from './strings';

/** Images above this are left as links (data URLs live inside the note text). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Hard limits so a wrong pick (a whole disk) can't freeze the tab. */
const MAX_FILES = 5000;
const MAX_ZIP_BYTES = 500 * 1024 * 1024;
/** Unpacked total of the wanted entries in one zip (checked from the headers before inflating: zip bombs). */
const MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024;

export type ImportTarget = { projectId: string | null } | { newProject: string };

export interface ImportResult {
  projectId: string | null; notes: number; highlights: number; board: boolean; pdfScans: number;
  failed: { path: string; message: string }[];
}

export type ImportProgress = (done: number, total: number, current: string) => void;

const isZip = (name: string) => /\.zip$/i.test(name);

/** Picked files (folder picker, file picker or zips) → flat list of import-root-relative files. */
export async function collectFiles(picked: File[]): Promise<ImportFile[]> {
  const out: ImportFile[] = [];
  for (const f of picked) {
    const rel = cleanPath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    if (isZip(f.name)) {
      if (f.size > MAX_ZIP_BYTES) throw new Error(it('tooBig', { name: f.name }));
      let unpacked = 0;
      let count = out.length;
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), {
        filter: (e) => {
          if (e.name.endsWith('/') || isIgnoredPath(cleanPath(e.name)) || !wanted(e.name)) return false;
          unpacked += e.originalSize;
          if (unpacked > MAX_UNZIPPED_BYTES) throw new Error(it('tooBig', { name: f.name }));
          if (++count > MAX_FILES) throw new Error(it('tooMany', { n: MAX_FILES }));
          return true;
        },
      });
      // Several zips picked at once: keep each one's files under its own name so the roots don't mix.
      const prefix = picked.length > 1 ? `${f.name.replace(/\.zip$/i, '')}/` : '';
      for (const [name, bytes] of Object.entries(entries)) out.push({ path: cleanPath(prefix + name), bytes });
    } else if (wanted(rel) && !isIgnoredPath(rel)) {
      out.push({ path: rel, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
    if (out.length > MAX_FILES) throw new Error(it('tooMany', { n: MAX_FILES }));
  }
  return out;
}

const wanted = (p: string) => isNotePath(p) || isPdfPath(p) || isImagePath(p);

/** Name for a new project made from a folder or zip pick: the folder / zip name. */
export function suggestedProjectName(picked: File[]): string {
  const first = picked[0];
  if (!first) return '';
  const rel = (first as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel?.includes('/')) return rel.split('/')[0]!;
  return first.name.replace(/\.[^.]+$/, '');
}

const byPath = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** PDF file name is usually the best title ("Лекция 3"); scanner names ("scan0001", "IMG_2041") are not. */
function pdfTitle(path: string, meta: string | undefined, heading: string | undefined): string {
  const stem = (path.split('/').pop() ?? path).replace(/\.pdf$/i, '').trim();
  const machine = !/\p{L}{3,}/u.test(stem.replace(/^(scan|img|image|doc|document|file|скан)[\s_-]*/i, '')) ;
  if (!machine) return stem;
  const junk = (s: string | undefined) => !s || /\.(docx?|pdf|odt|pptx?)$/i.test(s) || /^microsoft\s/i.test(s);
  return (!junk(meta) && meta) || heading?.slice(0, 120) || stem || 'PDF';
}

async function importPdf(file: ImportFile, accessed: string): Promise<{ note: ImportedNote; asset: Asset; scan: boolean }> {
  const { extractPdf, SCAN_CHARS_PER_PAGE } = await import('./pdf');
  const name = file.path.split('/').pop() ?? 'file.pdf';
  const asset: Asset = {
    id: newId(),
    // Not a web URL: the original is only reachable through clip.assetIds (Library "Original PDF" button).
    url: `takenotes-import:${newId()}/${encodeURIComponent(name)}`,
    mime: 'application/pdf',
    filename: `files/${slugifyFilename(name.replace(/\.pdf$/i, ''), 80)}.pdf`,
    data: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
  };
  const pdf = await extractPdf(file.bytes);
  const scan = pdf.chars < Math.max(1, pdf.pages) * SCAN_CHARS_PER_PAGE;
  const title = pdfTitle(file.path, pdf.title, pdf.heading);
  const parts = file.path.split('/').slice(0, -1);
  return {
    asset,
    scan,
    note: {
      title,
      section: parts.join(' / '),
      markdown: scan ? `> [!note]\n> ${it('scanNotice')}\n` : pdf.markdown,
      tags: ['pdf'],
      source: { url: '', title: '', authors: pdf.author ? [pdf.author] : [], accessed },
    },
  };
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
/** ISO time `ms` milliseconds after `iso`: keeps imported highlights in file order when they share a date. */
const plusMs = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

interface PendingNote { path: string; note: ImportedNote; id: string }

/** Notes of this import by export path (no extension), title and page URL; used to attach highlights and cards. */
function noteIndex(list: readonly PendingNote[]) {
  const byPath = new Map<string, PendingNote>();
  const byTitle = new Map<string, PendingNote>();
  const byUrl = new Map<string, PendingNote>();
  for (const n of list) {
    byPath.set(flat(n.path.replace(/\.[^./]+$/, '')), n);
    if (!byTitle.has(flat(n.note.title))) byTitle.set(flat(n.note.title), n);
    if (n.note.source.url && !byUrl.has(normalizeUrl(n.note.source.url))) byUrl.set(normalizeUrl(n.note.source.url), n);
  }
  const find = (ref: string | undefined) => (ref ? byPath.get(flat(ref)) ?? byTitle.get(flat(ref)) : undefined);
  return { find, byUrl };
}

const clipKey = (n: PendingNote) => clipHighlightUrl({ id: n.id, source: n.note.source });

/** Source of a highlight made inside an imported note: the note's page, or (own note) the note title for lists. */
const noteSource = (n: PendingNote): SourceMeta => (n.note.source.url ? n.note.source : { ...n.note.source, title: n.note.title });

/** Import files into a project (existing or new). Notes keep their folder (one level) and order by path. */
export async function importFiles(input: ImportFile[], target: ImportTarget, onProgress?: ImportProgress): Promise<ImportResult> {
  const files = input.map((f) => ({ ...f, path: cleanPath(f.path) })).filter((f) => f.path && !isIgnoredPath(f.path));
  const rootless = stripCommonRoot(files.map((f) => f.path));
  for (const f of files) f.path = rootless(f.path);

  const notes = files.filter((f) => isNotePath(f.path)).sort((a, b) => byPath(a.path, b.path));
  const pdfs = files.filter((f) => isPdfPath(f.path)).sort((a, b) => byPath(a.path, b.path));
  if (!notes.length && !pdfs.length) throw new Error(it('nothing'));

  const ourExport = notes.some((f) => isOurExportIndex(f.path, decodeText(f.bytes)));
  const images = new Map(files.filter((f) => isImagePath(f.path)).map((f) => [f.path, f.bytes] as const));
  const lookup = imageLookup([...images.keys()]);
  const dataUrls = new Map<string, string | null>();
  const dataUrl = (path: string): string | null => {
    if (!dataUrls.has(path)) {
      const bytes = images.get(path);
      dataUrls.set(path, bytes && bytes.byteLength <= MAX_IMAGE_BYTES ? `data:${imageMime(path)};base64,${bytesToBase64(bytes)}` : null);
    }
    return dataUrls.get(path)!;
  };

  const projectId = 'newProject' in target ? (await send('project/create', { name: target.newProject })).id : target.projectId;
  const accessed = nowIso();
  const result: ImportResult = { projectId, notes: 0, highlights: 0, board: false, pdfScans: 0, failed: [] };
  const sections: string[] = [];
  let order = await clips.nextOrder(projectId);
  const emptyProject = order === 0;
  const total = notes.length + pdfs.length;
  let done = 0;
  const fail = (path: string, e: unknown) => result.failed.push({ path, message: e instanceof Error ? e.message : String(e) });

  const save = async (n: ImportedNote, assetIds: string[] = [], id = newId(), status?: string) => {
    const now = nowIso();
    const clip: Clip = {
      id, projectId, kind: 'selection', title: n.title, html: renderMarkdown(n.markdown), markdown: n.markdown,
      source: n.source, tags: n.tags, order: order++, assetIds, createdAt: now, updatedAt: now,
      ...(n.section ? { section: n.section } : {}), ...(status ? { status } : {}),
    };
    await clips.put(clip);
    if (n.section && !sections.includes(n.section)) sections.push(n.section);
    result.notes++;
  };

  // 1. Parse. Our export's highlights/ and board.md are not notes (index.md is dropped: it is only a table of contents).
  const pending: PendingNote[] = [];
  const hlFiles: ImportedHighlight[] = [];
  let board: ImportedBoard | null = null;
  for (const f of notes) {
    onProgress?.(done++, total, f.path);
    try {
      const text = decodeText(f.bytes);
      if (ourExport && isExportHighlightPath(f.path)) {
        const h = highlightFromMarkdown(text, accessed);
        if (h) { hlFiles.push(h); continue; }
      } else if (ourExport && isExportBoardPath(f.path)) {
        board = boardFromMarkdown(text);
        if (board) continue;
      } else if (ourExport && isExportExtraPath(f.path)) {
        continue;
      }
      pending.push({ path: f.path, note: noteFromMarkdown(f.path, text, accessed), id: newId() });
    } catch (e) {
      fail(f.path, e);
    }
  }
  const index = noteIndex(pending);

  // 2. Highlights. Each one joins its note through Highlight.url (= clipHighlightUrl of the note, see core/util).
  const settingsNow = await settings.get();
  const newHls: Highlight[] = [];
  const addHl = (text: string, url: string, source: SourceMeta, extra: Partial<Highlight>, createdAt: string) => {
    newHls.push({
      id: newId(), url, color: colorHex(extra.color ?? settingsNow.highlightColor), anchor: { exact: text, prefix: '', suffix: '' },
      text, source, projectId, createdAt, updatedAt: accessed,
      ...(extra.note ? { note: extra.note } : {}), ...(extra.body ? { body: extra.body } : {}),
    });
  };
  const plainOf = new Map(pending.map((n) => [n.id, flat(markPlainText(n.note.markdown.replace(/==/g, '')))] as const));
  const hlTexts = new Map<string, Set<string>>(); // note id → texts of its highlights (their ==marks== are unwrapped)
  hlFiles.forEach((h, i) => {
    const url = h.source.url ? normalizeUrl(h.source.url) : '';
    // The note: "Заметка: [[…]]" link, else the clip of the same page, else (url-less) the note quoting the text.
    const n = index.find(h.noteRef) ?? (url ? index.byUrl.get(url) : pending.find((p) => plainOf.get(p.id)!.includes(flat(h.text))));
    const source = h.source.url || !n ? h.source : noteSource(n);
    addHl(h.text, n ? clipKey(n) : url, source, h, plusMs(h.createdAt ?? accessed, i));
    if (n) hlTexts.set(n.id, (hlTexts.get(n.id) ?? new Set()).add(flat(h.text)));
  });
  for (const n of pending) {
    // Our export writes ==…== for highlights that also have a file: unwrap only those. Elsewhere every mark is one.
    const mine = hlTexts.get(n.id);
    if (ourExport) n.note.markdown = noteFromExportBody(n.note.markdown, (t) => !!mine?.has(flat(t)));
    const { markdown, marks } = ourExport
      ? extractMarks(n.note.markdown, (t) => !!mine?.has(flat(t)))
      : extractMarks(n.note.markdown);
    n.note.markdown = markdown;
    if (ourExport) continue;
    const seen = new Set<string>();
    for (const text of marks) {
      if (seen.has(flat(text))) continue;
      seen.add(flat(text));
      addHl(text, clipKey(n), noteSource(n), {}, plusMs(accessed, newHls.length));
    }
  }

  // 3. Board: imported columns onto the project's board; each card's note gets its column as status.
  const statusOf = new Map<string, string>();
  if (board) {
    const stored = await boards.get(projectId);
    const fresh = !stored && emptyProject;
    const base = stored ?? defaultColumns({ todo: lt('colTodo'), doing: lt('colDoing'), done: lt('colDone') });
    const { columns, ids } = importColumns(base, board.columns.map((c) => c.name), newId, fresh);
    board.columns.forEach((col, i) => {
      for (const card of col.cards) {
        const n = index.find(card.target) ?? index.find(card.title);
        if (n && !statusOf.has(n.id)) statusOf.set(n.id, ids[i]!);
      }
    });
    await boards.set(projectId, columns);
    result.board = true;
  }

  // 4. Save.
  for (const n of pending) {
    try {
      n.note.markdown = embedImages(n.path, n.note.markdown, lookup, dataUrl);
      await save(n.note, [], n.id, statusOf.get(n.id));
    } catch (e) {
      fail(n.path, e);
    }
  }
  for (const h of newHls) {
    try {
      await highlights.put(h);
      result.highlights++;
    } catch (e) {
      fail(h.text.slice(0, 40), e);
    }
  }
  for (const f of pdfs) {
    onProgress?.(done++, total, f.path);
    try {
      const { note, asset, scan } = await importPdf(f, accessed);
      await assets.put(asset);
      await save(note, [asset.id]);
      if (scan) result.pdfScans++;
    } catch (e) {
      fail(f.path, e);
    }
  }
  onProgress?.(total, total, '');

  if (sections.length) {
    const stored = await folders.get(projectId);
    await folders.set(projectId, folderList([...stored, ...sections], []));
  }
  broadcast('data/changed', { kind: 'clip' });
  if (result.highlights) broadcast('data/changed', { kind: 'highlight' });
  return result;
}
