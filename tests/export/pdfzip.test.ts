import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { projects } from '@/src/core/storage';
import { exportT } from '@/src/export/strings';

const downloads: unknown[] = [];
vi.mock('@/src/export/download', async (orig) => ({
  ...(await orig<typeof import('@/src/export/download')>()),
  downloadBlob: async (...a: unknown[]) => { downloads.push(a); },
}));

import { exportProjectPdfZip } from '@/src/export/pdfzip';

describe('exportProjectPdfZip', () => {
  it('rejects a project that does not exist', async () => {
    await expect(exportProjectPdfZip('nope')).rejects.toThrow(exportT()('errNoProject'));
    expect(downloads).toHaveLength(0);
  });

  it('rejects a project without notes', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    await projects.put({ id: 'empty', name: 'Empty', citationStyle: 'gost', createdAt: now, updatedAt: now });
    await expect(exportProjectPdfZip('empty')).rejects.toThrow(exportT()('errEmptyProject'));
    expect(downloads).toHaveLength(0);
  });

  it('rejects an empty inbox', async () => {
    await expect(exportProjectPdfZip(null)).rejects.toThrow(exportT()('errEmptyProject'));
  });
});
