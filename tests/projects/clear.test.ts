import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { books, clips, db, highlights, projects, settings } from '@/src/core/storage';
import { DEFAULT_SETTINGS } from '@/src/core/types';
import { clearAllData } from '@/src/projects/data';

describe('clearAllData', () => {
  it('empties every store and resets settings', async () => {
    const now = '2026-01-01T00:00:00Z';
    await projects.put({ id: 'p', name: 'P', citationStyle: 'gost', createdAt: now, updatedAt: now });
    const source = { url: 'https://e.com', title: 't', authors: [], accessed: now };
    await clips.put({ id: 'c', projectId: 'p', kind: 'page', title: 't', html: '', markdown: '', source, tags: [], order: 0, assetIds: [], createdAt: now, updatedAt: now });
    await highlights.put({ id: 'h', url: 'https://e.com', color: 'yellow', anchor: { exact: 'a', prefix: '', suffix: '' }, text: 'a', source, projectId: null, createdAt: now, updatedAt: now });
    await books.put({ id: 'b', title: 'B', rootUrl: 'https://e.com', source, chapters: [], createdAt: now });
    await settings.set({ citationStyle: 'mla' });

    await clearAllData();

    const d = await db();
    for (const s of ['projects', 'clips', 'assets', 'highlights', 'books', 'kv'] as const) expect(await d.count(s)).toBe(0);
    expect(await settings.get()).toEqual(DEFAULT_SETTINGS);
  });
});
