// sidepanel page (Firefox sidebar_action). Owner: agent B.
import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import '@/src/ui/base.css';
import './style.css';
import { formatBibliography } from '@/src/cite';
import { onBroadcast, send } from '@/src/core/messages';
import { settings } from '@/src/core/storage';
import type { CitationStyle, Clip, ExportFormat, Highlight, Project } from '@/src/core/types';
import { t, type StringKey } from '@/src/projects/strings';
import { bibliographyText, domainOf, moveItem } from '@/src/projects/utils';

const INBOX = '__inbox__';
const STYLES: CitationStyle[] = ['gost', 'apa', 'mla'];
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ClipItem(props: {
  clip: Clip; index: number; count: number;
  onMove: (from: number, to: number) => void;
  onChange: (c: Clip) => void; onDelete: (c: Clip) => void;
}) {
  const { clip, index, count, onMove, onChange, onDelete } = props;
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [note, setNote] = useState(clip.note ?? '');
  const [section, setSection] = useState(clip.section ?? '');

  const saveEdit = () => {
    onChange({ ...clip, note: note.trim() || undefined, section: section.trim() || undefined });
    setEditing(false);
  };

  return (
    <li
      class="clip"
      draggable
      onDragStart={(e) => e.dataTransfer?.setData('text/plain', String(index))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer?.getData('text/plain'));
        if (Number.isInteger(from)) onMove(from, index);
      }}
    >
      <div class="clip-head">
        <span class="kind">{t(`kind_${clip.kind}` as StringKey)}</span>
        <strong class="clip-title" title={clip.title}>{clip.title}</strong>
      </div>
      <div class="muted small">
        {domainOf(clip.source.url)}{clip.section ? ` · ${clip.section}` : ''}
      </div>
      {clip.note && !editing && <div class="note">{clip.note}</div>}
      {editing && (
        <div class="edit">
          <input placeholder={t('section')} value={section} onInput={(e) => setSection(e.currentTarget.value)} />
          <textarea placeholder={t('note')} rows={3} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
          <div class="row">
            <button class="primary" onClick={saveEdit}>{t('save')}</button>
            <button onClick={() => setEditing(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}
      <div class="row actions">
        <button title={t('up')} disabled={index === 0} onClick={() => onMove(index, index - 1)}>↑</button>
        <button title={t('down')} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>↓</button>
        <button onClick={() => setPreview(!preview)}>{preview ? t('hidePreview') : t('preview')}</button>
        <button onClick={() => setEditing(!editing)}>{t('edit')}</button>
        <a href={clip.source.url} target="_blank" rel="noopener noreferrer">{t('open')}</a>
        <button onClick={() => onDelete(clip)}>{t('delete')}</button>
      </div>
      {/* Markdown is rendered as plain text: nothing from the page can execute here. */}
      {preview && <pre class="preview">{clip.markdown || t('emptyMarkdown')}</pre>}
    </li>
  );
}

function HighlightList({ items }: { items: Highlight[] }) {
  if (!items.length) return <p class="muted">{t('noHighlights')}</p>;
  return (
    <ul class="list">
      {items.map((h) => (
        <li key={h.id} class={`hl hl-${h.color}`}>
          <div>{h.text}</div>
          {h.note && <div class="note">{h.note}</div>}
          <div class="muted small">{domainOf(h.source.url)}</div>
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string>(INBOX);
  const [clips, setClips] = useState<Clip[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [showHighlights, setShowHighlights] = useState(false);
  const [inboxStyle, setInboxStyle] = useState<CitationStyle>('gost');
  const [form, setForm] = useState<null | { mode: 'create' | 'rename'; name: string }>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const project = projects.find((p) => p.id === selected) ?? null;
  const projectId = project ? project.id : null;
  const style = project?.citationStyle ?? inboxStyle;

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      setError('');
      await fn();
    } catch (e) {
      setError(t('error', { message: msg(e) }));
    }
  }, []);

  const load = useCallback(() => run(async () => {
    const list = await send('project/list');
    setProjects(list);
    const pid = selected !== INBOX && list.some((p) => p.id === selected) ? selected : null;
    if (selected !== INBOX && !pid) setSelected(INBOX);
    setClips(await send('clip/list', { projectId: pid }));
    setHighlights(await send('highlight/listAll', { projectId: pid }));
  }), [run, selected]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onBroadcast('data/changed', () => void load()), [load]);
  useEffect(() => { void settings.get().then((s) => setInboxStyle(s.citationStyle)); }, []);

  const submitForm = () => run(async () => {
    if (!form || !form.name.trim()) return;
    if (form.mode === 'create') {
      const p = await send('project/create', { name: form.name });
      setSelected(p.id);
    } else if (project) {
      await send('project/update', { ...project, name: form.name });
    }
    setForm(null);
  });

  const deleteProject = () => run(async () => {
    if (!project || !confirm(t('confirmDeleteProject', { name: project.name }))) return;
    setSelected(INBOX);
    await send('project/delete', { id: project.id });
  });

  const changeStyle = (s: CitationStyle) => run(async () => {
    if (project) await send('project/update', { ...project, citationStyle: s });
    else setInboxStyle(s);
  });

  const move = (from: number, to: number) => run(async () => {
    const ids = moveItem(clips.map((c) => c.id), from, to);
    setClips(ids.map((id) => clips.find((c) => c.id === id)!)); // optimistic
    await send('clip/reorder', { projectId, ids });
  });

  const exportAs = (what: 'project' | 'highlights', format: ExportFormat) => run(async () => {
    try {
      if (what === 'project') await send('export/project', { projectId, format });
      else await send('export/highlights', { projectId, format });
    } catch (e) {
      throw new Error(t('exportFailed', { message: msg(e) }));
    }
  });

  const bibliography = formatBibliography(clips.map((c) => c.source), style);
  const copyBibliography = () => run(async () => {
    await navigator.clipboard.writeText(bibliographyText(bibliography, style === 'gost'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  });

  return (
    <div class="app">
      <div class="row">
        <select
          class="grow"
          value={selected}
          onChange={(e) => { setSelected(e.currentTarget.value); setForm(null); }}
        >
          <option value={INBOX}>{t('inbox')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button title={t('newProject')} onClick={() => setForm({ mode: 'create', name: '' })}>+</button>
        {project && <button title={t('rename')} onClick={() => setForm({ mode: 'rename', name: project.name })}>✎</button>}
        {project && <button title={t('delete')} onClick={deleteProject}>🗑</button>}
      </div>

      {form && (
        <form class="row" onSubmit={(e) => { e.preventDefault(); void submitForm(); }}>
          <input
            class="grow" autofocus placeholder={t('projectName')} value={form.name}
            onInput={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <button class="primary" type="submit">{form.mode === 'create' ? t('create') : t('save')}</button>
          <button type="button" onClick={() => setForm(null)}>{t('cancel')}</button>
        </form>
      )}

      {error && <div class="error">{error}</div>}

      <div class="tabs">
        <button class={showHighlights ? '' : 'primary'} onClick={() => setShowHighlights(false)}>{t('clips')} ({clips.length})</button>
        <button class={showHighlights ? 'primary' : ''} onClick={() => setShowHighlights(true)}>{t('highlights')} ({highlights.length})</button>
      </div>

      {showHighlights ? (
        <HighlightList items={highlights} />
      ) : clips.length === 0 ? (
        <p class="muted">{t('noClips')}</p>
      ) : (
        <ul class="list">
          {clips.map((c, i) => (
            <ClipItem
              key={c.id} clip={c} index={i} count={clips.length} onMove={move}
              onChange={(next) => run(async () => { await send('clip/update', next); })}
              onDelete={(clip) => run(async () => {
                if (confirm(t('confirmDeleteClip', { title: clip.title }))) await send('clip/delete', { id: clip.id });
              })}
            />
          ))}
        </ul>
      )}

      <section>
        <div class="row">
          <h3 class="grow">{t('bibliography')}</h3>
          <select aria-label={t('citationStyle')} value={style} onChange={(e) => void changeStyle(e.currentTarget.value as CitationStyle)}>
            {STYLES.map((s) => <option key={s} value={s}>{t(`style_${s}` as StringKey)}</option>)}
          </select>
          <button disabled={!bibliography.length} onClick={copyBibliography}>{copied ? t('copied') : t('copy')}</button>
        </div>
        {bibliography.length ? (
          <ol class="bib" reversed={false}>
            {bibliography.map((b) => <li key={b}>{b}</li>)}
          </ol>
        ) : <p class="muted">{t('noBibliography')}</p>}
      </section>

      <section>
        <h3>{t('export')}</h3>
        <div class="row wrap">
          <button onClick={() => exportAs('project', 'md')}>{t('exportMd')}</button>
          <button onClick={() => exportAs('project', 'md-zip')}>{t('exportMdZip')}</button>
          <button onClick={() => exportAs('project', 'pdf')}>{t('exportPdf')}</button>
          <button onClick={() => exportAs('highlights', 'anki-tsv')}>{t('exportAnki')}</button>
        </div>
      </section>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
