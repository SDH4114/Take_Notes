// Tiny i18n: each module keeps its own dictionary (src/<module>/strings.ts) to avoid merge conflicts.
// Manifest-level strings live in public/_locales.
export type Lang = 'ru' | 'en';
export type Dict<K extends string> = Record<Lang, Record<K, string>>;

export function uiLang(): Lang {
  const l = (globalThis.navigator?.language ?? 'en').toLowerCase();
  return /^(ru|uk|be|kk|ky|uz|az|tg|hy|ka)\b/.test(l) ? 'ru' : 'en';
}

/** Create a translator: const t = translator(strings); t('save', { n: 3 }) — "{n}" placeholders. */
export function translator<K extends string>(dict: Dict<K>, lang: Lang = uiLang()) {
  return (key: K, vars?: Record<string, string | number>): string => {
    let s = dict[lang][key] ?? dict.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
