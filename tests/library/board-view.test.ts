import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardColumn, Clip } from '@/src/core/types';

const boardSet = vi.fn(async (_p: string | null, _c: BoardColumn[]) => {});
vi.mock('@/src/core/storage', () => ({
  boards: { get: async () => null, set: (p: string | null, c: BoardColumn[]) => boardSet(p, c) },
}));

import { UiProvider } from '@/src/ui/components';
import { BoardView } from '@/src/library/BoardView';

const flush = () => new Promise<void>((r) => setTimeout(r, 50));
const clip = (id: string, order: number, status?: string): Clip => ({
  id, projectId: 'p1', kind: 'page', title: `Card ${id}`, html: '', markdown: '', tags: [], order, assetIds: [], status,
  source: { url: '', title: id, authors: [], accessed: '' }, createdAt: '', updatedAt: '',
});

function mount(clips: Clip[]) {
  const props = {
    onOpen: vi.fn(), onMove: vi.fn(async () => {}), onColumnRemoved: vi.fn(async () => {}),
    onCreate: vi.fn(async () => {}), onDelete: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  return act(() => render(h(UiProvider, null, h(BoardView, { projectId: 'p1', clips, highlights: [], ...props })), host))
    .then(flush).then(() => ({ host, ...props }));
}
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  el.value = value;
  await act(() => { el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const submit = (form: Element) => act(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

describe('BoardView', () => {
  beforeEach(() => { document.body.innerHTML = ''; boardSet.mockClear(); });

  it('renders default columns with cards grouped by status', async () => {
    const { host } = await mount([clip('a', 0), clip('b', 1, 'doing')]);
    const cols = [...host.querySelectorAll('.board-col')];
    expect(cols).toHaveLength(3);
    expect(cols[0]!.querySelectorAll('.board-card')).toHaveLength(1);
    expect(cols[1]!.querySelector('.card-title-text')?.textContent).toBe('Card b');
  });

  it('checking a card moves it to the done column', async () => {
    const { host, onMove } = await mount([clip('a', 0), clip('b', 1, 'doing')]);
    await act(() => (host.querySelector('.board-card .todo-check') as HTMLElement).click());
    expect(onMove).toHaveBeenCalledTimes(1);
    const [card, status, ids] = onMove.mock.calls[0] as unknown as [Clip, string, string[]];
    expect(card.id).toBe('a');
    expect(status).toBe('done');
    expect(ids).toEqual(['a', 'b']); // done column was empty: Notes order is kept
  });

  it('unchecking a done card moves it back to the first column', async () => {
    const { host, onMove } = await mount([clip('a', 0, 'done')]);
    const check = host.querySelector('.todo-check') as HTMLElement;
    expect(check.getAttribute('aria-checked')).toBe('true');
    await act(() => check.click());
    expect((onMove.mock.calls[0] as unknown as [Clip, string])[1]).toBe('todo');
  });

  it('"add card" form calls onCreate(column, title, text) with trimmed values', async () => {
    const { host, onCreate } = await mount([]);
    const cols = host.querySelectorAll('.board-col');
    await act(() => (cols[1]!.querySelector('.board-new-card') as HTMLElement).click());
    expect((host.querySelector('.board-compose button[type=submit]') as HTMLButtonElement).disabled).toBe(true);
    await type(host.querySelector('.board-compose-title') as HTMLInputElement, '  Write intro ');
    await type(host.querySelector('.board-compose-text') as HTMLTextAreaElement, ' some text ');
    await submit(host.querySelector('.board-compose')!);
    await flush();
    expect(onCreate).toHaveBeenCalledWith('doing', 'Write intro', 'some text');
    // form stays open for the next card and is cleared
    expect((host.querySelector('.board-compose-title') as HTMLInputElement).value).toBe('');
  });

  it('does not create a card with a blank title', async () => {
    const { host, onCreate } = await mount([]);
    await act(() => (host.querySelector('.board-new-card') as HTMLElement).click());
    await type(host.querySelector('.board-compose-title') as HTMLInputElement, '   ');
    await submit(host.querySelector('.board-compose')!);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('new column with "collect completed" is saved as the only done column', async () => {
    const { host } = await mount([]);
    await act(() => (host.querySelector('.board-add') as HTMLElement).click());
    await type(host.querySelector('.board-new-col input.input') as HTMLInputElement, ' Archive ');
    await act(() => (host.querySelector('.board-new-col input[type=checkbox]') as HTMLInputElement).click());
    await submit(host.querySelector('.board-new-col')!);
    await flush();
    expect(boardSet).toHaveBeenCalledTimes(1);
    const [pid, cols] = boardSet.mock.calls[0]!;
    expect(pid).toBe('p1');
    expect(cols).toHaveLength(4);
    expect(cols[3]).toMatchObject({ name: 'Archive', done: true });
    expect(cols.filter((c) => c.done)).toHaveLength(1);
  });

  it('new column without the checkbox leaves the done column alone', async () => {
    const { host } = await mount([]);
    await act(() => (host.querySelector('.board-add') as HTMLElement).click());
    await type(host.querySelector('.board-new-col input.input') as HTMLInputElement, 'Ideas');
    await submit(host.querySelector('.board-new-col')!);
    await flush();
    const cols = boardSet.mock.calls[0]![1];
    expect(cols[3]).toMatchObject({ name: 'Ideas' });
    expect(cols[3]!.done).toBeFalsy();
    expect(cols[2]!.done).toBe(true);
  });
});
