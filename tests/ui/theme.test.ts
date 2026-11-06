import { beforeEach, describe, expect, it } from 'vitest';
import { getTheme, initTheme, setTheme } from '@/src/ui/theme';

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });
  it('defaults to the browser theme (no data-theme)', () => {
    initTheme();
    expect(getTheme()).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it('forces light/dark and goes back to system', () => {
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getTheme()).toBe('dark');
    setTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it('ignores garbage in storage', () => {
    localStorage.setItem('tn.theme', 'neon');
    expect(getTheme()).toBe('system');
  });
});
