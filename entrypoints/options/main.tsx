// options page. Owner: agent B.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '@/src/ui/base.css';
import './style.css';
import { projects as projectsStore, settings as settingsStore } from '@/src/core/storage';
import { DEFAULT_SETTINGS, type CitationStyle, type HighlightColor, type Project, type Settings } from '@/src/core/types';
import { clearAllData } from '@/src/projects/data';
import { t, type StringKey } from '@/src/projects/strings';

const STYLES: CitationStyle[] = ['gost', 'apa', 'mla'];
const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

/** Parse a number input; keep `fallback` when empty/invalid, clamp to [min, max]. */
const num = (v: string, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return v.trim() === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

function App() {
  const [s, setS] = useState<Settings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    void settingsStore.get().then(setS);
    void projectsStore.list().then(setProjects);
  }, []);

  if (!s) return <div class="page muted">{t('loading')}</div>;

  const save = async (next: Settings) => {
    setS(next);
    try {
      await settingsStore.set(next);
      setStatus(t('saved'));
    } catch (e) {
      setStatus(t('error', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  const wipe = async () => {
    if (!confirm(t('confirmDeleteAll'))) return;
    try {
      await clearAllData();
      setS({ ...DEFAULT_SETTINGS });
      setProjects([]);
      setStatus(t('deletedAll'));
    } catch (e) {
      setStatus(t('error', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <div class="page">
      <h2>{t('settings')}</h2>

      <label class="field">
        <span>{t('citationStyle')}</span>
        <select value={s.citationStyle} onChange={(e) => save({ ...s, citationStyle: e.currentTarget.value as CitationStyle })}>
          {STYLES.map((c) => <option key={c} value={c}>{t(`style_${c}` as StringKey)}</option>)}
        </select>
      </label>

      <label class="field">
        <span>{t('defaultProject')}</span>
        <select value={s.defaultProjectId ?? ''} onChange={(e) => save({ ...s, defaultProjectId: e.currentTarget.value || null })}>
          <option value="">{t('none')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <label class="field">
        <span>{t('highlightColor')}</span>
        <select value={s.highlightColor} onChange={(e) => save({ ...s, highlightColor: e.currentTarget.value as HighlightColor })}>
          {COLORS.map((c) => <option key={c} value={c}>{t(`color_${c}` as StringKey)}</option>)}
        </select>
      </label>

      <label class="check">
        <input type="checkbox" checked={s.obsidian.frontmatter} onChange={(e) => save({ ...s, obsidian: { ...s.obsidian, frontmatter: e.currentTarget.checked } })} />
        {t('obsidianFrontmatter')}
      </label>
      <label class="check">
        <input type="checkbox" checked={s.obsidian.wikilinks} onChange={(e) => save({ ...s, obsidian: { ...s.obsidian, wikilinks: e.currentTarget.checked } })} />
        {t('obsidianWikilinks')}
      </label>
      <label class="check">
        <input type="checkbox" checked={s.downloadImages} onChange={(e) => save({ ...s, downloadImages: e.currentTarget.checked })} />
        {t('downloadImages')}
      </label>

      <label class="field">
        <span>{t('crawlDelay')} ({t('ms')})</span>
        <input type="number" min={1000} max={60000} step={100} value={s.crawl.delayMs}
          onChange={(e) => save({ ...s, crawl: { ...s.crawl, delayMs: num(e.currentTarget.value, s.crawl.delayMs, 1000, 60000) } })} />
      </label>
      <label class="field">
        <span>{t('crawlMaxPages')}</span>
        <input type="number" min={1} max={5000} value={s.crawl.maxPages}
          onChange={(e) => save({ ...s, crawl: { ...s.crawl, maxPages: num(e.currentTarget.value, s.crawl.maxPages, 1, 5000) } })} />
      </label>

      <div class="muted status" aria-live="polite">{status}</div>

      <h2>{t('dangerZone')}</h2>
      <button class="danger" onClick={wipe}>{t('deleteAll')}</button>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
