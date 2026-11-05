// Background part of the export module. Owner: agent E.
import { uiLang } from '@/src/core/i18n';
import type { BackgroundMessages, Handlers } from '@/src/core/messages';
import { books, clips, projects, settings } from '@/src/core/storage';
import { buildBookArtifact, buildClipArtifact, buildHighlightsArtifact, buildProjectArtifact, type Artifact } from './build';
import { highlightsRef, loadHighlights, projectKey } from './data';
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
      await save(await buildClipArtifact(clip, format, await settings.get()));
    },

    'export/project': async ({ projectId, format }) => {
      const project = projectId === null ? null : (await projects.get(projectId)) ?? null;
      if (projectId !== null && !project) throw new Error(exportT()('errNoProject'));
      if (format === 'pdf') {
        const name = project?.name ?? exportT()('inbox');
        return exportPdf('project', projectKey(projectId), exportFilename(name, 'pdf'));
      }
      await save(await buildProjectArtifact(project, await clips.listByProject(projectId), format, await settings.get()));
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
