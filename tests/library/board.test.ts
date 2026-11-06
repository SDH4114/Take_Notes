import { describe, expect, it } from 'vitest';
import type { Clip } from '@/src/core/types';
import { columnOf, defaultColumns, doneColumnId, groupByColumn, isDone, moveCard, removeColumn, setDoneColumn, toggleDone } from '@/src/library/board';

const cols = defaultColumns({ todo: 'T', doing: 'D', done: 'F' });
const clip = (id: string, order: number, status?: string): Clip => ({
  id, projectId: null, kind: 'page', title: id, html: '', markdown: '', tags: [], order, assetIds: [], status,
  source: { url: '', title: id, authors: [], accessed: '' }, createdAt: '', updatedAt: '',
});
const clips = [clip('a', 0), clip('b', 1, 'doing'), clip('c', 2, 'gone'), clip('d', 3, 'done')];

describe('board', () => {
  it('unknown or missing status falls into the first column', () => {
    expect(columnOf(clips[2]!, cols)).toBe('todo');
    expect([...groupByColumn(clips, cols).entries()].map(([k, v]) => [k, v.map((c) => c.id)]))
      .toEqual([['todo', ['a', 'c']], ['doing', ['b']], ['done', ['d']]]);
  });
  it('moves only the card in the project order: before a card, or after the last card of the column', () => {
    expect(moveCard(clips, cols, 'a', 'done', 'd')).toEqual({ ids: ['b', 'c', 'a', 'd'], status: 'done' });
    expect(moveCard(clips, cols, 'a', 'doing')).toEqual({ ids: ['b', 'a', 'c', 'd'], status: 'doing' });
    expect(moveCard(clips, cols, 'c', 'todo', 'a').ids).toEqual(['c', 'a', 'b', 'd']);
  });
  it('removing a column keeps at least one and picks the left neighbour', () => {
    expect(removeColumn(cols, 'doing')).toEqual({ columns: [cols[0], cols[2]], fallback: 'todo' });
    expect(removeColumn(cols, 'todo')?.fallback).toBe('doing');
    expect(removeColumn([cols[0]!], 'todo')).toBeNull();
  });
});

describe('cards as to-dos', () => {
  it('default board marks "done"; explicit flag wins; otherwise the last column', () => {
    expect(doneColumnId(cols)).toBe('done');
    expect(doneColumnId(setDoneColumn(cols, 'doing'))).toBe('doing');
    expect(setDoneColumn(cols, 'doing').filter((c) => c.done).map((c) => c.id)).toEqual(['doing']);
    expect(doneColumnId([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])).toBe('b');
  });
  it('checking moves to the end of the done column, unchecking back to the first open column', () => {
    expect(toggleDone(clips, cols, 'a')).toEqual({ ids: ['b', 'c', 'd', 'a'], status: 'done' });
    expect(isDone(clips[3]!, cols)).toBe(true);
    expect(toggleDone(clips, cols, 'd')).toEqual({ ids: ['a', 'b', 'c', 'd'], status: 'todo' });
    // an empty target column keeps the card's place in the Notes order
    expect(moveCard([clips[0]!, clips[1]!], cols, 'a', 'done').ids).toEqual(['a', 'b']);
    // done column is the first one → unchecking goes to the next column
    const first = setDoneColumn(cols, 'todo');
    expect(toggleDone(clips, first, 'a')?.status).toBe('doing');
    expect(toggleDone(clips, [cols[0]!], 'a')).toBeNull();
  });
});
