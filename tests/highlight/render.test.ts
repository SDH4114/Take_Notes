import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnchor } from '@/src/highlight/anchor';
import {
  clearHighlights, installMarkClicks, recolorHighlight, removeHighlight, renderHighlight, wrapRange,
} from '@/src/highlight/render';
import { rangeForRaw } from './helpers';

const html = (s: string) => { document.body.innerHTML = s; };
const marks = (id: string) => [...document.querySelectorAll<HTMLElement>(`mark[data-tn-id="${id}"]`)];

beforeEach(() => {
  document.head.innerHTML = '';
  html('<p>Hello <b>brave new</b> world and more</p>');
});

describe('wrapRange', () => {
  it('wraps each text node in its own mark and keeps the text intact', () => {
    const before = document.body.textContent;
    const ms = wrapRange(rangeForRaw('lo brave new wor'), 'a', 'green');
    expect(ms.map((m) => m.textContent)).toEqual(['lo ', 'brave new', ' wor']);
    expect(ms.every((m) => m.className === 'tn-hl' && m.style.getPropertyValue('--tn-hl-rgb') === '74,222,128')).toBe(true);
    expect(document.body.textContent).toBe(before);
    expect(document.querySelector('b')!.firstElementChild!.tagName).toBe('MARK');
  });

  it('handles a range inside a single text node', () => {
    const ms = wrapRange(rangeForRaw('world'), 'a', 'yellow');
    expect(ms).toHaveLength(1);
    expect(document.querySelector('p')!.innerHTML).toBe(
      'Hello <b>brave new</b> <mark class="tn-hl" style="--tn-hl-rgb: 250,204,21 !important;" data-tn-id="a">world</mark> and more',
    );
  });

  it('does not wrap whitespace-only text nodes between blocks', () => {
    html('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    const ms = wrapRange(rangeForRaw('one\ntwo'), 'a', 'yellow');
    expect(ms.map((m) => m.textContent)).toEqual(['one', 'two']);
    expect(document.querySelector('ul')!.querySelectorAll(':scope > mark')).toHaveLength(0);
  });

  it('injects the style element only once', () => {
    wrapRange(rangeForRaw('Hello'), 'a', 'yellow');
    wrapRange(rangeForRaw('world'), 'b', 'blue');
    expect(document.querySelectorAll('style#tn-hl-style')).toHaveLength(1);
  });
});

describe('renderHighlight / removeHighlight / recolor / clear', () => {
  it('renders from an anchor and returns false when it cannot be resolved', () => {
    const anchor = createAnchor(rangeForRaw('new world'));
    expect(renderHighlight({ id: 'h1', color: 'pink', anchor })).toBe(true);
    expect(marks('h1').map((m) => m.textContent).join('')).toBe('new world');
    expect(renderHighlight({ id: 'h2', color: 'pink', anchor: { exact: 'absent', prefix: '', suffix: '' } })).toBe(false);
  });

  it('removes by id and restores the original DOM text structure', () => {
    const anchor = createAnchor(rangeForRaw('brave new'));
    renderHighlight({ id: 'h1', color: 'blue', anchor });
    removeHighlight('h1');
    expect(marks('h1')).toHaveLength(0);
    expect(document.querySelector('p')!.innerHTML).toBe('Hello <b>brave new</b> world and more');
  });

  it('recolors every mark of the highlight', () => {
    renderHighlight({ id: 'h1', color: 'blue', anchor: createAnchor(rangeForRaw('lo brave')) });
    recolorHighlight('h1', '#123456');
    expect(marks('h1').every((m) => m.style.getPropertyValue('--tn-hl-rgb') === '18,52,86')).toBe(true);
  });

  it('never lets an invalid color reach page CSS', () => {
    const [m] = wrapRange(rangeForRaw('world'), 'x', 'red;} body{display:none');
    expect(m!.style.getPropertyValue('--tn-hl-rgb')).toBe('250,204,21');
  });

  it('clearHighlights removes all marks', () => {
    renderHighlight({ id: 'h1', color: 'blue', anchor: createAnchor(rangeForRaw('Hello')) });
    renderHighlight({ id: 'h2', color: 'blue', anchor: createAnchor(rangeForRaw('more')) });
    clearHighlights();
    expect(document.querySelectorAll('mark.tn-hl')).toHaveLength(0);
  });

  it('can re-anchor again after removal even with the DOM re-split', () => {
    const anchor = createAnchor(rangeForRaw('brave new'));
    renderHighlight({ id: 'h1', color: 'blue', anchor });
    clearHighlights();
    expect(renderHighlight({ id: 'h1', color: 'blue', anchor })).toBe(true);
  });
});

describe('installMarkClicks', () => {
  it('reports the highlight id when a mark is clicked', () => {
    renderHighlight({ id: 'h1', color: 'blue', anchor: createAnchor(rangeForRaw('world')) });
    const cb = vi.fn();
    const off = installMarkClicks(cb);
    marks('h1')[0]!.click();
    expect(cb).toHaveBeenCalledWith('h1', marks('h1')[0]);
    off();
    marks('h1')[0]!.click();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
