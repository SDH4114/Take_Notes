// Options page: autosaved settings.
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '@/src/ui/base.css';
import { getTheme, initTheme, setTheme, THEMES, type Theme } from '@/src/ui/theme';
import { ut } from '@/src/ui/strings';
import './style.css';
import { changedSettings, settings as settingsStore } from '@/src/core/storage';
import { DEFAULT_SETTINGS, type CitationStyle, type Settings } from '@/src/core/types';
import { colorHex, DEFAULT_PALETTE, normalizePalette } from '@/src/core/colors';
import { clearAllData } from '@/src/projects/data';
import { t, type StringKey } from '@/src/projects/strings';
import { UiProvider, errText, useUi } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { DEFAULT_SITE_ACCESS, addSite, normalizeSite, type SiteAccess } from '@/src/sites/rules';
import { getSiteAccess, onSiteAccessChanged, setSiteAccess } from '@/src/sites/store';
import { t as st } from '@/src/sites/strings';

initTheme();

const STYLES: CitationStyle[] = ['gost', 'apa', 'mla'];

/** Parse a number input; keep `fallback` when empty/invalid, clamp to [min, max]. */
const num = (v: string, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return v.trim() === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

function Section(p: { title: string; text?: string; children: ComponentChildren }) {
  return (
    <section class="opt-section">
      <h2>{p.title}</h2>
      {p.text && <p class="muted">{p.text}</p>}
      {p.children}
    </section>
  );
}

function Check(p: { checked: boolean; onChange: (v: boolean) => void; label: string; note?: string }) {
  return (
    <label class="opt-check">
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.currentTarget.checked)} />
      <span>{p.label}{p.note && <span class="muted small opt-note">{p.note}</span>}</span>
    </label>
  );
}

function Page() {
  const ui = useUi();
  const [s, setS] = useState<Settings | null>(null);

  useEffect(() => {
    settingsStore.get().then(setS).catch((e) => ui.toast(errText(e), true));
  }, []);

  if (!s) return <div class="page muted">{t('loading')}</div>;

  const save = async (next: Settings) => {
    const prev = s;
    setS(next);
    try {
      // Write only the fields changed here: this page's copy of the rest (e.g. the active project picked in the
      // popup meanwhile) may be stale and would overwrite newer values.
      await settingsStore.set(changedSettings(prev, next));
      ui.toast(t('saved'));
    } catch (e) {
      ui.toast(t('error', { message: errText(e) }), true);
    }
  };

  const wipe = async () => {
    const ok = await ui.confirm(t('deleteAll'), { message: t('confirmDeleteAll'), okLabel: t('deleteAllConfirmLabel'), danger: true });
    if (!ok) return;
    try {
      await clearAllData();
      setS({ ...DEFAULT_SETTINGS });
      ui.toast(t('deletedAll'));
    } catch (e) {
      ui.toast(t('error', { message: errText(e) }), true);
    }
  };

  return (
    <div class="page">
      <h1>{t('settings')}</h1>

      <ThemeSection />

      <SitesSection />

      <Section title={t('optBibTitle')} text={t('optBibText')}>
        <div class="style-cards" role="radiogroup" aria-label={t('citationStyle')}>
          {STYLES.map((c) => (
            <label key={c} class={`card style-card ${s.citationStyle === c ? 'on' : ''}`}>
              <input type="radio" name="citationStyle" checked={s.citationStyle === c} onChange={() => save({ ...s, citationStyle: c })} />
              <b>{t(`style_${c}` as StringKey)}</b>
              <span class="muted small">{t(`style${c[0]!.toUpperCase()}${c.slice(1)}Desc` as StringKey)}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('optExportTitle')} text={t('optExportText')}>
        <Check checked={s.downloadImages} label={t('downloadImages')}
          onChange={(v) => save({ ...s, downloadImages: v })} />
        <p class="muted small opt-note-block">{t('obsidianNote')}</p>
        <Check checked={s.obsidian.frontmatter} label={t('obsidianFrontmatter')}
          onChange={(v) => save({ ...s, obsidian: { ...s.obsidian, frontmatter: v } })} />
        <Check checked={s.obsidian.wikilinks} label={t('obsidianWikilinks')}
          onChange={(v) => save({ ...s, obsidian: { ...s.obsidian, wikilinks: v } })} />
      </Section>

      <Section title={t('optCrawlTitle')} text={t('optCrawlText')}>
        <label class="opt-field">
          <span class="label">{t('crawlDelay')} ({t('ms')})</span>
          <input class="input" type="number" min={1000} max={60000} step={100} value={s.crawl.delayMs}
            onChange={(e) => save({ ...s, crawl: { ...s.crawl, delayMs: num(e.currentTarget.value, s.crawl.delayMs, 1000, 60000) } })} />
          <span class="muted small">{t('crawlDelayHelp')}</span>
        </label>
        <label class="opt-field">
          <span class="label">{t('crawlMaxPages')}</span>
          <input class="input" type="number" min={1} max={5000} value={s.crawl.maxPages}
            onChange={(e) => save({ ...s, crawl: { ...s.crawl, maxPages: num(e.currentTarget.value, s.crawl.maxPages, 1, 5000) } })} />
          <span class="muted small">{t('crawlMaxHelp')}</span>
        </label>
      </Section>

      <Section title={t('optHlTitle')} text={t('optHlText')}>
        <PaletteEditor
          colors={s.highlightPalette}
          main={colorHex(s.highlightColor)}
          onChange={(colors, main) => save({ ...s, highlightPalette: colors, highlightColor: main })}
        />
      </Section>

      <Section title={t('optDataTitle')} text={t('optDataText')}>
        <button type="button" class="btn danger" onClick={wipe}><Icon name="trash" size={14} />{t('deleteAll')}</button>
      </Section>
    </div>
  );
}

render(<UiProvider><Page /></UiProvider>, document.getElementById('app')!);

function ThemeSection() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const pick = (v: Theme) => { setTheme(v); setThemeState(v); };
  return (
    <Section title={ut('theme')} text={ut('themeText')}>
      <div class="style-cards" role="radiogroup" aria-label={ut('theme')}>
        {THEMES.map((v) => (
          <label key={v} class={`card style-card ${theme === v ? 'on' : ''}`}>
            <input type="radio" name="theme" checked={theme === v} onChange={() => pick(v)} />
            <span class={`theme-swatch ${v}`} aria-hidden="true" />
            <b>{ut(`theme_${v}`)}</b>
          </label>
        ))}
      </div>
    </Section>
  );
}

/** Global on/off + list of sites where TakeNotes stays inactive. Stored in storage.local (see src/sites/store.ts). */
function SitesSection() {
  const ui = useUi();
  const [access, setAccess] = useState<SiteAccess>(DEFAULT_SITE_ACCESS);
  const [input, setInput] = useState('');

  useEffect(() => {
    getSiteAccess().then(setAccess).catch((e) => ui.toast(errText(e), true));
    return onSiteAccessChanged(setAccess);
  }, []);

  const save = async (patch: Partial<SiteAccess>) => {
    try {
      setAccess(await setSiteAccess(patch));
      ui.toast(t('saved'));
    } catch (e) {
      ui.toast(t('error', { message: errText(e) }), true);
    }
  };

  const add = (e: Event) => {
    e.preventDefault();
    const site = normalizeSite(input);
    if (!site) return ui.toast(st('invalidSite'), true);
    if (access.blockedSites.includes(site)) return ui.toast(st('alreadyBlocked'), true);
    setInput('');
    void save({ blockedSites: addSite(access.blockedSites, site) });
  };

  return (
    <Section title={st('optTitle')} text={st('optText')}>
      <Check checked={access.enabled} label={st('enabled')} note={st('enabledHint')}
        onChange={(v) => void save({ enabled: v })} />
      <div>
        <span class="label">{st('blockedList')}</span>
        <form class="row site-add" onSubmit={add}>
          <input class="input grow" value={input} placeholder={st('addPlaceholder')} aria-label={st('addPlaceholder')}
            onInput={(e) => setInput(e.currentTarget.value)} />
          <button type="submit" class="btn" disabled={!input.trim()}><Icon name="plus" size={14} />{st('add')}</button>
        </form>
        {access.blockedSites.length === 0 ? (
          <p class="muted small">{st('blockedEmpty')}</p>
        ) : (
          <ul class="site-list">
            {access.blockedSites.map((site) => (
              <li key={site} class="row">
                <Icon name="ban" size={14} />
                <span class="grow">{site}</span>
                <button type="button" class="btn ghost sm" title={st('remove')} aria-label={`${st('remove')}: ${site}`}
                  onClick={() => void save({ blockedSites: access.blockedSites.filter((x) => x !== site) })}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

/** Palette editor: click = make main, × = remove (keeps at least one), + = add via the native color picker. */
function PaletteEditor(p: { colors: string[]; main: string; onChange: (colors: string[], main: string) => void }) {
  const colors = normalizePalette(p.colors);
  const main = colors.includes(p.main) ? p.main : colors[0]!;
  const add = (hex: string) => {
    const c = colorHex(hex);
    if (!colors.includes(c)) p.onChange([...colors, c], main);
  };
  const remove = (c: string) => {
    if (colors.length <= 1) return;
    const next = colors.filter((x) => x !== c);
    p.onChange(next, c === main ? next[0]! : main);
  };
  return (
    <div>
      <div class="palette">
        {colors.map((c) => (
          <div key={c} class={`swatch ${c === main ? 'on' : ''}`}>
            <button type="button" class="swatch-dot" style={{ background: c }} title={t('makeDefault')}
              aria-pressed={c === main} onClick={() => p.onChange(colors, c)}>
              {c === main && <Icon name="check" size={14} stroke={2.6} />}
            </button>
            {colors.length > 1 && (
              <button type="button" class="swatch-x" title={t('removeColor')} aria-label={t('removeColor')} onClick={() => remove(c)}>
                <Icon name="x" size={10} stroke={2.6} />
              </button>
            )}
            <span class="swatch-label">{c === main ? t('defaultColor') : ''}</span>
          </div>
        ))}
        <label class="swatch add" title={t('addColor')}>
          <span class="swatch-dot"><Icon name="plus" size={16} /></span>
          <input type="color" class="sr-only" aria-label={t('addColor')} onChange={(e) => add(e.currentTarget.value)} />
          <span class="swatch-label" />
        </label>
      </div>
      <button type="button" class="btn ghost sm" onClick={() => p.onChange([...DEFAULT_PALETTE], DEFAULT_PALETTE[0]!)}>{t('resetPalette')}</button>
    </div>
  );
}
