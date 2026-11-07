import { describe, expect, it } from 'vitest';
import { itemsToMarkdown, pageLines, stripHeadersFooters, type PdfItem } from '@/src/import/pdf';

/** Lines of text, top to bottom, 14 pt apart; `size` per line. */
function page(lines: (string | [string, number] | null)[], top = 800): PdfItem[] {
  const out: PdfItem[] = [];
  let y = top;
  for (const l of lines) {
    if (l === null) { y -= 14; continue; } // blank line → paragraph gap
    const [str, size] = typeof l === 'string' ? [l, 10] : l;
    out.push({ str, x: 50, y, width: str.length * size * 0.5, size });
    y -= size >= 14 ? size * 1.6 : 14;
  }
  return out;
}

describe('pdf import: lines', () => {
  it('merges runs on the same baseline with spaces where apart', () => {
    const lines = pageLines([
      { str: 'world', x: 100, y: 700.4, width: 30, size: 10 },
      { str: 'Hello', x: 50, y: 700, width: 25, size: 10 },
      { str: 'Next', x: 50, y: 686, width: 20, size: 10 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'Next']);
  });
  it('no space inside a word split into runs', () => {
    expect(pageLines([{ str: 'Hel', x: 50, y: 0, width: 15, size: 10 }, { str: 'lo', x: 65, y: 0, width: 10, size: 10 }])[0]!.text).toBe('Hello');
  });
});

describe('pdf import: markdown', () => {
  it('headings by size, paragraphs by gaps, hyphenation joined', () => {
    const { markdown, heading, chars } = itemsToMarkdown([page([
      ['Лекция 1', 20], 'Первая строка абзаца с приме-', 'ром переноса.', null, 'Второй абзац.', ['Раздел', 13], 'Текст.',
    ])]);
    expect(markdown).toBe('## Лекция 1\n\nПервая строка абзаца с примером переноса.\n\nВторой абзац.\n\n### Раздел\n\nТекст.\n');
    expect(heading).toBe('Лекция 1');
    expect(chars).toBeGreaterThan(40);
  });
  it('lists', () => {
    const { markdown } = itemsToMarkdown([page(['Пункты:', '• один', '• два', '1) три', 'Конец.'])]);
    expect(markdown).toBe('Пункты:\n\n- один\n- два\n1. три\n\nКонец.\n');
  });
  it('escapes markdown characters from the PDF text', () => {
    expect(itemsToMarkdown([page(['# not a heading *x* [y]'])]).markdown).toBe('\\# not a heading \\*x\\* \\[y\\]\n');
  });
  it('a sentence continuing on the next page stays one paragraph', () => {
    const { markdown } = itemsToMarkdown([page(['Начало предложения']), page(['продолжается здесь.'])]);
    expect(markdown).toBe('Начало предложения продолжается здесь.\n');
  });
  it('removes running headers and page numbers', () => {
    const pages = [1, 2, 3, 4].map((n) => page(['Курс физики — 2026', `Текст страницы ${n}.`, `${n}`]));
    const { markdown } = itemsToMarkdown(pages);
    expect(markdown).not.toContain('Курс физики');
    expect(markdown).toBe('Текст страницы 1.\n\nТекст страницы 2.\n\nТекст страницы 3.\n\nТекст страницы 4.\n');
  });
  it('keeps a repeated line when there are too few pages to tell', () => {
    expect(stripHeadersFooters([[{ text: 'A', y: 1, size: 10, x: 0, right: 5 }], [{ text: 'A', y: 1, size: 10, x: 0, right: 5 }]]).flat()).toHaveLength(2);
  });
  it('empty PDF (scan) → no text', () => {
    expect(itemsToMarkdown([[], []])).toEqual({ markdown: '', chars: 0 });
  });
});

describe('pdf import: wrapped list items', () => {
  it('an indented line continues the list item', () => {
    const items: PdfItem[] = [
      { str: '• длинный пункт, который', x: 50, y: 800, width: 120, size: 10 },
      { str: 'переносится на строку', x: 60, y: 786, width: 110, size: 10 },
      { str: 'Обычный текст.', x: 50, y: 772, width: 70, size: 10 },
    ];
    expect(itemsToMarkdown([items]).markdown).toBe('- длинный пункт, который переносится на строку\n\nОбычный текст.\n');
  });
});

describe('pdf import: layout without bullet glyphs', () => {
  const line = (str: string, x: number, y: number, width: number): PdfItem => ({ str, x, y, width, size: 10 });
  it('indented short lines (bullets drawn as graphics) become a list', () => {
    const items = [
      line('Процессы бывают разные, и этот абзац достаточно длинный, чтобы дойти до правого края.', 50, 800, 450),
      line('Изохорный процесс', 70, 786, 90),
      line('Изобарный процесс', 70, 772, 90),
      line('Изотермический процесс', 70, 758, 110),
      line('Дальше обычный текст, тоже длинный, чтобы занимать всю ширину колонки до края.', 50, 744, 450),
    ];
    expect(itemsToMarkdown([items]).markdown).toBe(
      'Процессы бывают разные, и этот абзац достаточно длинный, чтобы дойти до правого края.\n\n'
      + '- Изохорный процесс\n- Изобарный процесс\n- Изотермический процесс\n\n'
      + 'Дальше обычный текст, тоже длинный, чтобы занимать всю ширину колонки до края.\n',
    );
  });
  it('first-line indent ("красная строка") stays a paragraph', () => {
    const items = [
      line('Первая строка абзаца с отступом, длинная, до самого края колонки.', 70, 800, 430),
      line('продолжение абзаца с начала строки, тоже длинное, до края колонки.', 50, 786, 450),
      line('Второй абзац с отступом, длинный, до самого края колонки текста.', 70, 772, 430),
      line('и его продолжение, которое тоже тянется до правого края колонки.', 50, 758, 450),
    ];
    expect(itemsToMarkdown([items]).markdown).toBe(
      'Первая строка абзаца с отступом, длинная, до самого края колонки. продолжение абзаца с начала строки, тоже длинное, до края колонки.\n\n'
      + 'Второй абзац с отступом, длинный, до самого края колонки текста. и его продолжение, которое тоже тянется до правого края колонки.\n',
    );
  });
  it('keeps the hyphen of a Latin compound word, drops Russian hyphenation', () => {
    const md = itemsToMarkdown([[line('a lower-', 50, 800, 450), line('order term', 50, 786, 450), line('приме-', 50, 772, 450), line('ром', 50, 758, 450)]]).markdown;
    expect(md).toBe('a lower-order term примером\n');
  });
});
