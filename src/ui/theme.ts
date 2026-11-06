// Theme of extension pages: 'system' follows the browser, 'light'/'dark' force it.
// Kept in localStorage (shared by all extension pages, read synchronously → no flash of the wrong theme);
// the `storage` event updates other open pages live.
export type Theme = 'system' | 'light' | 'dark';
export const THEMES: Theme[] = ['system', 'light', 'dark'];
const KEY = 'tn.theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY) as Theme | null;
    return v && THEMES.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable: applies to this page only */ }
  apply(theme);
}

/** Call once at the top of every extension page that uses base.css. */
export function initTheme(): void {
  apply(getTheme());
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(getTheme()); });
}
