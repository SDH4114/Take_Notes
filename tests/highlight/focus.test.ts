import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Highlight } from '@/src/core/types';
import { createHighlightController } from '@/src/highlight/content';
import { createAnchor } from '@/src/highlight/anchor';
import { rangeForRaw } from './helpers';

function stored(over: Partial<Highlight> = {}): Highlight {
  const anchor = createAnchor(rangeForRaw('world'));
  return {
    id: 'old', url: 'http://localhost:3000/', color: 'green', anchor, text: 'world',
    source: { url: 'http://localhost:3000/', title: 't', authors: [], accessed: '' },
    projectId: null, createdAt: '', updatedAt: '', ...over,
  };
}

const addMark = (id: string, text = 'x') =>
  document.body.insertAdjacentHTML('beforeend', `<p><mark class="tn-hl tn-hl-green" data-tn-id="${id}">${text}</mark></p>`);
const marks = (id: string) => [...document.querySelectorAll<HTMLElement>(`mark[data-tn-id="${id}"]`)];

let send: ReturnType<typeof vi.fn>;
let scroll: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<p>Hello world</p>';
  send = vi.fn(async () => []);
  scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll as never;
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('focusHighlight', () => {
  it('finds a mark that renders later, scrolls to it centered and returns true', async () => {
    const c = createHighlightController({ send: send as never });
    const p = c.focusHighlight('a');
    await vi.advanceTimersByTimeAsync(1000);
    addMark('a');
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('uses instant scrolling with prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    addMark('a');
    const c = createHighlightController({ send: send as never });
    expect(await c.focusHighlight('a')).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('returns false when the mark never appears', async () => {
    const c = createHighlightController({ send: send as never });
    const p = c.focusHighlight('missing');
    await vi.advanceTimersByTimeAsync(6000);
    expect(await p).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('flashes all marks of the highlight, then returns them to normal', async () => {
    addMark('a', 'one');
    addMark('a', 'two');
    addMark('b', 'other');
    const c = createHighlightController({ send: send as never, flashMs: 800 });
    expect(await c.focusHighlight('a')).toBe(true);
    expect(marks('a').every((m) => m.classList.contains('tn-hl-flash'))).toBe(true);
    expect(marks('b')[0]!.classList.contains('tn-hl-flash')).toBe(false);
    await vi.advanceTimersByTimeAsync(900);
    expect(marks('a').some((m) => m.classList.contains('tn-hl-flash'))).toBe(false);
  });

  it('renders the highlight from its anchor once the text shows up (SPA)', async () => {
    const late = stored({ id: 'late', anchor: { exact: 'late arrival', prefix: '', suffix: '' } });
    send.mockImplementation(async (type: string) => (type === 'highlight/listForUrl' ? [late] : undefined));
    const c = createHighlightController({ send: send as never, retryDelayMs: 100000 });
    await c.refresh();
    expect(marks('late')).toHaveLength(0);
    const p = c.focusHighlight('late');
    await vi.advanceTimersByTimeAsync(800);
    document.body.insertAdjacentHTML('beforeend', '<p>a late arrival here</p>');
    await vi.advanceTimersByTimeAsync(1200);
    expect(await p).toBe(true);
    expect(marks('late')[0]!.textContent).toBe('late arrival');
  });

  it('as a last resort re-reads the highlight from storage and renders it', async () => {
    send.mockImplementation(async (type: string) => (type === 'highlight/listForUrl' ? [stored()] : undefined));
    const c = createHighlightController({ send: send as never });
    const p = c.focusHighlight('old');
    await vi.advanceTimersByTimeAsync(6000);
    expect(await p).toBe(true);
    expect(marks('old')[0]!.textContent).toBe('world');
  });
});
