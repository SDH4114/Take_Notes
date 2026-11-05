import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Highlight } from '@/src/core/types';
import { createHighlightController } from '@/src/highlight/content';
import { createAnchor } from '@/src/highlight/anchor';
import { rangeForRaw } from './helpers';

const html = (s: string) => { document.body.innerHTML = s; };
const markText = (id?: string) =>
  [...document.querySelectorAll(id ? `mark[data-tn-id="${id}"]` : 'mark.tn-hl')].map((m) => m.textContent).join('|');

function select(sub: string) {
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(rangeForRaw(sub));
}

function stored(over: Partial<Highlight> = {}): Highlight {
  const anchor = createAnchor(rangeForRaw('world'));
  return {
    id: 'old', url: 'http://localhost:3000/', color: 'green', anchor, text: 'world',
    source: { url: 'http://localhost:3000/', title: 't', authors: [], accessed: '' },
    projectId: null, createdAt: '', updatedAt: '', ...over,
  };
}

let send: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.head.innerHTML = '<title>Doc title</title>';
  html('<p>Hello <b>big</b> world</p>');
  send = vi.fn(async (type: string, payload: unknown) => (type === 'highlight/save' ? payload : []));
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); window.getSelection()!.removeAllRanges(); });

describe('highlightSelection', () => {
  it('renders the highlight and saves it with url, source and null projectId', async () => {
    const c = createHighlightController({ send: send as never, location: new URL('https://x.test/a?utm_source=q#h') });
    select('lo big');
    const h = await c.highlightSelection('pink');
    expect(markText()).toBe('lo |big');
    expect(h).toMatchObject({
      url: 'https://x.test/a', color: 'pink', text: 'lo big', projectId: null,
      anchor: { exact: 'lo big' },
    });
    expect(h!.source.title).toBe('Doc title');
    expect(send).toHaveBeenCalledWith('highlight/save', expect.objectContaining({ id: h!.id }));
    expect(window.getSelection()!.isCollapsed).toBe(true);
  });

  it('defaults to yellow and returns null without a selection', async () => {
    const c = createHighlightController({ send: send as never });
    expect(await c.highlightSelection()).toBeNull();
    select('world');
    expect((await c.highlightSelection())!.color).toBe('yellow');
  });

  it('removes the mark again when saving fails', async () => {
    send.mockRejectedValueOnce(new Error('boom'));
    const c = createHighlightController({ send: send as never });
    select('world');
    await expect(c.highlightSelection()).rejects.toThrow('boom');
    expect(markText()).toBe('');
  });

  it('ignores a selection inside a textarea', async () => {
    html('<textarea id="t">abc def</textarea><p>x</p>');
    const c = createHighlightController({ send: send as never });
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 3);
    expect(await c.highlightSelection()).toBeNull();
  });
});

describe('refresh', () => {
  it('lists highlights for the normalized url and renders them, replacing old marks', async () => {
    send.mockImplementation(async (type: string) => (type === 'highlight/listForUrl' ? [stored()] : undefined));
    const c = createHighlightController({ send: send as never, location: new URL('https://x.test/a#frag') });
    await c.refresh();
    await c.refresh();
    expect(send).toHaveBeenCalledWith('highlight/listForUrl', { url: 'https://x.test/a' });
    expect(markText('old')).toBe('world');
    expect(document.querySelectorAll('mark.tn-hl')).toHaveLength(1);
  });

  it('retries unresolved anchors once after a delay (late-loading content)', async () => {
    const late = stored({ anchor: { exact: 'late arrival', prefix: '', suffix: '' }, id: 'late' });
    send.mockImplementation(async (type: string) => (type === 'highlight/listForUrl' ? [late] : undefined));
    const c = createHighlightController({ send: send as never, retryDelayMs: 1500 });
    await c.refresh();
    expect(markText('late')).toBe('');
    document.body.insertAdjacentHTML('beforeend', '<p>a late arrival here</p>');
    await vi.advanceTimersByTimeAsync(1600);
    expect(markText('late')).toBe('late arrival');
  });
});

describe('marks interaction', () => {
  it('delete from the popover removes the mark and sends highlight/delete', async () => {
    send.mockImplementation(async (type: string) => (type === 'highlight/listForUrl' ? [stored()] : undefined));
    const c = createHighlightController({ send: send as never });
    await c.refresh();
    c.start();
    (document.querySelector('mark.tn-hl') as HTMLElement).click();
    const root = document.querySelector('#tn-popover-host')!.shadowRoot!;
    (root.querySelector('button.del') as HTMLElement).click();
    expect(send).toHaveBeenCalledWith('highlight/delete', { id: 'old' });
    expect(markText()).toBe('');
    c.stop();
  });

  it('recolor from the popover updates the mark and saves', async () => {
    send.mockImplementation(async (type: string) => (type === 'highlight/listForUrl' ? [stored()] : undefined));
    const c = createHighlightController({ send: send as never });
    await c.refresh();
    c.start();
    (document.querySelector('mark.tn-hl') as HTMLElement).click();
    const root = document.querySelector('#tn-popover-host')!.shadowRoot!;
    (root.querySelector('button.sw[data-color="purple"]') as HTMLElement).click();
    expect(document.querySelector('mark.tn-hl')!.className).toBe('tn-hl tn-hl-purple');
    expect(send).toHaveBeenCalledWith('highlight/save', expect.objectContaining({ id: 'old', color: 'purple' }));
    c.stop();
  });

  it('note from the popover is saved on close', async () => {
    send.mockImplementation(async (type: string) => (type === 'highlight/listForUrl' ? [stored()] : undefined));
    const c = createHighlightController({ send: send as never });
    await c.refresh();
    c.start();
    (document.querySelector('mark.tn-hl') as HTMLElement).click();
    const ta = document.querySelector('#tn-popover-host')!.shadowRoot!.querySelector('textarea')!;
    ta.value = 'remember';
    ta.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(600);
    expect(send).toHaveBeenCalledWith('highlight/save', expect.objectContaining({ id: 'old', note: 'remember' }));
    c.stop();
  });
});
