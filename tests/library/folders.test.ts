import { describe, expect, it } from 'vitest';
import type { Clip } from '@/src/core/types';
import { folderList, groupByFolder, renameFolder } from '@/src/library/folders';
import { buildGraph } from '@/src/library/graph';

const clip = (id: string, order: number, section?: string, projectId: string | null = 'p'): Clip => ({
  id, projectId, kind: 'page', title: id, html: '', markdown: '', tags: [], order, assetIds: [], section,
  source: { url: '', title: id, authors: [], accessed: '' }, createdAt: '', updatedAt: '',
});

describe('folders', () => {
  const clips = [clip('a', 2, 'B'), clip('b', 0), clip('c', 1, ' a  x '), clip('d', 3, 'b')];
  it('stored order first, then folders only found on clips; case-insensitive, whitespace-normalized', () => {
    expect(folderList(['Empty', 'b'], clips)).toEqual(['Empty', 'b', 'a x']);
  });
  it('groups root notes first, then each folder (empty ones too)', () => {
    const g = groupByFolder(clips, ['Empty', 'b', 'a x']);
    expect(g.map((x) => [x.folder, x.clips.map((c) => c.id)])).toEqual([[null, ['b']], ['Empty', []], ['b', ['a', 'd']], ['a x', ['c']]]);
  });
  it('rename refuses empty names and duplicates', () => {
    expect(renameFolder(['A', 'B'], 'A', ' C ')).toEqual(['C', 'B']);
    expect(renameFolder(['A', 'B'], 'A', 'b')).toBeNull();
    expect(renameFolder(['A', 'B'], 'A', '  ')).toBeNull();
    expect(renameFolder(['A', 'B'], 'A', 'a')).toEqual(['a', 'B']);
  });
  it('graph links notes of a folder through a folder node, separately per project', () => {
    const g = buildGraph([clip('a', 0, 'F'), clip('b', 1, 'f'), clip('c', 2, 'F', 'other')], { withTags: false, withFolders: true });
    const folders = g.nodes.filter((n) => n.kind === 'folder');
    expect(folders.map((n) => [n.label, n.degree])).toEqual([['F', 2], ['F', 1]]);
    expect(buildGraph([clip('a', 0, 'F')], { withTags: false }).nodes).toHaveLength(1);
  });
});
