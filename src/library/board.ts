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
 * Drop card `id` into `column` before card `before` (or at the end of that column). Only the moved card changes its
 * place in the project order (the Notes list keeps its manual order); returns that order and the card's new status.
 */
export function moveCard(
  clips: readonly Clip[], columns: readonly BoardColumn[], id: string, column: string, before?: string,
): { ids: string[]; status: string } {
  const order = [...clips].sort((a, b) => a.order - b.order).map((c) => c.id);
  const from = order.indexOf(id);
  const rest = order.filter((x) => x !== id);
  if (from < 0) return { ids: order, status: column };
  let at: number;
  if (before && before !== id && rest.includes(before)) {
    at = rest.indexOf(before);
  } else {
    // After the last card of the target column; an empty column keeps the card where it was.
    const inCol = (groupByColumn(clips, columns).get(column) ?? []).filter((c) => c.id !== id);
    const last = inCol.at(-1);
    at = last ? rest.indexOf(last.id) + 1 : Math.min(from, rest.length);
  }
  return { ids: [...rest.slice(0, at), id, ...rest.slice(at)], status: column };
}

/** Remove a column: its cards move to the neighbouring column (left, else right). At least one column stays. */
export function removeColumn(columns: readonly BoardColumn[], id: string): { columns: BoardColumn[]; fallback: string } | null {
  if (columns.length <= 1) return null;
  const i = columns.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const next = columns.filter((c) => c.id !== id);
  return { columns: next, fallback: (columns[i - 1] ?? columns[i + 1])!.id };
}
