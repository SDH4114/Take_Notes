// Background part of the export module. Owner: agent E.
import { uiLang } from '@/src/core/i18n';
import type { BackgroundMessages, Handlers } from '@/src/core/messages';
import { books, clips, highlights, projects, settings } from '@/src/core/storage';
import { highlightsForClip } from '@/src/highlight/apply';
import { projectHighlights } from './document';
import { buildBoardArtifact, buildBookArtifact, buildClipArtifact, buildHighlightsArtifact, buildProjectArtifact, type Artifact } from './build';
import { highlightsRef, loadBoard, loadHighlights, projectKey, projectName } from './data';
import { downloadBlob, exportFilename } from './download';
import { exportPdf } from './pdf';
import { exportT } from './strings';

const save = (a: Artifact) => downloadBlob(a.blob, a.filename);

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupExportBackground(): Handlers<BackgroundMessages> {
  return {
    'export/clip': async ({ id, format }) => {
      const clip = await clips.get(id);
      if (!clip) throw new Error(exportT()('errNoClip'));
      if (format === 'pdf') return exportPdf('clip', id, exportFilename(clip.title, 'pdf'));
      await save(await buildClipArtifact(clip, format, await settings.get(), { highlights: highlightsForClip(clip, await highlights.listAll()) }));
    },

    'export/project': async ({ projectId, format }) => {
      const project = projectId === null ? null : (await projects.get(projectId)) ?? null;
      if (projectId !== null && !project) throw new Error(exportT()('errNoProject'));
      if (format === 'pdf') {
        const name = project?.name ?? exportT()('inbox');
        return exportPdf('project', projectKey(projectId), exportFilename(name, 'pdf'));
      }
      const list = await clips.listByProject(projectId);
      const hls = projectHighlights(list, await highlights.listAll(), projectId);
      // pdf-zip is built in the extension page (src/export/pdfzip.ts): pdfmake is too big for the event page.
      if (format === 'pdf-zip') throw new Error('pdf-zip is exported from extension pages');
      await save(await buildProjectArtifact(project, list, format, await settings.get(), { highlights: hls, board: await loadBoard(projectId, list) }));
    },

    'export/board': async ({ projectId, format }) => {
      const board = await loadBoard(projectId);
      if (![...board.cards.values()].some((l) => l.length)) throw new Error(exportT()('errNoBoard'));
      const title = `${exportT()('board')}: ${await projectName(projectId)}`;
      if (format === 'pdf') return exportPdf('board', projectKey(projectId), exportFilename(title, 'pdf'));
      await save(buildBoardArtifact(title, board, await settings.get()));
    },

    'export/book': async ({ id, format }) => {
      const book = await books.get(id);
      if (!book) throw new Error(exportT()('errNoBook'));
      if (format === 'pdf') return exportPdf('book', id, exportFilename(book.title, 'pdf'));
      await save(await buildBookArtifact(book, format, await settings.get()));
    },

    'export/highlights': async ({ url, projectId, format }) => {
      const ref = highlightsRef({ url, projectId });
      const { items, name } = await loadHighlights(ref, uiLang());
      if (!items.length) throw new Error(exportT()('errNoHighlights'));
      if (format === 'pdf') return exportPdf('highlights', ref, exportFilename(name, 'pdf'));
      await save(await buildHighlightsArtifact(items, name, format, await settings.get()));
    },
  };
}
