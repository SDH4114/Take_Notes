// Sidebar page (Firefox sidebar_action): compact view of the active project. The full UI is the Library tab.
import { render } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import '@/src/ui/base.css';
import './style.css';
import { formatBibliography } from '@/src/cite';
import { onBroadcast, send } from '@/src/core/messages';
import { settings } from '@/src/core/storage';
import type { CitationStyle, Clip, Highlight, Project } from '@/src/core/types';
import { t, type StringKey } from '@/src/projects/strings';
import { bibliographyText, moveItem, relativeDate } from '@/src/projects/utils';
import {
  Empty, ExportMenu, IconButton, Menu, ProjectPicker, UiProvider, domainOf, errText, openLibrary, useUi,
} from '@/src/ui/components';
import { Icon, type IconName } from '@/src/ui/icons';
import { renderMarkdown } from '@/src/ui/markdown';
import { colorHex } from '@/src/core/colors';

const KIND_ICON: Record<Clip['kind'], IconName> = { page: 'globe', selection: 'scissors', transcript: 'video', chapter: 'book' };

function ClipCard(p: {
  clip: Clip; index: number; count: number; dragging: boolean;
  onDragStart: (i: number) => void; onDrop: (i: number) => void; onDragEnd: () => void;
  onMove: (from: number, to: number) => void; onEdit: (c: Clip) => void; onDelete: (c: Clip) => void;
}) {
  const { clip, index } = p;
  const [preview, setPreview] = useState(false);
  const html = useMemo(() => (preview ? renderMarkdown(clip.markdown || '') : ''), [preview, clip.markdown]);
  return (
    <li
      class={`clip card ${p.dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer?.setData('text/plain', clip.id); p.onDragStart(index); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); p.onDrop(index); }}
      onDragEnd={p.onDragEnd}
    >
      <div class="clip-main">
        <span class="grip" title={t('dragToReorder')}><Icon name="grip" size={14} /></span>
        <span class="kind"><Icon name={KIND_ICON[clip.kind]} size={14} /></span>
        <div class="grow">
          <div class="clip-title" title={clip.title}>{clip.title}</div>
          <div class="muted small truncate">
            {domainOf(clip.source.url)} · {relativeDate(clip.createdAt)}{clip.section ? ` · ${clip.section}` : ''}
          </div>
          {clip.note && <div class="muted small snippet">{clip.note}</div>}
        </div>
      </div>
      <div class="clip-actions">
        <IconButton size="sm" icon="eye" title={preview ? t('hidePreview') : t('preview')} active={preview} onClick={() => setPreview(!preview)} />
        <IconButton size="sm" icon="pencil" title={t('edit')} onClick={() => p.onEdit(clip)} />
        <IconButton size="sm" icon="external" title={t('openSource')} onClick={() => void browser.tabs.create({ url: clip.source.url })} />
        <Menu align="right" items={[
          { label: t('up'), icon: 'arrowUp', onSelect: () => p.onMove(index, index - 1) },
          { label: t('down'), icon: 'arrowDown', onSelect: () => p.onMove(index, index + 1) },
        ].filter((_, i) => (i === 0 ? index > 0 : index < p.count - 1))}
          trigger={(toggle) => <IconButton size="sm" icon="more" title={t('dragToReorder')} onClick={toggle} />} />
        <IconButton size="sm" icon="trash" danger title={t('delete')} onClick={() => p.onDelete(clip)} />
      </div>
      {preview && (
        <div class="preview md" dangerouslySetInnerHTML={{ __html: html || `<p class="muted">${t('emptyMarkdown')}</p>` }} />
      )}
    </li>
  );
}

function HighlightCard({ h, onOpen, onDelete }: { h: Highlight; onOpen: (h: Highlight) => void; onDelete: (h: Highlight) => void }) {
  return (
    <li
      class="hl card" role="button" tabIndex={0} title={t('goToHighlight')}
      style={{ borderLeftColor: colorHex(h.color) }}
      onClick={() => onOpen(h)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(h); } }}
    >
      <div class="grow">
        <div class="hl-text">{h.text}</div>
        {h.note && <div class="muted small">{h.note}</div>}
        <div class="muted small truncate">{domainOf(h.source.url)}</div>
      </div>
      <div class="clip-actions">
        <IconButton size="sm" icon="trash" danger title={t('delete')} onClick={() => onDelete(h)} />
      </div>
    </li>
  );
}

function Bibliography({ sources, style }: { sources: Clip['source'][]; style: CitationStyle }) {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => formatBibliography(sources, style), [sources, style]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bibliographyText(entries, style === 'gost'));
      ui.toast(t('copied'));
    } catch (e) {
      ui.toast(errText(e), true);
    }
  };
  return (
    <section class="bib">
      <button type="button" class="bib-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        <span class="grow">{t('bibliography')}</span>
      </button>
      {open && (
        <div class="bib-body">
          <p class="muted small">{t('bibExplain')}</p>
          <div class="row small muted">
            <span>{t('bibStyleLabel', { style: t(`style_${style}` as StringKey) })}</span>
            <a href="#" onClick={(e) => { e.preventDefault(); void browser.runtime.openOptionsPage(); }}>{t('change')}</a>
          </div>
          {entries.length ? (
            <>
              <ol class="bib-list small">{entries.map((b) => <li key={b}>{b}</li>)}</ol>
              <button type="button" class="btn sm" onClick={copy}><Icon name="copy" size={14} />{t('copy')}</button>
            </>
          ) : <p class="muted small">{t('noBibliography')}</p>}
        </div>
      )}
    </section>
  );
}

function App() {
  const ui = useUi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [tab, setTab] = useState<'clips' | 'highlights'>('clips');
  const [defaultStyle, setDefaultStyle] = useState<CitationStyle>('gost');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [error, setError] = useState('');

  const project = projects.find((x) => x.id === selected) ?? null;
  const projectId = project ? project.id : null;
  const style = project?.citationStyle ?? defaultStyle;

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      setError('');
      await fn();
    } catch (e) {
      setError(t('error', { message: errText(e) }));
    }
  }, []);

  const load = useCallback(() => run(async () => {
    const [list, s] = await Promise.all([send('project/list'), settings.get()]);
    setProjects(list);
    setDefaultStyle(s.citationStyle);
    // A deleted project must not stay selected: fall back to Inbox.
    const pid = list.some((x) => x.id === s.defaultProjectId) ? s.defaultProjectId : null;
    setSelected(pid);
    const [c, h] = await Promise.all([send('clip/list', { projectId: pid }), send('highlight/listAll', { projectId: pid })]);
    setClips(c);
    setHighlights(h);
    setReady(true);
  }), [run]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onBroadcast('data/changed', () => void load()), [load]);

  // The project picked here is the "active" one: hotkeys, context menu and highlights save into it.
  const choose = (id: string | null) => {
    setSelected(id);
    void run(async () => { await settings.set({ defaultProjectId: id }); await load(); });
  };

  const rename = () => run(async () => {
    if (!project) return;
    const name = await ui.prompt(t('renameProject'), { value: project.name, placeholder: t('projectName'), okLabel: t('save') });
    if (name && name !== project.name) await send('project/update', { ...project, name });
  });

  const removeProject = () => run(async () => {
    if (!project) return;
    const ok = await ui.confirm(t('confirmDeleteProject', { name: project.name }), { okLabel: t('delete'), danger: true });
    if (!ok) return;
    await settings.set({ defaultProjectId: null });
    await send('project/delete', { id: project.id });
    await load();
  });

  const move = (from: number, to: number) => run(async () => {
    const ids = moveItem(clips.map((c) => c.id), from, to);
    setClips(ids.map((id) => clips.find((c) => c.id === id)!)); // optimistic
    await send('clip/reorder', { projectId, ids });
  });

  const removeClip = (clip: Clip) => run(async () => {
    const ok = await ui.confirm(t('confirmDeleteClip', { title: clip.title }), { okLabel: t('delete'), danger: true });
    if (ok) await send('clip/delete', { id: clip.id });
  });

  const openHighlight = async (h: Highlight) => {
    try {
      await send('highlight/open', { id: h.id });
    } catch (e) {
      ui.toast(errText(e), true);
    }
  };

  const sources = useMemo(() => clips.map((c) => c.source), [clips]);

  if (!ready && !error) return <div class="side muted" style={{ padding: 16 }}>{t('loading')}</div>;

  return (
    <div class="side">
      <header class="side-head">
        <div class="grow">
          <ProjectPicker compact projects={projects} value={selected} onChange={choose} onCreated={() => void load()} />
        </div>
        {project && <IconButton icon="pencil" title={t('rename')} onClick={rename} />}
        {project && <IconButton icon="trash" danger title={t('delete')} onClick={removeProject} />}
        <IconButton icon="maximize" title={t('openInLibrary')} onClick={() => void openLibrary({ project: projectId })} />
      </header>

      <div class="side-tabs">
        <div class="segmented" role="tablist">
          <button type="button" role="tab" class={tab === 'clips' ? 'on' : ''} onClick={() => setTab('clips')}>{t('clips')} ({clips.length})</button>
          <button type="button" role="tab" class={tab === 'highlights' ? 'on' : ''} onClick={() => setTab('highlights')}>{t('highlights')} ({highlights.length})</button>
        </div>
      </div>

      {error && <div class="error-box" style={{ margin: '0 12px 8px' }}>{error}</div>}

      <main class="side-list">
        {tab === 'clips' ? (
          clips.length === 0 ? (
            <Empty icon="note" title={t('noClipsTitle')} text={t('noClipsText')} />
          ) : (
            <ul class="list">
              {clips.map((c, i) => (
                <ClipCard
                  key={c.id} clip={c} index={i} count={clips.length} dragging={dragFrom === i}
                  onDragStart={setDragFrom}
                  onDrop={(to) => { if (dragFrom != null) void move(dragFrom, to); setDragFrom(null); }}
                  onDragEnd={() => setDragFrom(null)}
                  onMove={move}
                  onEdit={(clip) => void openLibrary({ project: projectId, clip: clip.id })}
                  onDelete={removeClip}
                />
              ))}
            </ul>
          )
        ) : highlights.length === 0 ? (
          <Empty icon="highlighter" title={t('noHlTitle')} text={t('noHlText')} />
        ) : (
          <ul class="list">
            {highlights.map((h) => (
              <HighlightCard
                key={h.id} h={h} onOpen={openHighlight}
                onDelete={(x) => void run(async () => { await send('highlight/delete', { id: x.id }); })}
              />
            ))}
          </ul>
        )}
      </main>

      <footer class="side-foot">
        <Bibliography sources={sources} style={style} />
        <ExportMenu
          variant="primary" placement="up" align="left"
          subject={{ kind: 'project', projectId }} extra={{ kind: 'highlights', projectId }}
        />
      </footer>
    </div>
  );
}

render(<UiProvider><App /></UiProvider>, document.getElementById('app')!);
