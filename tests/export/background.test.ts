import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { books, clips, highlights, projects } from '@/src/core/storage';
import type { Clip } from '@/src/core/types';
import { readText } from './helpers';

const downloads: { blob: Blob; filename: string }[] = [];
const pdfs: unknown[][] = [];

vi.mock('@/src/export/download', async (orig) => ({
  ...(await orig<typeof import('@/src/export/download')>()),
  downloadBlob: async (blob: Blob, filename: string) => { downloads.push({ blob, filename }); },
}));
vi.mock('@/src/export/pdf', () => ({
  exportPdf: async (...args: unknown[]) => { pdfs.push(args); },
}));

import { setupExportBackground } from '@/src/export/background';

const source = { url: 'https://ex.com/p', title: 'Src', authors: [], accessed: '2025-01-02T00:00:00Z' };
const clip: Clip = {
  id: 'c1', projectId: 'p1', kind: 'page', title: 'Note', html: '<p>x</p>', source, markdown: 'hello', tags: [],
  order: 0, assetIds: [], createdAt: '', updatedAt: '',
};
const h = setupExportBackground();
const run = <K extends keyof typeof h>(k: K, payload: never) =>
  (h[k] as (p: never, s: never) => Promise<void>)(payload, undefined as never);

beforeEach(() => { downloads.length = 0; pdfs.length = 0; });

describe('export handlers', () => {
  it('export/clip md downloads a markdown file; pdf goes through the print page', async () => {
    await clips.put(clip);
    await run('export/clip', { id: 'c1', format: 'md' } as never);
    expect(downloads.map((d) => d.filename)).toEqual(['Note.md']);
    expect(await readText(downloads[0]!.blob)).toContain('hello');
    await run('export/clip', { id: 'c1', format: 'pdf' } as never);
    expect(pdfs[0]!.slice(0, 3)).toEqual(['clip', 'c1', 'Note.pdf']);
  });
  it('rejects missing data and unsupported combinations with clear errors', async () => {
    await expect(run('export/clip', { id: 'nope', format: 'md' } as never)).rejects.toThrow(/Clip not found|Заметка не найдена/);
    await expect(run('export/clip', { id: 'c1', format: 'anki-tsv' } as never)).rejects.toThrow(/anki-tsv/);
    await expect(run('export/book', { id: 'nope', format: 'md' } as never)).rejects.toThrow(/Book not found|Книга не найдена/);
    await expect(run('export/project', { projectId: 'nope', format: 'md' } as never)).rejects.toThrow(/Project not found|Проект не найден/);
  });
  it('export/project handles the Inbox (null) and project pdf', async () => {
    await projects.put({ id: 'p1', name: 'Proj', citationStyle: 'apa', createdAt: '', updatedAt: '' });
    await run('export/project', { projectId: 'p1', format: 'md' } as never);
    expect(downloads[0]!.filename).toBe('Proj.md');
    await run('export/project', { projectId: null, format: 'pdf' } as never);
    expect(pdfs[0]![0]).toBe('project');
    expect(pdfs[0]![1]).toBe('__inbox__');
  });
  it('export/book downloads md and pdf', async () => {
    await books.put({ id: 'b1', title: 'Bk', rootUrl: 'https://ex.com', source, chapters: [], createdAt: '' });
    await run('export/book', { id: 'b1', format: 'md-folder-zip' } as never);
    expect(downloads[0]!.filename).toBe('Bk.zip');
    await run('export/book', { id: 'b1', format: 'pdf' } as never);
    expect(pdfs[0]!.slice(0, 3)).toEqual(['book', 'b1', 'Bk.pdf']);
  });
  it('export/highlights: md and anki-tsv by project, pdf by url, empty is an error', async () => {
    await expect(run('export/highlights', { projectId: 'p1', format: 'md' } as never)).rejects.toThrow(/No highlights|Нет выделений/);
    await highlights.put({
      id: 'h1', url: 'https://ex.com/p', color: 'yellow', anchor: { exact: 'q', prefix: '', suffix: '' }, text: 'quote',
      source, projectId: 'p1', createdAt: '', updatedAt: '',
    });
    await run('export/highlights', { projectId: 'p1', format: 'anki-tsv' } as never);
    expect(downloads[0]!.filename).toMatch(/\.tsv$/);
    await run('export/highlights', { url: 'https://ex.com/p', format: 'pdf' } as never);
    expect(pdfs[0]![0]).toBe('highlights');
    expect(pdfs[0]![1]).toBe('url:https://ex.com/p');
  });
});
