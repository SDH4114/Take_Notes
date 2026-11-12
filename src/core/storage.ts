// IndexedDB persistence. Usable from background and extension pages (same origin).
// Content scripts must go through background messages instead.
import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore, type StoreNames } from 'idb';
import type { Asset, BoardColumn, Book, Clip, Highlight, Project, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { colorHex, normalizePalette } from './colors';
import { noteHighlightUrl } from './util';

interface TNSchema extends DBSchema {
  projects: { key: string; value: Project };
  clips: { key: string; value: Clip; indexes: { byProject: string } };
  assets: { key: string; value: Asset; indexes: { byUrl: string } };
  highlights: { key: string; value: Highlight; indexes: { byUrl: string; byProject: string } };
  books: { key: string; value: Book };
  kv: { key: string; value: unknown };
}

/** IndexedDB cannot index null, so Inbox (projectId=null) is stored as this key. */
export const INBOX_KEY = '__inbox__';
const pk = (id: string | null) => id ?? INBOX_KEY;

let dbp: Promise<IDBPDatabase<TNSchema>> | null = null;
export function db(): Promise<IDBPDatabase<TNSchema>> {
  dbp ??= openDB<TNSchema>('take-notes', 1, {
    upgrade(d) {
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('clips', { keyPath: 'id' }).createIndex('byProject', '_project');
      d.createObjectStore('assets', { keyPath: 'id' }).createIndex('byUrl', 'url');
      const h = d.createObjectStore('highlights', { keyPath: 'id' });
      h.createIndex('byUrl', 'url');
      h.createIndex('byProject', '_project');
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

type WithProject<T> = T & { _project: string };
const tag = <T extends { projectId: string | null }>(v: T): WithProject<T> => ({ ...v, _project: pk(v.projectId) });
const untag = <T>(v: T): T => { const { _project, ...rest } = v as WithProject<T>; void _project; return rest as T; };

type HighlightStore = IDBPObjectStore<TNSchema, ArrayLike<StoreNames<TNSchema>>, 'highlights', 'readwrite'>;
async function deleteHighlightsByUrl(store: HighlightStore, url: string): Promise<void> {
  for (let c = await store.index('byUrl').openCursor(url); c; c = await c.continue()) await c.delete();
}

// ---- projects
export const projects = {
  async list(): Promise<Project[]> { return (await (await db()).getAll('projects')).sort((a, b) => a.name.localeCompare(b.name)); },
  async get(id: string) { return (await db()).get('projects', id); },
  async put(p: Project) { await (await db()).put('projects', p); return p; },
  async delete(id: string) {
    const d = await db();
    const tx = d.transaction(['projects', 'clips', 'highlights', 'assets', 'kv'], 'readwrite');
    await tx.objectStore('projects').delete(id);
    await tx.objectStore('kv').delete(`board:${id}`);
    await tx.objectStore('kv').delete(`folders:${id}`);
    const idx = tx.objectStore('clips').index('byProject');
    const noteUrls: string[] = [];
    for (let c = await idx.openCursor(id); c; c = await c.continue()) {
      // Files owned by the note (imported PDF originals); web images are shared by URL and only cached.
      for (const a of c.value.assetIds ?? []) await tx.objectStore('assets').delete(a);
      noteUrls.push(noteHighlightUrl(c.value.id));
      await c.delete();
    }
    // Highlights inside url-less notes have no page to live on: they go with their note.
    for (const url of noteUrls) await deleteHighlightsByUrl(tx.objectStore('highlights'), url);
    // Highlights live on their pages: keep them, but move them to Inbox so they stay listable/exportable.
    const hIdx = tx.objectStore('highlights').index('byProject');
    for (let c = await hIdx.openCursor(id); c; c = await c.continue()) {
      await c.update({ ...c.value, projectId: null, _project: INBOX_KEY } as unknown as Highlight);
    }
    await tx.done;
  },
};

// ---- clips
export const clips = {
  async listByProject(projectId: string | null): Promise<Clip[]> {
    const all = await (await db()).getAllFromIndex('clips', 'byProject', pk(projectId));
    return all.map(untag).sort((a, b) => a.order - b.order);
  },
  async get(id: string) { const v = await (await db()).get('clips', id); return v && untag(v); },
  async put(c: Clip) { await (await db()).put('clips', tag(c) as unknown as Clip); return c; },
  /** Also deletes the files the note owns (Clip.assetIds: imported PDF originals). */
  async delete(id: string) {
    const d = await db();
    const tx = d.transaction(['clips', 'assets', 'highlights'], 'readwrite');
    const c = await tx.objectStore('clips').get(id);
    for (const a of c?.assetIds ?? []) await tx.objectStore('assets').delete(a);
    await tx.objectStore('clips').delete(id);
    // Highlights of a url-less note exist only inside it (web-page highlights stay with their page).
    if (c && !c.source.url) await deleteHighlightsByUrl(tx.objectStore('highlights'), noteHighlightUrl(id));
    await tx.done;
  },
  async nextOrder(projectId: string | null): Promise<number> {
    const list = await clips.listByProject(projectId);
    return list.length ? Math.max(...list.map((c) => c.order)) + 1 : 0;
  },
};

// ---- assets
export const assets = {
  async get(id: string) { return (await db()).get('assets', id); },
  async getMany(ids: string[]) { const d = await db(); return (await Promise.all(ids.map((i) => d.get('assets', i)))).filter((a): a is Asset => !!a); },
  async findByUrl(url: string) { return (await db()).getFromIndex('assets', 'byUrl', url); },
  async put(a: Asset) { await (await db()).put('assets', a); return a; },
  async delete(id: string) { await (await db()).delete('assets', id); },
};

// ---- highlights
export const highlights = {
  async listByUrl(url: string): Promise<Highlight[]> {
    return (await (await db()).getAllFromIndex('highlights', 'byUrl', url)).map(untag);
  },
  async listByProject(projectId: string | null): Promise<Highlight[]> {
    return (await (await db()).getAllFromIndex('highlights', 'byProject', pk(projectId))).map(untag);
  },
  async listAll(): Promise<Highlight[]> { return (await (await db()).getAll('highlights')).map(untag); },
  async get(id: string) { const v = await (await db()).get('highlights', id); return v && untag(v); },
  async put(h: Highlight) { await (await db()).put('highlights', tag(h) as unknown as Highlight); return h; },
  async delete(id: string) { await (await db()).delete('highlights', id); },
};

// ---- books
export const books = {
  async list(): Promise<Book[]> { return (await db()).getAll('books'); },
  async get(id: string) { return (await db()).get('books', id); },
  async put(b: Book) { await (await db()).put('books', b); return b; },
  async delete(id: string) { await (await db()).delete('books', id); },
};

// ---- kanban boards (columns per project; Inbox included). null = never customized.
export const boards = {
  async get(projectId: string | null): Promise<BoardColumn[] | null> {
    const v = (await (await db()).get('kv', `board:${pk(projectId)}`)) as BoardColumn[] | undefined;
    return Array.isArray(v) && v.length ? v : null;
  },
  async set(projectId: string | null, columns: BoardColumn[]): Promise<void> {
    await (await db()).put('kv', columns, `board:${pk(projectId)}`);
  },
};

// ---- folders inside a project (= Clip.section). Stored so empty folders and their order survive.
export const folders = {
  async get(projectId: string | null): Promise<string[]> {
    const v = (await (await db()).get('kv', `folders:${pk(projectId)}`)) as string[] | undefined;
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
  },
  async set(projectId: string | null, names: string[]): Promise<void> {
    await (await db()).put('kv', names, `folders:${pk(projectId)}`);
  },
};

// ---- settings
export const settings = {
  async get(): Promise<Settings> {
    const v = (await (await db()).get('kv', 'settings')) as Partial<Settings> | undefined;
    const merged = { ...DEFAULT_SETTINGS, ...v, obsidian: { ...DEFAULT_SETTINGS.obsidian, ...v?.obsidian }, crawl: { ...DEFAULT_SETTINGS.crawl, ...v?.crawl } };
    // Settings saved before palettes existed: legacy color names → hex.
    merged.highlightPalette = normalizePalette(merged.highlightPalette);
    merged.highlightColor = colorHex(merged.highlightColor);
    return merged;
  },
  async set(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await settings.get()), ...patch };
    await (await db()).put('kv', next, 'settings');
    return next;
  },
};

/** Fields of `next` that differ from `prev` (deep compare): a patch for `settings.set` that leaves the rest alone. */
export function changedSettings(prev: Settings, next: Settings): Partial<Settings> {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(next) as Array<keyof Settings>) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) patch[k] = next[k];
  }
  return patch as Partial<Settings>;
}

/** The active project for hotkeys/menus/highlights; a stale id (project deleted) means Inbox. */
export async function activeProjectId(): Promise<string | null> {
  const id = (await settings.get()).defaultProjectId;
  return id && (await projects.get(id)) ? id : null;
}
