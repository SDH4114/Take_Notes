import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Highlight } from '@/src/core/types';

const now = '2026-06-01T10:00:00.000Z';
const stored = {
  id: 'h1', projectId: 'p1', url: 'https://site.test/a', text: 'quoted text', color: '#ffd400',
  source: { url: 'https://site.test/a', title: 'Site', authors: [], accessed: now }, createdAt: now, updatedAt: now,
  note: 'old short', body: '# Long\n\nbody',
} as unknown as Highlight;

const send = vi.fn(async (_t: string, _p: unknown) => undefined);
vi.mock('@/src/core/messages', () => ({ send: (t: string, p: unknown) => send(t, p), onBroadcast: vi.fn(() => () => {}) }));
vi.mock('@/src/core/storage', () => ({
  books: { get: async () => undefined },
  // The stored record differs from the prop (text) to prove the save merges onto storage, not onto stale props.
  highlights: { get: vi.fn(async () => ({ ...stored, text: 'stored text' })) },
}));
// CodeMirror is not drivable in jsdom: a textarea with the same props contract.
vi.mock('@/src/ui/editor', () => ({
  MarkdownEditor: (p: { value: string; onChange: (v: string) => void }) =>
    h('textarea', { class: 'fake-editor', value: p.value, onInput: (e: Event) => p.onChange((e.currentTarget as HTMLTextAreaElement).value) }),
}));

import { UiProvider } from '@/src/ui/components';
import { HighlightPane } from '@/src/library/Panes';

const mount = async (hl: Highlight) => {
  const host = document.createElement('div');
  document.body.append(host);
  const props = { h: hl, projects: [], onJump: vi.fn(), onDelete: vi.fn(), onMove: vi.fn(), onOpenNote: vi.fn() };
  await act(() => render(h(UiProvider, null, h(HighlightPane, props)), host));
  return host;
};
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  el.value = value;
  await act(() => { el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const settle = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('HighlightPane', () => {
  beforeEach(() => { send.mockClear(); document.body.innerHTML = ''; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('renders the existing long note as markdown in view mode', async () => {
    const host = await mount(stored);
    expect(host.querySelector('.md h1')?.textContent).toBe('Long');
    expect((host.querySelector('#hl-short') as HTMLTextAreaElement).value).toBe('old short');
    expect(host.querySelector('.fake-editor')).toBeNull();
  });

  it('autosaves the short note after 600 ms, merged onto the stored highlight', async () => {
    const host = await mount(stored);
    await type(host.querySelector('#hl-short') as HTMLTextAreaElement, '  new short ');
    await settle(500);
    expect(send).not.toHaveBeenCalled();
    await settle(200);
    expect(send).toHaveBeenCalledTimes(1);
    const [kind, payload] = send.mock.calls[0]!;
    expect(kind).toBe('highlight/save');
    // saved as typed (trimming it would move the cursor while typing)
    expect(payload).toMatchObject({ id: 'h1', text: 'stored text', note: '  new short ', body: '# Long\n\nbody' });
  });

  it('debounces rapid typing into a single save', async () => {
    const host = await mount(stored);
    const ta = host.querySelector('#hl-short') as HTMLTextAreaElement;
    await type(ta, 'a');
    await settle(400);
    await type(ta, 'ab');
    await settle(400);
    expect(send).not.toHaveBeenCalled();
    await settle(300);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toMatchObject({ note: 'ab' });
  });

  it('clearing the short note saves it as undefined', async () => {
    const host = await mount(stored);
    await type(host.querySelector('#hl-short') as HTMLTextAreaElement, '   ');
    await settle(700);
    expect((send.mock.calls[0]![1] as Highlight).note).toBeUndefined();
  });

  it('autosaves the long note typed in the editor, keeping the short note', async () => {
    const host = await mount(stored);
    await act(() => (host.querySelectorAll('[role=tab]')[1] as HTMLElement).click()); // modes: view, edit, split
    await type(host.querySelector('.fake-editor') as HTMLTextAreaElement, '## Edited');
    await settle(700);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toMatchObject({ id: 'h1', note: 'old short', body: '## Edited' });
  });

  it('flushes a pending save on unmount', async () => {
    const host = await mount(stored);
    await type(host.querySelector('#hl-short') as HTMLTextAreaElement, 'bye');
    await act(() => render(null, host));
    await settle(10);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toMatchObject({ note: 'bye' });
  });
});
