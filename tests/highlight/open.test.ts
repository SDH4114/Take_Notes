import { describe, expect, it, vi } from 'vitest';
import type { Highlight } from '@/src/core/types';
import { openHighlight, type OpenDeps, type TabsFacade } from '@/src/highlight/background';

const H = { id: 'h1', url: 'https://a.example/p' } as Highlight;

function setup(opts: {
  tabs?: Array<{ id: number; url: string; windowId?: number }>;
  focus?: Array<boolean | Error>;
  highlight?: Highlight | undefined;
} = {}) {
  const focus = [...(opts.focus ?? [true])];
  const tabs: TabsFacade = {
    query: vi.fn(async () => opts.tabs ?? []),
    activate: vi.fn(async () => {}),
    create: vi.fn(async () => ({ id: 77 })),
    waitComplete: vi.fn(async () => {}),
  };
  const sendToTab = vi.fn(async () => {
    const r = focus.length > 1 ? focus.shift()! : focus[0]!;
    if (r instanceof Error) throw r;
    return r;
  });
  const sleep = vi.fn(async () => {});
  const deps: OpenDeps = {
    getHighlight: vi.fn(async () => ('highlight' in opts ? opts.highlight : H)),
    tabs, sleep, sendToTab: sendToTab as never,
  };
  return { deps, tabs, sendToTab, sleep };
}

describe('openHighlight', () => {
  it('reuses an already open tab with the same normalized url', async () => {
    const s = setup({ tabs: [{ id: 1, url: 'https://b.example/' }, { id: 5, url: 'https://a.example/p?utm_source=x#frag', windowId: 3 }] });
    await openHighlight('h1', s.deps);
    expect(s.tabs.activate).toHaveBeenCalledWith({ id: 5, windowId: 3 });
    expect(s.tabs.create).not.toHaveBeenCalled();
    expect(s.sendToTab).toHaveBeenCalledWith(5, 'content/focusHighlight', { id: 'h1' });
  });

  it('opens a new tab, waits for it to load and then focuses', async () => {
    const s = setup({ tabs: [{ id: 1, url: 'https://b.example/' }] });
    const order: string[] = [];
    (s.tabs.waitComplete as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push('wait'); });
    s.sendToTab.mockImplementation((async () => { order.push('send'); return true; }) as never);
    await openHighlight('h1', s.deps);
    expect(s.tabs.create).toHaveBeenCalledWith('https://a.example/p');
    expect(s.tabs.waitComplete).toHaveBeenCalledWith(77, 20000);
    expect(order).toEqual(['wait', 'send']);
    expect(s.sendToTab).toHaveBeenCalledWith(77, 'content/focusHighlight', { id: 'h1' });
  });

  it('retries sending up to 3 times, 500 ms apart, while the content script is not ready', async () => {
    const s = setup({ focus: [new Error('Receiving end does not exist'), new Error('Receiving end does not exist'), true] });
    await openHighlight('h1', s.deps);
    expect(s.sendToTab).toHaveBeenCalledTimes(3);
    expect(s.sleep).toHaveBeenCalledTimes(2);
    expect(s.sleep).toHaveBeenCalledWith(500);
  });

  it('gives up with the last error after 3 failed attempts', async () => {
    const s = setup({ focus: [new Error('no receiver')] });
    await expect(openHighlight('h1', s.deps)).rejects.toThrow('no receiver');
    expect(s.sendToTab).toHaveBeenCalledTimes(3);
  });

  it('throws a translated not-found error when the page has no such highlight', async () => {
    const s = setup({ focus: [false] });
    await expect(openHighlight('h1', s.deps)).rejects.toThrow(/Не удалось найти выделение|Could not find the highlight/);
    expect(s.tabs.create).toHaveBeenCalled(); // the page stays open
    expect(s.sendToTab).toHaveBeenCalledTimes(1); // false is an answer, not a connection failure
  });

  it('throws for an unknown highlight id without opening anything', async () => {
    const s = setup({ highlight: undefined });
    await expect(openHighlight('nope', s.deps)).rejects.toThrow(/Выделение не найдено|Highlight not found/);
    expect(s.tabs.query).not.toHaveBeenCalled();
    expect(s.tabs.create).not.toHaveBeenCalled();
  });
});
