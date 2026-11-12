import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { activeProjectId, changedSettings, projects, settings } from '@/src/core/storage';
import { DEFAULT_SETTINGS } from '@/src/core/types';

describe('changedSettings', () => {
  it('returns only changed fields, comparing nested objects by value', () => {
    const prev = { ...DEFAULT_SETTINGS, defaultProjectId: 'old' };
    const next = { ...prev, citationStyle: 'apa' as const, crawl: { ...prev.crawl } };
    expect(changedSettings(prev, next)).toEqual({ citationStyle: 'apa' });
  });

  it('a stale page copy does not overwrite the active project picked elsewhere', async () => {
    const stale = await settings.get();
    await settings.set({ defaultProjectId: 'picked-in-popup' });
    await settings.set(changedSettings(stale, { ...stale, citationStyle: 'mla' }));
    const s = await settings.get();
    expect(s.defaultProjectId).toBe('picked-in-popup');
    expect(s.citationStyle).toBe('mla');
  });
});

describe('activeProjectId', () => {
  it('is the stored project when it exists, else null (Inbox)', async () => {
    await projects.put({ id: 'p', name: 'P', citationStyle: 'gost', createdAt: '', updatedAt: '' });
    await settings.set({ defaultProjectId: 'p' });
    expect(await activeProjectId()).toBe('p');
    await settings.set({ defaultProjectId: 'gone' });
    expect(await activeProjectId()).toBeNull();
    await settings.set({ defaultProjectId: null });
    expect(await activeProjectId()).toBeNull();
  });
});
