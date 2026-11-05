// Turns stored data + a format into a downloadable file. Pure of browser APIs except the injected fetch.
import { uiLang, type Lang } from '@/src/core/i18n';
import type { Book, Clip, ExportFormat, Highlight, Project, Settings } from '@/src/core/types';
import { highlightsToAnkiTsv } from '@/src/highlight/anki';
import {
  bookToFolderFiles, bookToMarkdownExport, clipToMarkdown, inboxName, projectToMarkdown,
} from './document';
import { exportFilename, markdownBlob, textBlob } from './download';
import { localizeImages } from './images';
import { exportT, type ExportKey } from './strings';
import { slugifyFilename } from '@/src/core/util';
import { createZip } from './zip';
import { highlightsToMarkdown } from '@/src/highlight/markdown';

export interface Artifact {
  filename: string;
  blob: Blob;
}

export interface BuildIO {
  fetchFn?: typeof fetch;
  lang?: Lang;
}

type Subject = 'whatClip' | 'whatProject' | 'whatBook' | 'whatHighlights';

function unsupported(format: ExportFormat, what: Subject, lang: Lang): Error {
  const t = exportT(lang);
  return new Error(t('errUnsupported', { format, what: t(what as ExportKey) }));
}

/** Download images (when enabled) for the given markdown documents. */
function images(docs: string[], settings: Settings, io: BuildIO) {
  return localizeImages(docs, { fetchFn: io.fetchFn, enabled: settings.downloadImages });
}

export async function buildClipArtifact(clip: Clip, format: ExportFormat, settings: Settings, io: BuildIO = {}): Promise<Artifact> {
  const lang = io.lang ?? uiLang();
  const base = clip.title;
  if (format === 'md') {
    return { filename: exportFilename(base, 'md'), blob: markdownBlob(clipToMarkdown(clip, settings, lang)) };
  }
  if (format === 'md-zip') {
    const loc = await images([clip.markdown], settings, io);
    const md = clipToMarkdown({ ...clip, markdown: loc.markdown[0] ?? clip.markdown }, settings, lang);
    const mdName = exportFilename(base, 'md');
    return { filename: exportFilename(base, 'zip'), blob: createZip({ [mdName]: md, ...loc.files }) };
  }
  throw unsupported(format, 'whatClip', lang);
}

export async function buildProjectArtifact(
  project: Project | null, clips: Clip[], format: ExportFormat, settings: Settings, io: BuildIO = {},
): Promise<Artifact> {
  const lang = io.lang ?? uiLang();
  const proj: Project = project ?? {
    id: '__inbox__', name: inboxName(lang), citationStyle: settings.citationStyle, createdAt: '', updatedAt: '',
  };
  if (format === 'md') {
    return { filename: exportFilename(proj.name, 'md'), blob: markdownBlob(projectToMarkdown(proj, clips, settings, lang)) };
  }
  if (format === 'md-zip') {
    const loc = await images(clips.map((c) => c.markdown), settings, io);
    const localized = clips.map((c, i) => ({ ...c, markdown: loc.markdown[i] ?? c.markdown }));
    const md = projectToMarkdown(proj, localized, settings, lang);
    return { filename: exportFilename(proj.name, 'zip'), blob: createZip({ [exportFilename(proj.name, 'md')]: md, ...loc.files }) };
  }
  throw unsupported(format, 'whatProject', lang);
}

export async function buildBookArtifact(book: Book, format: ExportFormat, settings: Settings, io: BuildIO = {}): Promise<Artifact> {
  const lang = io.lang ?? uiLang();
  if (format === 'md') {
    return { filename: exportFilename(book.title, 'md'), blob: markdownBlob(bookToMarkdownExport(book, settings, lang)) };
  }
  if (format === 'md-zip' || format === 'md-folder-zip') {
    const loc = await images(book.chapters.map((c) => c.markdown), settings, io);
    const localized: Book = { ...book, chapters: book.chapters.map((c, i) => ({ ...c, markdown: loc.markdown[i] ?? c.markdown })) };
    if (format === 'md-zip') {
      const md = bookToMarkdownExport(localized, settings, lang);
      return { filename: exportFilename(book.title, 'zip'), blob: createZip({ [exportFilename(book.title, 'md')]: md, ...loc.files }) };
    }
    const folder = slugifyFilename(book.title);
    const entries: Record<string, string | Uint8Array> = {};
    for (const [path, text] of Object.entries(bookToFolderFiles(localized, settings, lang))) entries[`${folder}/${path}`] = text;
    for (const [path, data] of Object.entries(loc.files)) entries[`${folder}/${path}`] = data;
    return { filename: exportFilename(book.title, 'zip'), blob: createZip(entries) };
  }
  throw unsupported(format, 'whatBook', lang);
}

export async function buildHighlightsArtifact(
  items: Highlight[], name: string, format: ExportFormat, settings: Settings, io: BuildIO = {},
): Promise<Artifact> {
  void settings;
  const lang = io.lang ?? uiLang();
  if (format !== 'md' && format !== 'anki-tsv') throw unsupported(format, 'whatHighlights', lang);
  if (!items.length) throw new Error(exportT(lang)('errNoHighlights'));
  if (format === 'md') return { filename: exportFilename(name, 'md'), blob: markdownBlob(highlightsToMarkdown(items)) };
  return { filename: exportFilename(name, 'tsv'), blob: textBlob(highlightsToAnkiTsv(items)) };
}
