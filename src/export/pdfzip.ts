// Whole-project PDF archive, built in an extension page (Library / sidebar), never in the background:
// the background is one bundle and pdfmake (+ fonts, ~1.7 MB) would load on every wake-up. Here it is a lazy chunk.
import { uiLang } from '@/src/core/i18n';
import { clips as clipStore, highlights as hlStore, projects, settings as settingsStore } from '@/src/core/storage';
import type { Clip, Project, Settings } from '@/src/core/types';
import { normalizeUrl, slugifyFilename } from '@/src/core/util';
import type { Artifact, BuildIO } from './build';
import { loadBoard } from './data';
import { highlightFileNames, inboxName, projectHighlights, projectLayout, snippetTitle } from './document';
import { downloadBlob, exportFilename } from './download';
import { boardPrintDoc, clipPrintDoc, highlightPrintDoc, projectIndexPrintDoc, type PrintDoc } from './printdoc';
import { exportT } from './strings';
import { createZip } from './zip';

/**
 * Whole project as a zip of PDFs (generated with pdfmake): one PDF per note inside its folder, highlights/ with one
 * PDF per highlight, board.pdf, index.pdf. Same layout as the Markdown archive.
 */
export async function buildProjectPdfZip(
  project: Project | null, clips: Clip[], settings: Settings, io: BuildIO & { onProgress?: (done: number, total: number) => void } = {},
): Promise<Artifact> {
  const lang = io.lang ?? uiLang();
  const t = exportT(lang);
  const proj: Project = project ?? { id: '__inbox__', name: inboxName(lang), citationStyle: settings.citationStyle, createdAt: '', updatedAt: '' };
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const hls = io.highlights ?? [];
  const layout = projectLayout(sorted);
  const folder = slugifyFilename(proj.name);
  const jobs: { path: string; doc: () => PrintDoc }[] = [];
  for (const c of sorted) jobs.push({ path: `${layout.path.get(c.id)!}.pdf`, doc: () => clipPrintDoc(c, lang, hls) });
  const noteByUrl = new Map(sorted.filter((c) => c.source.url).map((c) => [normalizeUrl(c.source.url), c.title] as const));
  highlightFileNames(hls).forEach((name, i) => {
    const h = hls[i]!;
    jobs.push({ path: `highlights/${name.replace(/\.md$/, '.pdf')}`, doc: () => highlightPrintDoc(h, snippetTitle(h.text), lang, noteByUrl.get(h.url)) });
  });
  if (io.board && sorted.length) jobs.push({ path: 'board.pdf', doc: () => boardPrintDoc(`${t('board')}: ${proj.name}`, io.board!, lang) });
  const extras = [...(hls.length ? ['highlights/'] : []), ...(io.board && sorted.length ? ['board.pdf'] : [])];
  jobs.unshift({
    path: 'index.pdf',
    doc: () => projectIndexPrintDoc(proj, layout.groups.map((g) => ({ folder: g.folder, files: g.clips.map((c) => `${layout.path.get(c.id)!.split('/').pop()}.pdf`) })),
      extras, sorted.map((c) => c.source), lang),
  });

  const { printDocToPdf } = await import('./pdfgen');
  const entries: Record<string, Uint8Array> = {};
  let done = 0;
  for (const job of jobs) {
    // One at a time: each PDF holds its images in memory.
    entries[`${folder}/${job.path}`] = new Uint8Array(await (await printDocToPdf(job.doc(), io.fetchFn)).arrayBuffer());
    io.onProgress?.(++done, jobs.length);
  }
  return { filename: exportFilename(proj.name, 'zip'), blob: createZip(entries) };
}

/** Load the project from storage, build the archive and download it. */
export async function exportProjectPdfZip(projectId: string | null, onProgress?: (done: number, total: number) => void): Promise<void> {
  const t = exportT();
  const project = projectId === null ? null : (await projects.get(projectId)) ?? null;
  if (projectId !== null && !project) throw new Error(t('errNoProject'));
  const list = await clipStore.listByProject(projectId);
  if (!list.length) throw new Error(t('errEmptyProject'));
  const hls = projectHighlights(list, await hlStore.listAll(), projectId);
  const a = await buildProjectPdfZip(project, list, await settingsStore.get(), { highlights: hls, board: await loadBoard(projectId, list), onProgress });
  await downloadBlob(a.blob, a.filename);
}
