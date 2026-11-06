import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/core/messages', async (orig) => {
  const mod = await orig<typeof import('@/src/core/messages')>();
  return { ...mod, broadcast: vi.fn() };
});

import { broadcast } from '@/src/core/messages';
import { clips, db, highlights, projects, settings } from '@/src/core/storage';
import type { Clip } from '@/src/core/types';
import { setupProjectsBackground } from '@/src/projects/background';

const h = setupProjectsBackground();
const call = <K extends keyof typeof h>(k: K, p?: unknown) =>
  (h[k] as (p: unknown, s: unknown) => Promise<unknown>)(p, {});

const mkClip = (id: string, projectId: string | null, order: number, extra: Partial<Clip> = {}): Clip => ({
  id,
  projectId,
  kind: 'page',
  title: id,
  html: '',
  markdown: '',
  source: { url: `https://e.com/${id}`, title: id, authors: [], accessed: '2026-01-01T00:00:00Z' },
  tags: [],
  order,
  assetIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

beforeEach(async () => {
  const d = await db();
  for (const s of ['projects', 'clips', 'kv', 'highlights'] as const) await d.clear(s);
  vi.mocked(broadcast).mockClear();
});

describe('projects handlers', () => {
  it('project/create uses citationStyle from settings and broadcasts', async () => {
    await settings.set({ citationStyle: 'apa' });
    const p = (await call('project/create', { name: '  Курсовая ', description: 'd' })) as import('@/src/core/types').Project;
    expect(p.name).toBe('Курсовая');
    expect(p.citationStyle).toBe('apa');
    expect(p.description).toBe('d');
    expect(await projects.get(p.id)).toEqual(p);
    expect(broadcast).toHaveBeenCalledWith('data/changed', { kind: 'project' });
  });

  it('project/create rejects empty names', async () => {
    await expect(call('project/create', { name: '   ' })).rejects.toThrow();
    expect(await projects.list()).toEqual([]);
  });

  it('project/list returns projects', async () => {
    await call('project/create', { name: 'B' });
    await call('project/create', { name: 'A' });
    const list = (await call('project/list')) as { name: string }[];
    expect(list.map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('project/update bumps updatedAt, keeps createdAt, and fails for unknown ids', async () => {
    const p = (await call('project/create', { name: 'A' })) as import('@/src/core/types').Project;
    const old = { ...p, createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' };
    await projects.put(old);
    const u = (await call('project/update', { ...old, name: 'A2', createdAt: 'hacked', citationStyle: 'mla' })) as typeof p;
    expect(u.name).toBe('A2');
    expect(u.citationStyle).toBe('mla');
    expect(u.createdAt).toBe('2020-01-01T00:00:00Z');
    expect(u.updatedAt > old.updatedAt).toBe(true);
    await expect(call('project/update', { ...p, id: 'nope' })).rejects.toThrow();
  });

  it('project/delete removes the project and its clips only, and clears defaultProjectId', async () => {
    const p = (await call('project/create', { name: 'A' })) as { id: string };
    await clips.put(mkClip('c1', p.id, 0));
    await clips.put(mkClip('inbox1', null, 0));
    await settings.set({ defaultProjectId: p.id });
    vi.mocked(broadcast).mockClear();
    await call('project/delete', { id: p.id });
    expect(await projects.get(p.id)).toBeUndefined();
    expect(await clips.listByProject(p.id)).toEqual([]);
    expect((await clips.listByProject(null)).map((c) => c.id)).toEqual(['inbox1']);
    expect((await settings.get()).defaultProjectId).toBeNull();
    expect(broadcast).toHaveBeenCalledWith('data/changed', { kind: 'project' });
  });
});

describe('project/delete and highlights', () => {
  it('moves the project highlights to Inbox instead of orphaning them', async () => {
    const p = (await call('project/create', { name: 'B' })) as { id: string };
    const src = { url: 'https://a.example/', title: 'A', authors: [], accessed: '2026-01-01T00:00:00.000Z' };
    await highlights.put({ id: 'h1', url: 'https://a.example/', color: 'yellow', anchor: { exact: 'x', prefix: '', suffix: '' }, text: 'x', source: src, projectId: p.id, createdAt: '', updatedAt: '' });
    await call('project/delete', { id: p.id });
    expect(await highlights.listByProject(p.id)).toEqual([]);
    expect((await highlights.listByProject(null)).map((h) => [h.id, h.projectId])).toEqual([['h1', null]]);
  });
});

describe('clip handlers', () => {
  it('clip/list returns clips sorted by order; null = Inbox', async () => {
    await clips.put(mkClip('b', 'p', 1));
    await clips.put(mkClip('a', 'p', 0));
    await clips.put(mkClip('i', null, 0));
    expect(((await call('clip/list', { projectId: 'p' })) as Clip[]).map((c) => c.id)).toEqual(['a', 'b']);
    expect(((await call('clip/list', { projectId: null })) as Clip[]).map((c) => c.id)).toEqual(['i']);
  });

  it('clip/update bumps updatedAt and broadcasts', async () => {
    const c = mkClip('a', 'p', 0);
    await clips.put(c);
    const u = (await call('clip/update', { ...c, note: 'hello', section: 'Intro' })) as Clip;
    expect(u.note).toBe('hello');
    expect(u.section).toBe('Intro');
    expect(u.updatedAt > c.updatedAt).toBe(true);
    expect((await clips.get('a'))?.note).toBe('hello');
    expect(broadcast).toHaveBeenCalledWith('data/changed', { kind: 'clip' });
  });

  it('clip/update moving to another project puts it last there', async () => {
    await clips.put(mkClip('x', 'q', 4));
    const c = mkClip('a', 'p', 0);
    await clips.put(c);
    const u = (await call('clip/update', { ...c, projectId: 'q' })) as Clip;
    expect(u.projectId).toBe('q');
    expect(u.order).toBe(5);
    expect(await clips.listByProject('p')).toEqual([]);
  });

  it('clip/update fails for unknown clip', async () => {
    await expect(call('clip/update', mkClip('ghost', 'p', 0))).rejects.toThrow();
  });

  it('clip/delete removes it and broadcasts', async () => {
    await clips.put(mkClip('a', 'p', 0));
    await call('clip/delete', { id: 'a' });
    expect(await clips.get('a')).toBeUndefined();
    expect(broadcast).toHaveBeenCalledWith('data/changed', { kind: 'clip' });
  });

  it('clip/reorder assigns order by index; unlisted clips follow', async () => {
    await clips.put(mkClip('a', 'p', 0));
    await clips.put(mkClip('b', 'p', 1));
    await clips.put(mkClip('c', 'p', 2));
    await clips.put(mkClip('z', 'other', 0));
    await call('clip/reorder', { projectId: 'p', ids: ['c', 'a'] });
    const list = await clips.listByProject('p');
    expect(list.map((c) => [c.id, c.order])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
    expect((await clips.get('z'))?.order).toBe(0);
    expect(broadcast).toHaveBeenCalledWith('data/changed', { kind: 'clip' });
  });

  it('clip/reorder ignores ids of other projects and unknown ids', async () => {
    await clips.put(mkClip('a', 'p', 0));
    await clips.put(mkClip('z', 'other', 7));
    await call('clip/reorder', { projectId: 'p', ids: ['z', 'nope', 'a'] });
    expect((await clips.get('z'))?.order).toBe(7);
    expect((await clips.get('a'))?.order).toBe(0);
  });
});

describe('clip editing', () => {
  it('clip/create makes a note and clip/update re-renders html when markdown changes', async () => {
    const c = (await call('clip/create', { projectId: null, title: 'Note', markdown: '# A' })) as Clip;
    expect(c.html).toContain('<h1>A</h1>');
    const u = (await call('clip/update', { ...c, markdown: '**b** ==hl==' })) as Clip;
    expect(u.html).toContain('<strong>b</strong>');
    expect(u.html).toContain('<mark>hl</mark>');
    const same = (await call('clip/update', { ...u, note: 'n' })) as Clip;
    expect(same.html).toBe(u.html);
  });

  it('clip/create puts a board card into the requested column (no status = first column)', async () => {
    const card = (await call('clip/create', { projectId: null, title: 'Card', markdown: 'text', status: 'doing' })) as Clip;
    expect((await clips.get(card.id))?.status).toBe('doing');
    const plain = (await call('clip/create', { projectId: null, title: 'Plain' })) as Clip;
    expect('status' in (await clips.get(plain.id))!).toBe(false);
  });
});
