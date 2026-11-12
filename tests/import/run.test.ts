import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/core/messages', async (orig) => {
  const mod = await orig<typeof import('@/src/core/messages')>();
  return {
    ...mod,
    broadcast: vi.fn(),
    send: vi.fn(async (type: string, p: { name: string }) => {
      if (type !== 'project/create') throw new Error(`unexpected ${type}`);
      return { id: 'new-project', name: p.name };
    }),
  };
});

import { send } from '@/src/core/messages';
import { assets, boards, clips, db, folders, highlights, projects, settings } from '@/src/core/storage';
import type { Clip, Highlight, Project } from '@/src/core/types';
import { noteHighlightUrl } from '@/src/core/util';
import { projectToFolderFiles } from '@/src/export/document';
import { highlightsForClip } from '@/src/highlight/apply';
import { broadcast } from '@/src/core/messages';
import { importFiles } from '@/src/import/run';

const enc = (s: string) => new TextEncoder().encode(s);
const NOW = '2026-01-01T00:00:00.000Z';

const clip = (id: string, order: number, extra: Partial<Clip>): Clip => ({
  id, projectId: 'p', kind: 'page', title: id, html: '', markdown: 'Body', order, tags: [], assetIds: [],
  source: { url: `https://e.com/${id}`, title: `Page ${id}`, authors: [], accessed: NOW }, createdAt: NOW, updatedAt: NOW, ...extra,
});

beforeEach(async () => {
  const d = await db();
  for (const s of ['projects', 'clips', 'kv', 'assets', 'highlights'] as const) await d.clear(s);
  vi.mocked(broadcast).mockClear();
  vi.mocked(send).mockClear();
});

describe('importFiles', () => {
  it('round-trips our project export (titles, folders, tags, sources; index.md skipped)', async () => {
    const project: Project = { id: 'p', name: 'Rust', citationStyle: 'gost', createdAt: NOW, updatedAt: NOW };
    const list = [
      clip('a', 0, { title: 'Intro', tags: ['rust'] }),
      clip('b', 1, { title: 'Ownership', section: 'Basics', markdown: '## Rules\n\nOne owner.' }),
    ];
    const s = await settings.get();
    const files = projectToFolderFiles(project, list, s, 'ru', {
      highlights: [{ id: 'h', url: 'https://e.com/a', color: '#ffff00', anchor: { exact: 'B', prefix: '', suffix: '' }, text: 'Body', source: list[0]!.source, projectId: 'p', createdAt: NOW, updatedAt: NOW }],
      board: { columns: [{ id: 'todo', name: 'To do' }], cards: new Map([['todo', list]]) },
    });
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['index.md', 'board.md']));
    const input = Object.entries(files).map(([path, text]) => ({ path: `Rust/${path}`, bytes: enc(text) }));

    const r = await importFiles(input, { projectId: 'target' });
    expect(r).toMatchObject({ projectId: 'target', notes: 2, pdfScans: 0, failed: [] });
    const got = await clips.listByProject('target');
    expect(got.map((c) => [c.title, c.section ?? '', c.tags, c.source.url])).toEqual([
      ['Ownership', 'Basics', [], 'https://e.com/b'],
      ['Intro', '', ['rust'], 'https://e.com/a'],
    ]);
    expect(got[0]!.markdown).toBe('## Rules\n\nOne owner.\n'); // the export's +1 heading shift is undone
    expect(got[0]!.html).toContain('One owner.');
    expect(await folders.get('target')).toEqual(['Basics']);
  });

  for (const lang of ['ru', 'en'] as const) {
    it(`round-trips highlights and the board of our export (${lang})`, async () => {
      const project: Project = { id: 'p', name: 'Rust', citationStyle: 'gost', createdAt: NOW, updatedAt: NOW };
      const own = clip('own', 2, { title: 'Own note', markdown: 'My own words here.', source: { url: '', title: '', authors: [], accessed: NOW } });
      const list = [
        clip('a', 0, { title: 'Intro', markdown: 'Rust is fast. Rust is safe.' }),
        clip('b', 1, { title: 'Ownership', section: 'Basics', markdown: 'Each value has an ==owner==.' }),
        own,
      ];
      const hl = (id: string, url: string, text: string, extra: Partial<Highlight> = {}): Highlight => ({
        id, url, color: '#60a5fa', anchor: { exact: text, prefix: '', suffix: '' }, text, projectId: 'p',
        source: list.find((c) => c.id === id.slice(1))?.source ?? own.source, createdAt: `2026-01-0${id.length}T00:00:00.000Z`, updatedAt: NOW, ...extra,
      });
      const hls = [
        hl('ha', 'https://e.com/a', 'Rust is safe.', { note: 'short', body: '## Why\n\nBorrow checker.' }),
        hl('hown', noteHighlightUrl('own'), 'own words', { color: '#f472b6' }),
        hl('hx', 'https://other.com/x', 'Elsewhere', { source: { url: 'https://other.com/x', title: 'X', authors: [], accessed: NOW } }),
      ];
      const files = projectToFolderFiles(project, list, await settings.get(), lang, {
        highlights: hls,
        board: {
          columns: [{ id: 'todo', name: 'To do' }, { id: 'later', name: 'Later' }, { id: 'done', name: 'Finished', done: true }],
          cards: new Map([['todo', [list[0]!]], ['done', [list[1]!, own]]]),
        },
      });
      const r = await importFiles(Object.entries(files).map(([path, text]) => ({ path, bytes: enc(text) })), { newProject: 'Rust' });
      expect(r).toMatchObject({ notes: 3, highlights: 3, board: true, failed: [] });

      const got = await clips.listByProject('new-project');
      const byTitle = (t: string) => got.find((c) => c.title === t)!;
      const stored = await highlights.listByProject('new-project');
      expect(stored.map((h) => [h.text, h.note, h.body, h.color]).sort()).toEqual([
        ['Elsewhere', undefined, undefined, '#60a5fa'],
        ['Rust is safe.', 'short', '## Why\n\nBorrow checker.', '#60a5fa'],
        ['own words', undefined, undefined, '#f472b6'],
      ]);
      // Joined to the right notes; the own note's highlight uses the new clip id, not the old one.
      expect(highlightsForClip(byTitle('Intro'), stored).map((h) => h.text)).toEqual(['Rust is safe.']);
      expect(highlightsForClip(byTitle('Own note'), stored).map((h) => h.url)).toEqual([noteHighlightUrl(byTitle('Own note').id)]);
      expect(highlightsForClip(byTitle('Ownership'), stored)).toEqual([]);
      // ==marks== written for exported highlights are unwrapped; the user's own ==owner== stays.
      // …and the "## Highlights" quotes section the export appends to each note is dropped again.
      expect(byTitle('Intro').markdown).toBe('Rust is fast. Rust is safe.\n');
      expect(byTitle('Own note').markdown).toBe('My own words here.\n');
      expect(byTitle('Ownership').markdown).toContain('==owner==');

      const cols = (await boards.get('new-project'))!;
      expect(cols.map((c) => c.name)).toEqual(['To do', 'Later', 'Finished']);
      const col = (t: string) => cols.find((c) => c.id === byTitle(t).status)?.name;
      expect([col('Intro'), col('Ownership'), col('Own note')]).toEqual(['To do', 'Finished', 'Finished']);
      expect(broadcast).toHaveBeenCalledWith('data/changed', { kind: 'highlight' });
    });
  }

  it('Obsidian ==marks== become highlights of their own note; url-less notes never share them', async () => {
    const r = await importFiles([
      { path: 'V/one.md', bytes: enc('Same ==shared text== here, ==shared text== again, `==code==`.') },
      { path: 'V/two.md', bytes: enc('Also ==shared text== and ==only two==.') },
      { path: 'V/web.md', bytes: enc('---\nsource: https://e.com/w#x\n---\nOn the ==web page==.') },
    ], { newProject: 'V' });
    expect(r).toMatchObject({ notes: 3, highlights: 4 });
    const got = await clips.listByProject('new-project');
    const all = await highlights.listAll();
    const [one, two, web] = got;
    expect(one!.markdown).toBe('Same shared text here, shared text again, `==code==`.\n');
    expect(highlightsForClip(one!, all).map((h) => h.text)).toEqual(['shared text']);
    expect(highlightsForClip(two!, all).map((h) => h.text)).toEqual(['shared text', 'only two']);
    expect(highlightsForClip(web!, all).map((h) => [h.text, h.url])).toEqual([['web page', 'https://e.com/w']]);
    expect(new Set(all.map((h) => h.url)).size).toBe(3);
    expect(all.every((h) => h.projectId === 'new-project' && h.anchor.exact === h.text)).toBe(true);
    expect(all.find((h) => h.text === 'only two')!.source.title).toBe('two');
    // The preview marks them through the highlight records.
    expect(two!.html).not.toContain('<mark');
  });

  it('a board imported into a project with its own board keeps existing columns', async () => {
    await clips.put(clip('old', 0, { projectId: 'p2', status: 'mine' }));
    await boards.set('p2', [{ id: 'mine', name: 'Mine' }, { id: 'done', name: 'Done', done: true }]);
    await importFiles([
      { path: 'index.md', bytes: enc('---\ntags:\n  - takenotes\n---\n# X\n') },
      { path: 'n.md', bytes: enc('# N\n\nText') },
      { path: 'board.md', bytes: enc('## done\n\n- [ ] [[n|N]]\n\n## Extra\n') },
    ], { projectId: 'p2' });
    const cols = (await boards.get('p2'))!;
    expect(cols.map((c) => c.name)).toEqual(['Mine', 'Done', 'Extra']);
    expect((await clips.listByProject('p2')).map((c) => [c.title, c.status])).toEqual([['old', 'mine'], ['N', 'done']]);
  });

  it('Obsidian vault into a new project: images embedded, hidden folders ignored, order by path', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const r = await importFiles([
      { path: 'Vault/.obsidian/workspace.md', bytes: enc('nope') },
      { path: 'Vault/Lectures/Lecture 10.md', bytes: enc('Ten') },
      { path: 'Vault/Lectures/Lecture 2.md', bytes: enc('Two ![[diagram.png]]') },
      { path: 'Vault/attachments/diagram.png', bytes: png },
      { path: 'Vault/index.md', bytes: enc('# My index\n\nA real note.') },
    ], { newProject: 'Vault' });
    expect(send).toHaveBeenCalledWith('project/create', { name: 'Vault' });
    const got = await clips.listByProject('new-project');
    expect(got.map((c) => c.title)).toEqual(['My index', 'Lecture 2', 'Lecture 10']);
    expect(got[1]!.markdown).toBe('Two ![diagram][img-1]\n\n[img-1]: <data:image/png;base64,iVBORw==>\n');
    expect(got[1]!.html).toContain('src="data:image/png;base64,iVBORw=="');
    expect(r.notes).toBe(3);
  });

  it('appends after existing notes and keeps stored folders', async () => {
    await clips.put(clip('old', 5, { projectId: null }));
    await folders.set(null, ['Existing']);
    await importFiles([{ path: 'New/x.md', bytes: enc('x') }, { path: 'y.md', bytes: enc('y') }], { projectId: null });
    const got = await clips.listByProject(null);
    expect(got.map((c) => [c.title, c.order])).toEqual([['old', 5], ['x', 6], ['y', 7]]);
    expect(await folders.get(null)).toEqual(['Existing', 'New']);
  });

  it('nothing importable → error', async () => {
    await expect(importFiles([{ path: 'a.png', bytes: new Uint8Array() }], { projectId: null })).rejects.toThrow();
  });

  it('deleting a note or its project deletes the files it owns', async () => {
    const pdf = { id: 'a1', url: 'takenotes-import:x/a.pdf', mime: 'application/pdf', filename: 'files/a.pdf', data: new Blob(['%PDF']) };
    const pdf2 = { ...pdf, id: 'a2', url: 'takenotes-import:y/b.pdf' };
    await assets.put(pdf);
    await assets.put(pdf2);
    await clips.put(clip('n1', 0, { assetIds: ['a1'] }));
    await clips.put(clip('n2', 1, { assetIds: ['a2'] }));
    await clips.delete('n1');
    expect(await assets.get('a1')).toBeUndefined();
    expect(await assets.get('a2')).toBeDefined();
    await projects.put({ id: 'p', name: 'P', citationStyle: 'gost', createdAt: NOW, updatedAt: NOW });
    await projects.delete('p');
    expect(await assets.get('a2')).toBeUndefined();
  });

  it('deleting a url-less note deletes its highlights; deleting a project drops its board/folders and note highlights', async () => {
    const hl = (id: string, url: string, projectId: string | null): Highlight => ({
      id, url, color: '#facc15', text: 't', anchor: { exact: 't', prefix: '', suffix: '' } as Highlight['anchor'],
      source: { url: '', title: '', authors: [], accessed: NOW }, projectId, createdAt: NOW, updatedAt: NOW,
    });
    const own = (id: string) => clip(id, 0, { source: { url: '', title: '', authors: [], accessed: NOW } });
    await clips.put(own('n1'));
    await clips.put(clip('w1', 1, {}));
    await highlights.put(hl('h1', noteHighlightUrl('n1'), 'p'));
    await highlights.put(hl('hw', 'https://e.com/w1', 'p'));
    await clips.delete('n1');
    await clips.delete('w1');
    expect(await highlights.get('h1')).toBeUndefined();
    expect(await highlights.get('hw')).toBeDefined(); // web highlights stay with their page

    await projects.put({ id: 'p', name: 'P', citationStyle: 'gost', createdAt: NOW, updatedAt: NOW });
    await clips.put(own('n2'));
    await highlights.put(hl('h2', noteHighlightUrl('n2'), 'p'));
    await boards.set('p', [{ id: 'todo', name: 'To do' }]);
    await folders.set('p', ['A']);
    await projects.delete('p');
    expect(await highlights.get('h2')).toBeUndefined();
    expect((await highlights.get('hw'))!.projectId).toBeNull(); // moved to Inbox
    expect(await boards.get('p')).toBeNull();
    expect(await folders.get('p')).toEqual([]);
  });
});
