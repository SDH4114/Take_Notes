import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { books, clips, highlights, projects } from '@/src/core/storage';
import type { Book, Clip, Highlight, Project } from '@/src/core/types';
import { highlightsRef, loadHighlights, loadPrintDoc, printPath } from '@/src/export/data';

const source = { url: 'https://ex.com/p', title: 'Src', authors: [], accessed: '2025-01-02T00:00:00Z' };
const clip = (id: string, projectId: string | null, order = 0): Clip => ({
  id, projectId, kind: 'page', title: `T-${id}`, html: '<p>x</p>', source, markdown: '', tags: [], order,
  assetIds: [], createdAt: '', updatedAt: '',
});
const hl = (id: string, projectId: string | null, url = 'https://ex.com/p'): Highlight => ({
  id, url, color: 'yellow', anchor: { exact: 'a', prefix: '', suffix: '' }, text: `text-${id}`, source, projectId,
  createdAt: '', updatedAt: '',
});

describe('printPath', () => {
  it('encodes kind and id into the print page URL', () => {
    expect(printPath('clip', 'a b')).toBe('/print.html?kind=clip&id=a%20b');
  });
});

describe('loadPrintDoc', () => {
  it('loads clips, projects (incl. Inbox), books and highlights from storage', async () => {
    const project: Project = { id: 'p1', name: 'Proj', citationStyle: 'apa', createdAt: '', updatedAt: '' };
    await projects.put(project);
    await clips.put(clip('c1', 'p1', 1));
    await clips.put(clip('c2', 'p1', 0));
    await clips.put(clip('c3', null));
    const book: Book = { id: 'b1', title: 'Bk', rootUrl: 'https://ex.com', source, chapters: [], createdAt: '' };
    await books.put(book);
    await highlights.put(hl('h1', 'p1'));

    expect((await loadPrintDoc('clip', 'c1', 'en')).title).toBe('T-c1');
    expect((await loadPrintDoc('project', 'p1', 'en')).sections.map((s) => s.title)).toEqual(['T-c2', 'T-c1']);
    const inbox = await loadPrintDoc('project', '__inbox__', 'en');
    expect(inbox.title).toBe('Inbox');
    expect(inbox.sections.map((s) => s.title)).toEqual(['T-c3']);
    expect((await loadPrintDoc('book', 'b1', 'en')).title).toBe('Bk');
    expect((await loadPrintDoc('highlights', 'project:p1', 'en')).title).toBe('Highlights: Proj');
  });
  it('throws a translated error for missing data', async () => {
    await expect(loadPrintDoc('clip', 'nope', 'en')).rejects.toThrow('Clip not found');
    await expect(loadPrintDoc('book', 'nope', 'ru')).rejects.toThrow('Книга не найдена');
    await expect(loadPrintDoc('project', 'nope', 'en')).rejects.toThrow('Project not found');
  });
});

describe('loadHighlights', () => {
  it('resolves refs for url, project, inbox and all', async () => {
    await highlights.put(hl('h2', null, 'https://ex.com/other'));
    expect((await loadHighlights(highlightsRef({ url: 'https://ex.com/other#frag' }), 'en')).items.map((h) => h.id)).toEqual(['h2']);
    expect((await loadHighlights(highlightsRef({ projectId: null }), 'en')).items.map((h) => h.id)).toEqual(['h2']);
    expect((await loadHighlights(highlightsRef({ projectId: 'p1' }), 'en')).name).toBe('Highlights: Proj');
    expect((await loadHighlights(highlightsRef({}), 'en')).items.length).toBeGreaterThanOrEqual(2);
  });
});
