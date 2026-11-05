import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createZip } from '@/src/export/zip';
import { exportFilename } from '@/src/export/download';
import { readBlob } from './helpers';

describe('createZip', () => {
  it('produces an application/zip blob with the expected paths and contents', async () => {
    const blob = createZip({ 'note.md': '# Привет', 'images/a.png': new Uint8Array([1, 2, 3]) });
    expect(blob.type).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await readBlob(blob)));
    expect(Object.keys(files).sort()).toEqual(['images/a.png', 'note.md']);
    expect(strFromU8(files['note.md']!)).toBe('# Привет');
    expect([...files['images/a.png']!]).toEqual([1, 2, 3]);
  });
});

describe('exportFilename', () => {
  it('slugifies the base name and appends the extension', () => {
    expect(exportFilename('Язык Rust: основы/введение?', 'md')).toBe('Язык Rust основы введение.md');
    expect(exportFilename('', 'zip')).toBe('untitled.zip');
  });
});
