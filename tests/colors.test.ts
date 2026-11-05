import { describe, expect, it } from 'vitest';
import { colorHex, DEFAULT_PALETTE, hexToRgb, normalizePalette, orderedPalette } from '@/src/core/colors';

describe('colors', () => {
  it('colorHex maps legacy names, validates hex, falls back to yellow', () => {
    expect(colorHex('blue')).toBe('#60a5fa');
    expect(colorHex('#ABCDEF')).toBe('#abcdef');
    expect(colorHex('red;}body{display:none')).toBe('#facc15');
    expect(colorHex(undefined)).toBe('#facc15');
  });
  it('normalizePalette dedupes, drops junk, never empty', () => {
    expect(normalizePalette(['#FF0000', '#ff0000', 'green', 'x', 5])).toEqual(['#ff0000', '#4ade80']);
    expect(normalizePalette([])).toEqual(DEFAULT_PALETTE);
    expect(normalizePalette(undefined)).toEqual(DEFAULT_PALETTE);
  });
  it('orderedPalette puts the default first', () => {
    expect(orderedPalette(['#111111', '#222222', '#333333'], '#222222')).toEqual(['#222222', '#111111', '#333333']);
    expect(orderedPalette(['#111111'], 'yellow')).toEqual(['#111111']);
  });
  it('hexToRgb', () => expect(hexToRgb('#ff8000')).toBe('255,128,0'));
});
