import { describe, expect, it } from 'vitest';
import { normalizeUrl, slugifyFilename } from '@/src/core/util';
import { translator } from '@/src/core/i18n';

describe('core util', () => {
  it('normalizeUrl drops hash and tracking params', () => {
    expect(normalizeUrl('https://ru.wikipedia.org/wiki/Rust?utm_source=x&a=1#History'))
      .toBe('https://ru.wikipedia.org/wiki/Rust?a=1');
  });
  it('slugifyFilename keeps cyrillic and strips illegal chars', () => {
    expect(slugifyFilename('Язык Rust: основы/введение?')).toBe('Язык Rust основы введение');
    expect(slugifyFilename('A [b] #c ^d')).toBe('A b c d');
    expect(slugifyFilename('..')).toBe('untitled');
  });
  it('translator substitutes vars and falls back to en', () => {
    const t = translator({ ru: { a: 'Сохранено {n}' }, en: { a: 'Saved {n}' } }, 'ru');
    expect(t('a', { n: 3 })).toBe('Сохранено 3');
  });
});
