// Loading export subjects from storage (used by the print page and the background handlers).
import { uiLang, type Lang } from '@/src/core/i18n';
import { INBOX_KEY, books, clips, highlights, projects, settings } from '@/src/core/storage';
import type { Highlight, Project } from '@/src/core/types';
import { normalizeUrl } from '@/src/core/util';
import { bookPrintDoc, clipPrintDoc, highlightsPrintDoc, projectPrintDoc, type PrintDoc } from './printdoc';
import { exportT } from './strings';

export type PrintKind = 'clip' | 'project' | 'book' | 'highlights';

/** Extension-page path of the print page for a subject (resolve with browser.runtime.getURL). */
export const printPath = (kind: PrintKind, id: string): string =>
  `/print.html?kind=${kind}&id=${encodeURIComponent(id)}`;

/** Highlights are addressed by `url:<normalized url>`, `project:<id|__inbox__>` or `all`. */
export function highlightsRef(req: { url?: string; projectId?: string | null }): string {
  if (req.url) return `url:${normalizeUrl(req.url)}`;
  if (req.projectId !== undefined) return `project:${req.projectId ?? INBOX_KEY}`;
  return 'all';
}

export const projectKey = (projectId: string | null): string => projectId ?? INBOX_KEY;
const fromKey = (key: string): string | null => (key === INBOX_KEY ? null : key);

export async function loadHighlights(ref: string, lang: Lang = uiLang()): Promise<{ items: Highlight[]; name: string }> {
  const t = exportT(lang);
  if (ref.startsWith('url:')) {
    const items = await highlights.listByUrl(ref.slice(4));
    return { items, name: items[0]?.source.title || ref.slice(4) };
  }
  if (ref.startsWith('project:')) {
    const projectId = fromKey(ref.slice(8));
    const items = await highlights.listByProject(projectId);
    const name = projectId === null ? t('inbox') : ((await projects.get(projectId))?.name ?? t('highlights'));
    return { items, name: t('highlightsOf', { name }) };
  }
  return { items: await highlights.listAll(), name: t('highlights') };
}

export async function loadPrintDoc(kind: PrintKind, id: string, lang: Lang = uiLang()): Promise<PrintDoc> {
  const t = exportT(lang);
  switch (kind) {
    case 'clip': {
      const clip = await clips.get(id);
      if (!clip) throw new Error(t('errNoClip'));
      return clipPrintDoc(clip, lang);
    }
    case 'project': {
      const projectId = fromKey(id);
      const project = projectId === null ? null : await projects.get(projectId);
      if (projectId !== null && !project) throw new Error(t('errNoProject'));
      const list = await clips.listByProject(projectId);
      return projectPrintDoc(project ?? (await inboxProject(lang)), list, lang);
    }
    case 'book': {
      const book = await books.get(id);
      if (!book) throw new Error(t('errNoBook'));
      return bookPrintDoc(book, lang);
    }
    case 'highlights': {
      const { items, name } = await loadHighlights(id, lang);
      return highlightsPrintDoc(items, name, lang);
    }
  }
}

async function inboxProject(lang: Lang): Promise<Project> {
  return {
    id: INBOX_KEY, name: exportT(lang)('inbox'), citationStyle: (await settings.get()).citationStyle, createdAt: '', updatedAt: '',
  };
}
