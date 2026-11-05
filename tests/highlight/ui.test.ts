import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openPopover } from '@/src/highlight/popover';
import { centeredPosition, createSelectionToolbar } from '@/src/highlight/toolbar';

const PALETTE = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa'];

const html = (s: string) => { document.body.innerHTML = s; };
const shadowOf = (sel: string) => (document.querySelector(sel) as HTMLElement).shadowRoot!;

function selectText(el: Element): void {
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
}

describe('openPopover', () => {
  const base = () => ({
    mark: document.querySelector('mark') as HTMLElement,
    color: 'blue',
    palette: PALETTE,
    note: 'old',
    text: 'quoted',
    onColor: vi.fn(),
    onNote: vi.fn(),
    onDelete: vi.fn(),
  });
  beforeEach(() => html('<p>a <mark class="tn-hl" data-tn-id="h1">quoted</mark> b</p>'));
  afterEach(() => { document.querySelectorAll('#tn-popover-host').forEach((e) => e.remove()); vi.useRealTimers(); });

  it('renders in a shadow root with 5 swatches, the current note and marks the active color', () => {
    openPopover(base());
    const root = shadowOf('#tn-popover-host');
    expect(root.querySelectorAll('button.sw')).toHaveLength(5);
    expect((root.querySelector('textarea') as HTMLTextAreaElement).value).toBe('old');
    expect(root.querySelector('button.sw.active')!.getAttribute('data-color')).toBe('#60a5fa'); // legacy name → hex
    expect(document.body.querySelector('#tn-popover-host textarea')).toBeNull();
  });

  it('calls onColor and onDelete', () => {
    const o = base();
    openPopover(o);
    const root = shadowOf('#tn-popover-host');
    (root.querySelector('button.sw[data-color="#f472b6"]') as HTMLElement).click();
    expect(o.onColor).toHaveBeenCalledWith('#f472b6');
    (root.querySelector('button.del') as HTMLElement).click();
    expect(o.onDelete).toHaveBeenCalled();
    expect(document.querySelector('#tn-popover-host')).toBeNull();
  });

  it('debounces the note and flushes it on close', () => {
    vi.useFakeTimers();
    const o = base();
    const close = openPopover(o);
    const ta = shadowOf('#tn-popover-host').querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'new note';
    ta.dispatchEvent(new Event('input'));
    expect(o.onNote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(o.onNote).toHaveBeenCalledWith('new note');
    ta.value = 'newer';
    ta.dispatchEvent(new Event('input'));
    close();
    expect(o.onNote).toHaveBeenLastCalledWith('newer');
  });

  it('does not re-save an unchanged note on close', () => {
    const o = base();
    openPopover(o)();
    expect(o.onNote).not.toHaveBeenCalled();
  });

  it('closes on Escape and keeps a single instance', () => {
    openPopover(base());
    openPopover(base());
    expect(document.querySelectorAll('#tn-popover-host')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('#tn-popover-host')).toBeNull();
  });

  it('copies the text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    openPopover(base());
    (shadowOf('#tn-popover-host').querySelector('button.copy') as HTMLElement).click();
    expect(writeText).toHaveBeenCalledWith('quoted');
  });
});

describe('popover icon buttons', () => {
  beforeEach(() => html('<p>a <mark class="tn-hl" data-tn-id="h1">quoted</mark> b</p>'));
  afterEach(() => document.querySelectorAll('#tn-popover-host').forEach((e) => e.remove()));

  it('copy and delete are icon buttons (inline svg) with accessible labels; copy confirms via its title', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    openPopover({
      mark: document.querySelector('mark') as HTMLElement, color: 'blue', note: '', text: 'q',
      onColor: vi.fn(), onNote: vi.fn(), onDelete: vi.fn(),
    });
    const root = shadowOf('#tn-popover-host');
    const copy = root.querySelector('button.copy') as HTMLElement;
    const del = root.querySelector('button.del') as HTMLElement;
    expect(copy.querySelector('svg')).not.toBeNull();
    expect(del.querySelector('svg')).not.toBeNull();
    expect(copy.getAttribute('aria-label')).toBeTruthy();
    expect(del.getAttribute('aria-label')).toBeTruthy();
    const before = copy.title;
    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(copy.title).not.toBe(before);
  });
});

describe('createSelectionToolbar', () => {
  let toolbar: ReturnType<typeof createSelectionToolbar>;
  const onPick = vi.fn();
  const host = () => document.querySelector('#tn-toolbar-host') as HTMLElement | null;
  const shown = () => !!host() && host()!.style.display !== 'none';

  beforeEach(() => {
    vi.useFakeTimers();
    onPick.mockReset();
    html('<p id="p">Some selectable text</p><textarea id="ta">typed text</textarea><div id="ce" contenteditable="true">edit me</div>');
    toolbar = createSelectionToolbar(onPick);
  });
  afterEach(() => { toolbar.destroy(); vi.useRealTimers(); window.getSelection()!.removeAllRanges(); });

  const showBubble = async () => {
    selectText(document.getElementById('p')!);
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    await Promise.resolve(); await Promise.resolve(); // palette promise
  };

  it('collapsed: main color + arrow; arrow expands the rest; picking calls onPick', async () => {
    toolbar.destroy();
    toolbar = createSelectionToolbar(onPick, async () => ({ colors: PALETTE, defaultColor: '#facc15' }));
    await showBubble();
    expect(shown()).toBe(true);
    const root = host()!.shadowRoot!;
    const bar = root.querySelector('.bar')!;
    expect(root.querySelectorAll('.bar > button.sw')).toHaveLength(1);
    expect(root.querySelectorAll('.rest button.sw')).toHaveLength(4);
    expect(bar.classList.contains('open')).toBe(false);
    const more = root.querySelector('button.more') as HTMLElement;
    more.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
    more.click();
    vi.advanceTimersByTime(100); // a mouseup inside the bubble must not re-run update() and collapse it
    expect(bar.classList.contains('open')).toBe(true);
    (root.querySelectorAll('.rest button.sw')[1] as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith('#60a5fa');
    expect(shown()).toBe(false);
  });

  it('a single-color palette shows no arrow', async () => {
    toolbar.destroy();
    toolbar = createSelectionToolbar(onPick, async () => ({ colors: ['#ff0000'], defaultColor: '#ff0000' }));
    await showBubble();
    const root = host()!.shadowRoot!;
    expect(root.querySelector('button.more')).toBeNull();
    (root.querySelector('button.sw') as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith('#ff0000');
  });


  it('prevents default on mousedown so the selection is kept', () => {
    selectText(document.getElementById('p')!);
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    const dot = host()!.shadowRoot!.querySelector('button.sw')!;
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    dot.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('stays hidden for a collapsed selection', () => {
    window.getSelection()!.removeAllRanges();
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    expect(shown()).toBe(false);
  });

  it('stays hidden for selections inside textarea or contenteditable', () => {
    selectText(document.getElementById('ce')!);
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    expect(shown()).toBe(false);

    const ta = document.getElementById('ta') as HTMLTextAreaElement;
    ta.focus();
    ta.select();
    selectText(document.getElementById('p')!); // selection API points to the page, focus stays in the textarea
    ta.focus();
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    expect(shown()).toBe(false);
  });

  it('hides when the selection collapses', () => {
    selectText(document.getElementById('p')!);
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    expect(shown()).toBe(true);
    window.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
    expect(shown()).toBe(false);
  });

  it('destroy removes the host', () => {
    selectText(document.getElementById('p')!);
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(100);
    toolbar.destroy();
    expect(host()).toBeNull();
  });
});

describe('centeredPosition', () => {
  const view = { width: 1000, scrollX: 0, scrollY: 500 };
  it('centers under the selection, 8px below', () => {
    expect(centeredPosition({ left: 400, right: 600, bottom: 100 }, 100, view)).toEqual({ left: 450, top: 608 });
  });
  it('clamps to the viewport edges', () => {
    expect(centeredPosition({ left: 0, right: 20, bottom: 10 }, 100, view).left).toBe(6);
    expect(centeredPosition({ left: 980, right: 1000, bottom: 10 }, 100, view).left).toBe(894);
  });
});
