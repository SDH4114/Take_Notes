import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clip, Project } from '@/src/core/types';

const now = '2026-06-01T10:00:00.000Z';
const project: Project = { id: 'p1', name: 'Coursework', citationStyle: 'gost', createdAt: now, updatedAt: now };
const mkClip = (id: string, title: string, projectId: string | null, order: number): Clip => ({
  id, projectId, kind: 'page', title, html: '', markdown: `# ${title}\n\nbody of ${title}`,
  source: { url: `https://site.test/${id}`, title, authors: [], accessed: now }, tags: [], order, assetIds: [],
  createdAt: now, updatedAt: now,
});
const data: Record<string, Clip[]> = {
  __inbox__: [mkClip('c1', 'Inbox clip', null, 0)],
  p1: [mkClip('c2', 'First clip', 'p1', 0), mkClip('c3', 'Second clip', 'p1', 1)],
};

const sent: [string, unknown][] = [];
vi.mock('@/src/core/messages', () => ({
  send: vi.fn(async (type: string, payload: { projectId?: string | null }) => {
    sent.push([type, payload]);
    switch (type) {
      case 'project/list': return [project];
      case 'highlight/listAll': return [];
      case 'clip/list': return data[payload.projectId ?? '__inbox__'] ?? [];
      default: return undefined;
    }
  }),
  onBroadcast: vi.fn(() => () => {}),
}));
vi.mock('@/src/core/storage', () => ({
  books: { list: async () => [], get: async () => undefined },
  clips: { get: async () => undefined },
}));

import { UiProvider } from '@/src/ui/components';
import { App } from '@/src/library/App';

// Real waiting (not act): Preact schedules passive effects after the next frame/timeout.
const flush = () => new Promise<void>((r) => setTimeout(r, 200));

describe('library App', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn(); // not implemented by jsdom
    sent.length = 0; document.body.innerHTML = ''; });

  it('opens the project from the URL, selects its first clip and keeps the URL in sync', async () => {
    history.replaceState(null, '', '/library.html?project=p1');
    const host = document.createElement('div');
    document.body.append(host);
    await act(() => render(h(UiProvider, null, h(App, null)), host));
    await flush();
    expect(host.querySelector('.list-title')?.textContent).toBe('Coursework');
    expect(host.querySelectorAll('.clip-item')).toHaveLength(2);
    expect((host.querySelector('.title-input') as HTMLInputElement).value).toBe('First clip');
    await flush();
    expect(location.search).toContain('project=p1');
    expect(location.search).toContain('clip=c2');
    // reading mode renders the markdown
    expect(host.querySelector('.md h1')?.textContent).toBe('First clip');

    // selecting another clip moves the selection and URL
    await act(() => (host.querySelectorAll('.clip-item')[1] as HTMLElement).click());
    await flush();
    expect((host.querySelector('.title-input') as HTMLInputElement).value).toBe('Second clip');
    expect(location.search).toContain('clip=c3');

    // arrow keys move the selection in the focused list
    await act(() => { (host.querySelector('.listbox') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
    await flush();
    expect((host.querySelector('.title-input') as HTMLInputElement).value).toBe('First clip');

    // search filters the list
    const search = host.querySelector('.search-input') as HTMLInputElement;
    search.value = 'first';
    await act(() => { search.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(host.querySelectorAll('.clip-item')).toHaveLength(1);
    await act(() => render(null, host));
  });

  it('creates a note in the current project with Mod-N and opens it in the editor', async () => {
    history.replaceState(null, '', '/library.html?project=p1');
    const host = document.createElement('div');
    document.body.append(host);
    await act(() => render(h(UiProvider, null, h(App, null)), host));
    await flush();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })); });
    await flush();
    expect(sent.some(([t, p]) => t === 'clip/create' && (p as { projectId: string }).projectId === 'p1')).toBe(true);
    await act(() => render(null, host));
  });
});
