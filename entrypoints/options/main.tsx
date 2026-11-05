// Options page: autosaved settings.
import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '@/src/ui/base.css';
import './style.css';
import { settings as settingsStore } from '@/src/core/storage';
import { DEFAULT_SETTINGS, type CitationStyle, type HighlightColor, type Settings } from '@/src/core/types';
import { clearAllData } from '@/src/projects/data';
import { t, type StringKey } from '@/src/projects/strings';
import { UiProvider, errText, useUi } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';

const STYLES: CitationStyle[] = ['gost', 'apa', 'mla'];
const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

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
    setS(next);
    try {
      await settingsStore.set(next);
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
        <div class="color-row" role="radiogroup" aria-label={t('highlightColor')}>
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={s.highlightColor === c}
              class={`color-pick ${s.highlightColor === c ? 'on' : ''}`} title={t(`color_${c}` as StringKey)}
              onClick={() => save({ ...s, highlightColor: c })}>
              <span class={`dot ${c}`} />
              {s.highlightColor === c && <Icon name="check" size={12} stroke={2.4} />}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('optDataTitle')} text={t('optDataText')}>
        <button type="button" class="btn danger" onClick={wipe}><Icon name="trash" size={14} />{t('deleteAll')}</button>
      </Section>
    </div>
  );
}

render(<UiProvider><Page /></UiProvider>, document.getElementById('app')!);
