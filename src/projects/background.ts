// Background part of the projects module. Owner: agent B.
import { broadcast, type BackgroundMessages, type Handlers } from '@/src/core/messages';
import { clips, projects, settings } from '@/src/core/storage';
import type { Clip, Project } from '@/src/core/types';
import { newId, nowIso } from '@/src/core/util';
import { dom } from '@/src/core/dom';

const renderMarkdown = (md: string) => dom('renderMarkdown', { md });

async function updateClip(input: Clip): Promise<Clip> {
  const existing = await clips.get(input.id);
  if (!existing) throw new Error(`Clip not found: ${input.id}`);
  const next: Clip = { ...input, updatedAt: nowIso() };
  // Edited in the editor: the stored html (used for PDF) must follow the markdown.
  if (input.markdown !== existing.markdown) next.html = await renderMarkdown(input.markdown);
  // Moving to another project: append at the end there instead of clashing with its order.
  if (input.projectId !== existing.projectId) next.order = await clips.nextOrder(input.projectId);
  await clips.put(next);
  broadcast('data/changed', { kind: 'clip' });
  return next;
}

async function reorderClips(projectId: string | null, ids: string[]): Promise<void> {
  const current = await clips.listByProject(projectId);
  const byId = new Map(current.map((c) => [c.id, c]));
  const ordered: Clip[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (c) {
      ordered.push(c);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values()); // clips the caller did not list keep their relative order, after the listed ones
  const now = nowIso();
  for (const [i, c] of ordered.entries()) {
    if (c.order !== i) await clips.put({ ...c, order: i, updatedAt: now });
  }
  broadcast('data/changed', { kind: 'clip' });
}

/** Called once from entrypoints/background.ts. Register menus/commands here; return message handlers. */
export function setupProjectsBackground(): Handlers<BackgroundMessages> {
  return {
    'project/list': () => projects.list(),

    'project/create': async ({ name, description }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Project name is empty');
      const now = nowIso();
      const p: Project = {
        id: newId(),
        name: trimmed,
        description: description?.trim() || undefined,
        citationStyle: (await settings.get()).citationStyle,
        createdAt: now,
        updatedAt: now,
      };
      await projects.put(p);
      broadcast('data/changed', { kind: 'project' });
      return p;
    },

    'project/update': async (input) => {
      const existing = await projects.get(input.id);
      if (!existing) throw new Error(`Project not found: ${input.id}`);
      const name = input.name.trim();
      if (!name) throw new Error('Project name is empty');
      const next: Project = { ...input, name, createdAt: existing.createdAt, updatedAt: nowIso() };
      await projects.put(next);
      broadcast('data/changed', { kind: 'project' });
      return next;
    },

    'project/delete': async ({ id }) => {
      await projects.delete(id); // also deletes the project's clips
      if ((await settings.get()).defaultProjectId === id) await settings.set({ defaultProjectId: null });
      broadcast('data/changed', { kind: 'project' });
    },

    'clip/list': ({ projectId }) => clips.listByProject(projectId),
    'clip/update': updateClip,
    'clip/patch': async ({ id, patch }) => {
      const existing = await clips.get(id);
      if (!existing) throw new Error(`Clip not found: ${id}`);
      const next: Clip = { ...existing };
      for (const k of ['section', 'status'] as const) {
        if (!(k in patch)) continue;
        const v = patch[k];
        if (v == null || v === '') delete next[k];
        else next[k] = v;
      }
      if ('projectId' in patch) next.projectId = patch.projectId ?? null;
      return updateClip(next);
    },
    'clip/create': async ({ projectId, title, markdown = '', status }) => {
      const now = nowIso();
      const clip: Clip = {
        id: newId(), projectId, kind: 'selection', title: title.trim() || 'Untitled', html: await renderMarkdown(markdown), markdown,
        source: { url: '', title: title.trim(), authors: [], accessed: now }, tags: [], order: await clips.nextOrder(projectId),
        assetIds: [], createdAt: now, updatedAt: now, ...(status ? { status } : {}),
      };
      await clips.put(clip);
      broadcast('data/changed', { kind: 'clip' });
      return clip;
    },
    'clip/delete': async ({ id }) => {
      await clips.delete(id);
      broadcast('data/changed', { kind: 'clip' });
    },
    'clip/reorder': ({ projectId, ids }) => reorderClips(projectId, ids),
  };
}
