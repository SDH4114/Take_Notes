// Right pane of the library: the selected clip (title, meta, personal note, read / edit / split).
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { send } from '@/src/core/messages';
import { clips as clipStore } from '@/src/core/storage';
import type { Clip, Project } from '@/src/core/types';
import { domainOf, ExportMenu, errText, IconButton, Menu, useUi } from '@/src/ui/components';
import { MarkdownEditor, type EditorApi } from '@/src/ui/editor';
import { Icon } from '@/src/ui/icons';
import { renderMarkdown } from '@/src/ui/markdown';
import { ut } from '@/src/ui/strings';
import { relativeDate } from './logic';
import { lt } from './strings';

type Mode = 'view' | 'edit' | 'split';
const MODE_KEY = 'tn.library.mode';
const MODES: Mode[] = ['view', 'edit', 'split'];

function loadMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY) as Mode | null;
    return v && MODES.includes(v) ? v : 'view';
  } catch { return 'view'; }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const kindLabel = (c: Clip): string => {
  if (!c.source.url) return lt('kindNote');
  return { page: lt('kindPage'), selection: lt('kindSelection'), transcript: lt('kindTranscript'), chapter: lt('kindChapter') }[c.kind];
};

interface Draft { title: string; markdown: string; note: string }
const draftOf = (c: Clip): Draft => ({ title: c.title, markdown: c.markdown, note: c.note ?? '' });
type Status = 'saved' | 'saving' | 'error';

/** Rendered markdown; a double click switches to the editor. */
function Preview(p: { html: string; empty: boolean; onEdit: () => void; scrollRef?: (el: HTMLDivElement | null) => void; onScroll?: () => void }) {
  return (
    <div class="preview-scroll" ref={p.scrollRef} onScroll={p.onScroll} onDblClick={p.onEdit} title={lt('editHint')}>
      {p.empty
        ? <p class="muted reading">{lt('emptyNoteBody')}</p>
        // renderMarkdown output is sanitized with DOMPurify
        : <div class="md reading" dangerouslySetInnerHTML={{ __html: p.html }} />}
    </div>
  );
}

/** `fresh`: just created, so open straight in the editor (without changing the remembered mode). */
export function ClipPane(p: { clip: Clip; projects: Project[]; fresh?: boolean; onDelete: () => void }) {
  const ui = useUi();
  const [mode, setModeState] = useState<Mode>(() => (p.fresh ? 'edit' : loadMode()));
  const [draft, setDraft] = useState<Draft>(() => draftOf(p.clip));
  const [status, setStatus] = useState<Status>('saved');
  const draftRef = useRef(draft);
  const clipRef = useRef(p.clip);
  clipRef.current = p.clip;
  const ver = useRef(0);
  const savedVer = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable: the mode just isn't remembered */ }
  };

  /** Save now (serialized so older saves can't overwrite newer ones). `patch` is merged on top, e.g. a new projectId. */
  const persist = useCallback((patch?: Partial<Clip>): Promise<void> => {
    clearTimeout(timer.current);
    if (ver.current === savedVer.current && !patch) return chain.current;
    const v = ver.current;
    setStatus('saving');
    chain.current = chain.current.then(async () => {
      try {
        const d = draftRef.current;
        // Merge onto the stored clip (not the possibly stale prop) so a project move or other change is never reverted.
        const latest = await clipStore.get(clipRef.current.id);
        if (!latest) { savedVer.current = Math.max(savedVer.current, v); return; } // deleted elsewhere
        await send('clip/update', { ...latest, title: d.title, markdown: d.markdown, note: d.note || undefined, ...patch });
        savedVer.current = Math.max(savedVer.current, v);
        if (ver.current === savedVer.current) setStatus('saved');
      } catch (e) {
        setStatus('error');
        ui.toast(`${lt('saveFailed')}: ${errText(e)}`, true);
      }
    });
    return chain.current;
  }, [ui]);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const edit = (patch: Partial<Draft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    ver.current++;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void persistRef.current(), 700);
  };

  // Data reloads (the background broadcasts after every save) must not clobber what is being typed:
  // only adopt stored values when nothing is pending.
  useEffect(() => {
    if (ver.current !== savedVer.current) return;
    const stored = draftOf(p.clip);
    const cur = draftRef.current;
    if (stored.title === cur.title && stored.markdown === cur.markdown && stored.note === cur.note) return;
    draftRef.current = stored;
    setDraft(stored);
  }, [p.clip.updatedAt]);

  // Flush pending edits when leaving the clip / closing the tab.
  useEffect(() => {
    const flush = () => { if (ver.current !== savedVer.current) void persistRef.current(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  // note textarea grows with its content
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 140)}px`;
  }, [draft.note]);

  // ---- split-view scroll sync by ratio
  const editorApi = useRef<EditorApi | null>(null);
  const previewEl = useRef<HTMLDivElement | null>(null);
  const lock = useRef<{ src: 'editor' | 'preview'; until: number } | null>(null);
  const claim = (src: 'editor' | 'preview'): boolean => {
    const l = lock.current;
    if (l && l.src !== src && Date.now() < l.until) return false;
    lock.current = { src, until: Date.now() + 120 };
    return true;
  };
  const onEditorScroll = (ratio: number) => {
    const el = previewEl.current;
    if (mode !== 'split' || !el || !claim('editor')) return;
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  };
  const onPreviewScroll = () => {
    const el = previewEl.current;
    if (mode !== 'split' || !el || !claim('preview')) return;
    const max = el.scrollHeight - el.clientHeight;
    editorApi.current?.scrollToRatio(max > 0 ? el.scrollTop / max : 0);
  };

  const previewSource = useDebounced(draft.markdown, mode === 'split' ? 150 : 0);
  const html = useMemo(() => renderMarkdown(previewSource), [previewSource]);

  const move = async (projectId: string | null, name: string) => {
    await persist({ projectId });
    ui.toast(lt('moved', { name }));
  };
  const c = p.clip;
  const others: { id: string | null; name: string }[] = [
    ...(c.projectId === null ? [] : [{ id: null, name: ut('inbox') }]),
    ...p.projects.filter((x) => x.id !== c.projectId).map((x) => ({ id: x.id as string | null, name: x.name })),
  ];
  const full = (iso: string) => new Date(iso).toLocaleString();

  return (
    <section class="pane">
      <header class="pane-head">
        <div class="pane-top">
          <input class="title-input" value={draft.title} placeholder={lt('titlePlaceholder')} aria-label={lt('titlePlaceholder')}
            onInput={(e) => edit({ title: e.currentTarget.value })} />
          <div class="segmented mode-switch" role="tablist">
            {([['view', lt('modeView')], ['edit', lt('modeEdit')], ['split', lt('modeSplit')]] as [Mode, string][]).map(([m, label]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} class={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
            ))}
          </div>
        </div>
        <div class="pane-meta">
          {c.source.url && (
            <a class="meta-link truncate" href={c.source.url} target="_blank" rel="noopener noreferrer" title={c.source.url}>
              <Icon name="external" size={13} />{domainOf(c.source.url)}
            </a>
          )}
          <span class="muted small" title={full(c.updatedAt)}>{relativeDate(c.updatedAt)}</span>
          <span class="badge">{kindLabel(c)}</span>
          <Menu placement="down" align="left" items={others.map((o) => ({
            label: o.name, icon: o.id === null ? 'inbox' : 'folder', onSelect: () => void move(o.id, o.name),
          }))}
          trigger={(toggle) => (
            <button type="button" class="btn sm ghost" onClick={toggle} title={lt('moveTo')} disabled={!others.length}>
              <Icon name={c.projectId === null ? 'inbox' : 'folder'} size={13} />
              <span class="truncate move-name">{c.projectId === null ? ut('inbox') : (p.projects.find((x) => x.id === c.projectId)?.name ?? ut('project'))}</span>
              <Icon name="chevronDown" size={12} />
            </button>
          )} />
          <span class="grow" />
          <span class={`save-status ${status}`} role="status">
            {status === 'saved' && <><Icon name="check" size={12} />{lt('saved')}</>}
            {status === 'saving' && lt('saving')}
            {status === 'error' && lt('saveFailed')}
          </span>
          <ExportMenu subject={{ kind: 'clip', id: c.id }} variant="icon" align="right" />
          <IconButton icon="trash" title={ut('delete')} danger onClick={p.onDelete} />
        </div>
      </header>

      <div class="note-field">
        <label class="label" for="clip-note">{lt('myNote')}</label>
        <textarea id="clip-note" ref={noteRef} class="input" rows={1} value={draft.note} placeholder={lt('notePlaceholder')}
          onInput={(e) => edit({ note: e.currentTarget.value })} />
      </div>

      <div class={`pane-body mode-${mode}`}>
        {mode !== 'view' && (
          <div class="pane-editor">
            <MarkdownEditor value={draft.markdown} onChange={(v) => edit({ markdown: v })} onSave={() => void persist()}
              onScroll={onEditorScroll} onReady={(api) => { editorApi.current = api; }} autofocus={mode === 'edit'} />
          </div>
        )}
        {mode !== 'edit' && (
          <Preview html={html} empty={!draft.markdown.trim()} onEdit={() => { if (mode === 'view') setMode('edit'); }}
            scrollRef={(el) => { previewEl.current = el; }} onScroll={onPreviewScroll} />
        )}
      </div>
    </section>
  );
}
