// Pure kanban logic: columns of a project board and moving note cards between them.
import type { BoardColumn, Clip } from '@/src/core/types';

export function defaultColumns(names: { todo: string; doing: string; done: string }): BoardColumn[] {
  return [{ id: 'todo', name: names.todo }, { id: 'doing', name: names.doing }, { id: 'done', name: names.done, done: true }];
}

/** Column that collects checked-off cards: the flagged one, else the default "done" column, else the last one. */
export function doneColumnId(columns: readonly BoardColumn[]): string {
  return (columns.find((c) => c.done) ?? columns.find((c) => c.id === 'done') ?? columns.at(-1))?.id ?? '';
}

/** Make `id` the only "done" column (or clear the flag everywhere with null). */
export function setDoneColumn(columns: readonly BoardColumn[], id: string | null): BoardColumn[] {
  return columns.map((c) => {
    const { done: _drop, ...rest } = c;
    return c.id === id ? { ...rest, done: true } : rest;
  });
}

export const isDone = (c: Pick<Clip, 'status'>, columns: readonly BoardColumn[]): boolean =>
  columns.length > 1 && columnOf(c, columns) === doneColumnId(columns);

/**
 * Check/uncheck a card like a to-do: checking moves it to the end of the done column, unchecking to the end of the
 * first other column. Returns null when the board has a single column (nowhere to move).
 */
export function toggleDone(clips: readonly Clip[], columns: readonly BoardColumn[], id: string): { ids: string[]; status: string } | null {
  const card = clips.find((c) => c.id === id);
  if (!card || columns.length < 2) return null;
  const done = doneColumnId(columns);
  const target = isDone(card, columns) ? columns.find((c) => c.id !== done)!.id : done;
  return moveCard(clips, columns, id, target);
}

/** Column of a clip: its status if that column exists, else the first column. */
export function columnOf(c: Pick<Clip, 'status'>, columns: readonly BoardColumn[]): string {
  return c.status && columns.some((col) => col.id === c.status) ? c.status : (columns[0]?.id ?? '');
}

/** Cards per column, each sorted by clip order. */
export function groupByColumn(clips: readonly Clip[], columns: readonly BoardColumn[]): Map<string, Clip[]> {
  const out = new Map<string, Clip[]>(columns.map((c) => [c.id, []]));
  for (const c of [...clips].sort((a, b) => a.order - b.order)) out.get(columnOf(c, columns))?.push(c);
  return out;
}

/**
 * Drop card `id` into `column` before card `before` (or at the end). Returns the new project order of all ids
 * (columns concatenated left→right) and the card's new status.
 */
export function moveCard(
  clips: readonly Clip[], columns: readonly BoardColumn[], id: string, column: string, before?: string,
): { ids: string[]; status: string } {
  const groups = groupByColumn(clips, columns);
  for (const list of groups.values()) {
    const i = list.findIndex((c) => c.id === id);
    if (i >= 0) list.splice(i, 1);
  }
  const card = clips.find((c) => c.id === id);
  const target = groups.get(column);
  if (card && target) {
    const at = before ? target.findIndex((c) => c.id === before) : -1;
    target.splice(at >= 0 ? at : target.length, 0, card);
  }
  return { ids: [...groups.values()].flat().map((c) => c.id), status: column };
}

/** Remove a column: its cards move to the neighbouring column (left, else right). At least one column stays. */
export function removeColumn(columns: readonly BoardColumn[], id: string): { columns: BoardColumn[]; fallback: string } | null {
  if (columns.length <= 1) return null;
  const i = columns.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const next = columns.filter((c) => c.id !== id);
  return { columns: next, fallback: (columns[i - 1] ?? columns[i + 1])!.id };
}
