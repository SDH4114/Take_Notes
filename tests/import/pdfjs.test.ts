// @vitest-environment node
// Real pdf.js on a tiny hand-written PDF: checks that textItems() reads positions and sizes the way itemsToMarkdown expects.
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { itemsToMarkdown, textItems } from '@/src/import/pdf';

/** Minimal one-page PDF with Helvetica text; `lines` = [size, y, text]. xref offsets are computed. */
function makePdf(lines: [number, number, string][]): Uint8Array {
  const stream = lines.map(([size, y, text]) => `BT /F1 ${size} Tf 72 ${y} Td (${text}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe('pdf import with real pdf.js', () => {
  it('heading, paragraphs and a compound word broken at its hyphen', async () => {
    const data = makePdf([
      [24, 720, 'Lecture notes'],
      [11, 680, 'The first paragraph has a lower-'],
      [11, 666, 'order term broken at the end of the line.'],
      [11, 630, 'Second paragraph.'],
    ]);
    const task = getDocument({ data, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const items = textItems((await page.getTextContent()).items);
    await task.destroy();
    expect(items.find((i) => i.str === 'Lecture notes')).toMatchObject({ x: 72, y: 720, size: 24 });
    expect(itemsToMarkdown([items]).markdown).toBe(
      '## Lecture notes\n\nThe first paragraph has a lower-order term broken at the end of the line.\n\nSecond paragraph.\n',
    );
  });
});
