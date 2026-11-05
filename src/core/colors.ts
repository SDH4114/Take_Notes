// Highlight colors. Stored as "#rrggbb"; highlights saved before v0.3 use legacy names ("yellow"…).
// Every value that ends up in page CSS goes through colorHex(), which only ever returns a strict #rrggbb.

export const LEGACY_COLORS: Record<string, string> = {
  yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', pink: '#f472b6', purple: '#a78bfa',
};

export const DEFAULT_PALETTE = Object.values(LEGACY_COLORS);

const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (c: unknown): c is string => typeof c === 'string' && HEX.test(c);

/** Any stored color (legacy name or hex) → safe lowercase "#rrggbb"; unknown → yellow. */
export function colorHex(c: string | undefined | null): string {
  if (isHexColor(c)) return c.toLowerCase();
  return LEGACY_COLORS[c ?? ''] ?? LEGACY_COLORS.yellow!;
}

/** Clean a user palette: valid hex only, lowercase, no duplicates; never empty. */
export function normalizePalette(colors: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(colors)) {
    for (const c of colors) {
      const hex = isHexColor(c) ? c.toLowerCase() : typeof c === 'string' && LEGACY_COLORS[c] ? LEGACY_COLORS[c]! : null;
      if (hex && !out.includes(hex)) out.push(hex);
    }
  }
  return out.length ? out : [...DEFAULT_PALETTE];
}

/** Palette with the default color first (it is the one-click color in the toolbar). */
export function orderedPalette(palette: string[], defaultColor: string): string[] {
  const d = colorHex(defaultColor);
  const list = normalizePalette(palette);
  return list.includes(d) ? [d, ...list.filter((c) => c !== d)] : list;
}

/** "#rrggbb" → "r,g,b" for rgba(). */
export function hexToRgb(hex: string): string {
  const h = colorHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
}
