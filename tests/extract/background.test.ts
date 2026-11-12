import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import type { ExtractResult } from '@/src/core/types';

const sendToTab = vi.fn();
const broadcast = vi.fn();
vi.mock('@/src/core/messages', async (orig) => ({
  ...(await orig<typeof import('@/src/core/messages')>()),
  sendToTab: (...a: unknown[]) => sendToTab(...a),
  broadcast: (...a: unknown[]) => broadcast(...a),
  resolveTabId: async (id?: number) => id ?? 7,
}));

const { saveClip, setupExtractBackground } = await import('@/src/extract/background');
const storage = await import('@/src/core/storage');

const result: ExtractResult = {
  title: 'T',
  html: '<p>x</p>',
  markdown: 'x',
  source: { url: 'https://a.test/', title: 'T', authors: [], accessed: '2026-01-01T00:00:00.000Z' },
  imageUrls: ['https://a.test/i.png'],
};

beforeEach(async () => {
  sendToTab.mockReset();
  broadcast.mockReset();
  const d = await storage.db();
  await d.clear('clips');
  await d.clear('kv');
});

describe('saveClip', () => {
  it('saves a page clip into the default project and broadcasts', async () => {
    sendToTab.mockResolvedValue(result);
    await storage.projects.put({ id: 'p1', name: 'P', citationStyle: 'gost', createdAt: '', updatedAt: '' });
    await storage.settings.set({ defaultProjectId: 'p1' });
    const clip = await saveClip('page', {});
    expect(sendToTab).toHaveBeenCalledWith(7, 'content/extractPage');
    expect(clip).toMatchObject({ kind: 'page', projectId: 'p1', title: 'T', markdown: 'x', order: 0, assetIds: [], tags: [] });
    expect(await storage.clips.get(clip!.id)).toEqual(clip);
    expect(broadcast).toHaveBeenCalledWith('data/changed', { kind: 'clip' });
  });

  it('explicit projectId (even null/Inbox) beats the default and order increments', async () => {
    sendToTab.mockResolvedValue(result);
    await storage.settings.set({ defaultProjectId: 'p1' });
    const a = await saveClip('page', { projectId: null, tabId: 3 });
    const b = await saveClip('page', { projectId: null });
    expect(sendToTab).toHaveBeenCalledWith(3, 'content/extractPage');
    expect(a!.projectId).toBeNull();
    expect([a!.order, b!.order]).toEqual([0, 1]);
  });

  it('returns null and saves nothing for an empty selection', async () => {
    sendToTab.mockResolvedValue(null);
    expect(await saveClip('selection', {})).toBeNull();
    expect(await storage.clips.listByProject(null)).toEqual([]);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('exposes message handlers', () => {
    // fake-browser throws on unimplemented event APIs, so stub them.
    for (const ev of [browser.runtime.onInstalled, browser.contextMenus.onClicked, browser.commands.onCommand]) ev.addListener = vi.fn();
    const h = setupExtractBackground();
    expect(typeof h['clip/savePage']).toBe('function');
    expect(typeof h['clip/saveSelection']).toBe('function');
  });
});
