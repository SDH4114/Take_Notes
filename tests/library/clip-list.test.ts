import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clip } from '@/src/core/types';

vi.mock('@/src/core/storage', () => ({ folders: { get: async () => [], set: async () => {} } }));
vi.mock('@/src/core/messages', () => ({ send: vi.fn(), onBroadcast: vi.fn(() => () => {}) }));

import { UiProvider } from '@/src/ui/components';
import { ClipList } from '@/src/library/Lists';

const clip = (id: string, order: number, section?: string): Clip => ({
  id, projectId: 'p1', kind: 'page', title: `Note ${id}`, html: '', markdown: '', tags: [], order, assetIds: [], section,
  source: { url: '', title: id, authors: [], accessed: '' }, createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-01T10:00:00.000Z',
});

function mount() {
  const props = {
    clips: [clip('r', 0), clip('a', 1, 'Chapter 1'), clip('b', 2, 'Chapter 1'), clip('c', 3, 'Chapter 2')],
    projects: [], folders: ['Chapter 1', 'Chapter 2', 'Empty'], selected: undefined as string | undefined, canReorder: true,
    onSelect: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onReorder: vi.fn(), onRenameFolder: vi.fn(), onDeleteFolder: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const draw = (over: { hideEmptyFolders?: boolean } = {}) =>
    act(() => render(h(UiProvider, null, h(ClipList, { ...props, ...over })), host));
  return { host, props, draw };
}
const titles = (host: HTMLElement) => [...host.querySelectorAll('.clip-item .item-title')].map((e) => e.textContent);

describe('ClipList folders', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders root notes and folder groups with counts, including empty folders', async () => {
    const { host, draw } = mount();
    await draw();
    const heads = [...host.querySelectorAll('.folder-head')];
    expect(heads.map((x) => x.querySelector('.folder-name')?.textContent)).toEqual(['Chapter 1', 'Chapter 2', 'Empty']);
    expect(heads.map((x) => x.querySelector('.nav-count')?.textContent)).toEqual(['2', '1', '0']);
    expect(host.querySelectorAll('.folder-root .clip-item')).toHaveLength(1);
    expect(titles(host)).toEqual(['Note r', 'Note a', 'Note b', 'Note c']);
    expect(host.querySelector('.folder-empty')).not.toBeNull();
  });

  it('hides empty folders when asked', async () => {
    const { host, draw } = mount();
    await draw({ hideEmptyFolders: true });
    expect([...host.querySelectorAll('.folder-name')].map((x) => x.textContent)).toEqual(['Chapter 1', 'Chapter 2']);
  });

  it('collapsing a folder hides its notes and expanding restores them', async () => {
    const { host, draw } = mount();
    await draw();
    const head = host.querySelector('.folder-head') as HTMLElement;
    expect(head.getAttribute('aria-expanded')).toBe('true');
    await act(() => head.click());
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(titles(host)).toEqual(['Note r', 'Note c']);
    await act(() => head.click());
    expect(titles(host)).toEqual(['Note r', 'Note a', 'Note b', 'Note c']);
  });

  it('rename and delete folder buttons call callbacks without toggling the folder', async () => {
    const { host, props, draw } = mount();
    await draw();
    const head = host.querySelectorAll('.folder-head')[1] as HTMLElement;
    const [rename, del] = [...head.querySelectorAll('.folder-actions button')] as HTMLElement[];
    await act(() => rename!.click());
    expect(props.onRenameFolder).toHaveBeenCalledWith('Chapter 2');
    await act(() => del!.click());
    expect(props.onDeleteFolder).toHaveBeenCalledWith('Chapter 2');
    expect(head.getAttribute('aria-expanded')).toBe('true');
  });

  it('selecting a note calls onSelect; its trash button calls onDelete only', async () => {
    const { host, props, draw } = mount();
    await draw();
    const second = host.querySelectorAll('.clip-item')[1] as HTMLElement;
    await act(() => second.click());
    expect(props.onSelect).toHaveBeenCalledWith('a');
    const buttons = second.querySelectorAll('.item-actions button');
    await act(() => (buttons[buttons.length - 1] as HTMLElement).click());
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect((props.onDelete.mock.calls[0] as unknown as [Clip])[0].id).toBe('a');
    expect(props.onSelect).toHaveBeenCalledTimes(1);
  });
});
