import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { highlights, settings } from '@/src/core/storage';
import type { Highlight } from '@/src/core/types';
import { createHighlightHandlers } from '@/src/highlight/background';

function hl(over: Partial<Highlight> = {}): Highlight {
  return {
    id: 'h1',
    url: 'https://a.example/p',
    color: 'yellow',
    anchor: { exact: 'x', prefix: '', suffix: '' },
    text: 'x',
    source: { url: 'https://a.example/p', title: 'P', authors: [], accessed: '2026-01-01T00:00:00.000Z' },
    projectId: null,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    ...over,
  };
}

const sender = { url: browser.runtime.getURL('/sidepanel.html') } as never;
const h = createHighlightHandlers();
const call = <K extends keyof typeof h>(k: K, p: Parameters<NonNullable<(typeof h)[K]>>[0], from: unknown = sender) =>
  (h[k] as (p: unknown, s: unknown) => Promise<unknown>)(p, from);
const pageSender = (url: string) => ({ url, tab: { id: 1, url } }) as never;

beforeEach(async () => {
  for (const x of await highlights.listAll()) await highlights.delete(x.id);
  await settings.set({ defaultProjectId: null });
});

describe('highlight background handlers', () => {
  it('save fills projectId from settings for a new highlight and sets timestamps', async () => {
    await settings.set({ defaultProjectId: 'proj' });
    const saved = (await call('highlight/save', hl())) as Highlight;
    expect(saved.projectId).toBe('proj');
    expect(saved.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(saved.updatedAt).toBe(saved.createdAt);
    expect((await highlights.listByUrl('https://a.example/p'))[0]!.projectId).toBe('proj');
  });

  it('save keeps createdAt and projectId of an existing highlight on update', async () => {
    await settings.set({ defaultProjectId: 'proj' });
    const first = (await call('highlight/save', hl())) as Highlight;
    await settings.set({ defaultProjectId: 'other' });
    const second = (await call('highlight/save', { ...first, note: 'n', projectId: null })) as Highlight;
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.projectId).toBe('proj');
    expect(second.note).toBe('n');
    expect(second.updatedAt >= first.updatedAt).toBe(true);
  });

  it('save keeps an explicit projectId on a new highlight', async () => {
    await settings.set({ defaultProjectId: 'proj' });
    const saved = (await call('highlight/save', hl({ projectId: 'mine' }))) as Highlight;
    expect(saved.projectId).toBe('mine');
  });

  it('listForUrl normalizes the url', async () => {
    await call('highlight/save', hl());
    const list = (await call('highlight/listForUrl', { url: 'https://a.example/p?utm_source=x#frag' })) as Highlight[];
    expect(list.map((x) => x.id)).toEqual(['h1']);
  });

  it('listAll: undefined = all, null = inbox, id = project', async () => {
    await call('highlight/save', hl({ id: 'a', projectId: null }));
    await call('highlight/save', hl({ id: 'b', projectId: 'p1' }));
    const ids = async (p: { projectId?: string | null }) =>
      ((await call('highlight/listAll', p)) as Highlight[]).map((x) => x.id).sort();
    expect(await ids({})).toEqual(['a', 'b']);
    expect(await ids({ projectId: null })).toEqual(['a']);
    expect(await ids({ projectId: 'p1' })).toEqual(['b']);
  });

  it('delete removes the highlight', async () => {
    await call('highlight/save', hl());
    await call('highlight/delete', { id: 'h1' });
    expect(await highlights.listAll()).toHaveLength(0);
  });
  it('a web page can only touch its own highlights', async () => {
    await call('highlight/save', hl({ id: 'other', url: 'https://b.example/q' }));
    const evil = pageSender('https://a.example/p');
    await expect(call('highlight/save', hl({ id: 'x2', url: 'https://b.example/q' }), evil)).rejects.toThrow();
    await expect(call('highlight/save', hl({ id: 'other' }), evil)).rejects.toThrow(); // id of another page
    await expect(call('highlight/delete', { id: 'other' }, evil)).rejects.toThrow();
    expect(await call('highlight/listForUrl', { url: 'https://b.example/q' }, evil)).toEqual([]);
    await expect(call('highlight/save', hl({ id: 'mine' }), evil)).resolves.toMatchObject({ id: 'mine' });
  });
});

describe('highlight/move', () => {
  it('moves a highlight between projects from extension pages only', async () => {
    await highlights.put(hl({ id: 'm1', projectId: null }));
    const moved = (await call('highlight/move', { id: 'm1', projectId: 'p2' })) as Highlight;
    expect(moved.projectId).toBe('p2');
    expect((await highlights.get('m1'))?.projectId).toBe('p2');
    await expect(call('highlight/move', { id: 'm1', projectId: null }, pageSender('https://a.example/p'))).rejects.toThrow();
    await expect(call('highlight/move', { id: 'nope', projectId: null })).rejects.toThrow();
  });
});

describe('highlight long note (body)', () => {
  it('extension pages edit the body, web pages can never change it', async () => {
    const page = 'https://a.example/p';
    await highlights.put(hl({ id: 'b1', url: page }));
    await call('highlight/save', { ...hl({ id: 'b1', url: page }), body: '# Long' });
    expect((await highlights.get('b1'))?.body).toBe('# Long');
    // A page re-saves its stale copy (recolor): body survives.
    await call('highlight/save', { ...hl({ id: 'b1', url: page }), color: '#4ade80', body: 'hacked' }, pageSender(page));
    expect(await highlights.get('b1')).toMatchObject({ body: '# Long', color: '#4ade80' });
    // A new highlight from a page cannot bring a body either.
    await call('highlight/save', { ...hl({ id: 'b2', url: page }), body: 'x' }, pageSender(page));
    expect((await highlights.get('b2'))?.body).toBeUndefined();
  });
});
