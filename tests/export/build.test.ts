import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import type { Book, Clip, Highlight, Project } from '@/src/core/types';
import { DEFAULT_SETTINGS } from '@/src/core/types';
import { readText, unzipBlob } from './helpers';

vi.mock('@/src/cite', () => ({
  formatBibliography: (sources: { title: string }[]) => sources.map((s) => s.title),
}));

import { buildBookArtifact, buildClipArtifact, buildHighlightsArtifact, buildProjectArtifact } from '@/src/export/build';

const PNG = new Uint8Array([137, 80, 78, 71]);
const fetchFn = (async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch;
const io = { fetchFn, lang: 'en' as const };
const source = { url: 'https://ex.com/p', title: 'Src', authors: [], accessed: '2025-01-02T00:00:00Z' };
const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c', projectId: null, kind: 'page', title: 'My: clip', html: '', source, markdown: 'body ![i](https://ex.com/i.png)',
  tags: [], order: 0, assetIds: [], createdAt: '', updatedAt: '', ...over,
});
const settings = { ...DEFAULT_SETTINGS, obsidian: { frontmatter: false, wikilinks: false } };

describe('buildClipArtifact', () => {
  it('md keeps remote images and is a single markdown file', async () => {
    const a = await buildClipArtifact(clip(), 'md', settings, io);
    expect(a.filename).toBe('My clip.md');
    expect(a.blob.type).toBe('text/markdown;charset=utf-8');
    expect(await readText(a.blob)).toContain('![i](https://ex.com/i.png)');
  });
  it('md-zip bundles the note with downloaded images and relative links', async () => {
    const a = await buildClipArtifact(clip(), 'md-zip', settings, io);
    expect(a.filename).toBe('My clip.zip');
    const files = await unzipBlob(a.blob);
    const paths = Object.keys(files);
    const img = paths.find((p) => p.startsWith('images/'));
    expect(img).toMatch(/^images\/[0-9a-f]+\.png$/);
    expect(paths).toContain('My clip.md');
    expect(new TextDecoder().decode(files['My clip.md'])).toContain(`![i](${img})`);
  });
  it('md-zip keeps remote links when downloadImages is off', async () => {
    const a = await buildClipArtifact(clip(), 'md-zip', { ...settings, downloadImages: false }, io);
    const files = await unzipBlob(a.blob);
    expect(Object.keys(files)).toEqual(['My clip.md']);
  });
  it('rejects formats that do not apply with a translated error', async () => {
    await expect(buildClipArtifact(clip(), 'anki-tsv', settings, io)).rejects.toThrow('Format "anki-tsv" is not available for a clip');
    await expect(buildClipArtifact(clip(), 'md-folder-zip', settings, { ...io, lang: 'ru' })).rejects.toThrow('Формат «md-folder-zip» недоступен для заметки');
  });
});

describe('buildProjectArtifact', () => {
  const project: Project = { id: 'p', name: 'Курсовая', citationStyle: 'gost', createdAt: '', updatedAt: '' };
  it('exports a project to md and names the Inbox by language', async () => {
    const a = await buildProjectArtifact(project, [clip()], 'md', settings, io);
    expect(a.filename).toBe('Курсовая.md');
    expect(await readText(a.blob)).toContain('## References');
    const inbox = await buildProjectArtifact(null, [clip()], 'md', settings, io);
    expect(inbox.filename).toBe('Inbox.md');
    expect(await readText(inbox.blob)).toContain('# Inbox');
  });
});

describe('buildBookArtifact', () => {
  const book: Book = {
    id: 'b', title: 'Book', rootUrl: 'https://ex.com', source, createdAt: '',
    chapters: [{ url: 'https://ex.com/1', title: 'One', level: 0, html: '', markdown: 'x ![i](https://ex.com/i.png)', assetIds: [] }],
  };
  it('md-folder-zip contains index, chapter files and images folder', async () => {
    const a = await buildBookArtifact(book, 'md-folder-zip', settings, io);
    const files = await unzipBlob(a.blob);
    const paths = Object.keys(files).sort();
    expect(paths.filter((p) => !p.startsWith('Book/images/'))).toEqual(['Book/01 - One.md', 'Book/index.md']);
    expect(paths.some((p) => /^Book\/images\/[0-9a-f]+\.png$/.test(p))).toBe(true);
    expect(new TextDecoder().decode(files['Book/01 - One.md'])).toMatch(/!\[i\]\(images\/[0-9a-f]+\.png\)/);
  });
  it('md is a single file', async () => {
    const a = await buildBookArtifact(book, 'md', settings, io);
    expect(a.filename).toBe('Book.md');
  });
});

describe('buildHighlightsArtifact', () => {
  const h: Highlight = {
    id: 'h', url: 'https://ex.com/p', color: 'yellow', anchor: { exact: 'a', prefix: '', suffix: '' }, text: 'quote',
    source, projectId: null, createdAt: '', updatedAt: '',
  };
  it('md works, anki-tsv delegates to the anki module, empty list is an error', async () => {
    const md = await buildHighlightsArtifact([h], 'Notes', 'md', settings, io);
    expect(md.filename).toBe('Notes.md');
    expect(await readText(md.blob)).toContain('> quote');
    const anki = await buildHighlightsArtifact([h], 'Notes', 'anki-tsv', settings, io);
    expect(anki.filename).toBe('Notes.tsv');
    expect(await readText(anki.blob)).toContain('quote');
    await expect(buildHighlightsArtifact([], 'Notes', 'md', settings, io)).rejects.toThrow('No highlights to export');
    await expect(buildHighlightsArtifact([h], 'Notes', 'md-zip', settings, io)).rejects.toThrow('not available for highlights');
  });
});
