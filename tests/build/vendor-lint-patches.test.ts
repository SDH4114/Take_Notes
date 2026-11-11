import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyReplacements, applyVendorPatch, VENDOR_PATCHES, type VendorPatch } from '@/build/vendor-lint-patches';

const nodeModules = join(__dirname, '../../node_modules');
const read = (file: string) => readFileSync(join(nodeModules, file), 'utf8');
const patchOf = (name: string): VendorPatch => {
  const p = VENDOR_PATCHES.find((x) => x.name === name);
  if (!p) throw new Error(`no patch ${name}`);
  return p;
};

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'tn-vendor-')));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** Writes patched library source to a temp file so it can be loaded like the real module. */
const writePatched = (name: string, ext: string) => {
  const p = patchOf(name);
  const file = join(tmp, `${name}-${n++}${ext}`);
  writeFileSync(file, applyVendorPatch(read(p.file), p));
  return file;
};

describe('applyReplacements', () => {
  it('replaces the exact pattern', () => {
    expect(applyReplacements('a.x = 1; b', 'lib', [{ find: 'a.x = 1', replace: 'f(a, 1)' }])).toBe('f(a, 1); b');
  });

  it('throws when the pattern is missing (library changed)', () => {
    expect(() => applyReplacements('nothing here', 'lib', [{ find: 'a.x = 1', replace: 'y' }])).toThrow(/lib.*a\.x = 1/s);
  });

  it('throws when the pattern occurs a different number of times than expected', () => {
    expect(() => applyReplacements('q q', 'lib', [{ find: 'q', replace: 'z' }])).toThrow(/expected 1.*found 2/s);
    expect(applyReplacements('q q', 'lib', [{ find: 'q', replace: 'z', count: 2 }])).toBe('z z');
  });
});

describe('VENDOR_PATCHES against the installed libraries', () => {
  it.each(VENDOR_PATCHES.map((p) => [p.name, p] as const))('%s matches its file', (_name, p) => {
    expect(() => applyVendorPatch(read(p.file), p)).not.toThrow();
  });

  it('removes innerHTML assignments from readability, dompurify and preact', () => {
    for (const name of ['readability', 'dompurify', 'preact']) {
      const out = applyVendorPatch(read(patchOf(name).file), patchOf(name));
      expect(out, name).not.toMatch(/\.innerHTML\s*=(?!=)/);
    }
  });

  it('removes Function("return this") from pdfmake', () => {
    const out = applyVendorPatch(read(patchOf('pdfmake').file), patchOf('pdfmake'));
    expect(out).not.toMatch(/Function\(\s*['"]return this['"]\s*\)/);
  });

  it('removes dynamic import() from pdf.js and its worker', () => {
    for (const name of ['pdfjs', 'pdfjs-worker']) {
      const out = applyVendorPatch(read(patchOf(name).file), patchOf(name));
      expect(out, name).not.toMatch(/import\(\s*\/\*webpackIgnore/);
    }
  });
});

describe('patched libraries keep their behavior', () => {
  const req = createRequire(import.meta.url);
  const original = req(join(nodeModules, '@mozilla/readability/Readability.js'));
  const patched = req(writePatched('readability', '.cjs'));
  const parse = (R: new (d: Document) => { parse(): unknown }, html: string) =>
    new R(new DOMParser().parseFromString(html, 'text/html')).parse();

  it('Readability: same result when a short page forces retries (page cache restore)', () => {
    const html = '<html><head><title>T</title></head><body><div class="sidebar">nav</div><article><h1>T</h1><p>Short text <b>bold</b>.</p><style>p{}</style></article></body></html>';
    expect(parse(patched, html)).toEqual(parse(original, html));
  });

  it('Readability: same result for noscript image unwrapping', () => {
    const para = '<p>' + 'Long enough paragraph text, with commas, to be content. '.repeat(20) + '</p>';
    const html = `<html><body><article>${para}<img src="data:image/gif;base64,R0lGOD" class="lazy"><noscript><img src="https://e.x/real.jpg" alt="real"></noscript>${para}</article></body></html>`;
    const a = parse(original, html) as { content: string };
    const b = parse(patched, html) as { content: string };
    expect(a.content).toContain('real.jpg');
    expect(b).toEqual(a);
  });

  it('DOMPurify still sanitizes', () => {
    const { default: DOMPurify } = req(writePatched('dompurify', '.mjs'));
    expect(DOMPurify.sanitize('<img src="x" onerror="alert(1)"><b>ok</b>')).toBe('<img src="x"><b>ok</b>');
  });

  it('Preact dangerouslySetInnerHTML renders and updates', () => {
    const { h, render } = req(writePatched('preact', '.mjs'));
    const root = document.createElement('div');
    render(h('div', { dangerouslySetInnerHTML: { __html: '<style>x{}</style><b>one</b>' } }), root);
    expect(root.innerHTML).toBe('<div><style>x{}</style><b>one</b></div>');
    render(h('div', { dangerouslySetInnerHTML: { __html: '<i>two</i>' } }), root);
    expect(root.innerHTML).toBe('<div><i>two</i></div>');
  });
});
