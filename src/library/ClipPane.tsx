// Right pane of the library: the selected clip (title, meta, personal note, live-preview editor).
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { send } from '@/src/core/messages';
import { assets as assetStore, clips as clipStore } from '@/src/core/storage';
import type { Clip, Highlight, Project } from '@/src/core/types';
import { normTag } from './graph';
import { folderName } from './folders';
import { domainOf, ExportMenu, errText, IconButton, Menu, useUi } from '@/src/ui/components';
import { MarkdownEditor, type EditorApi } from '@/src/ui/editor';
import { Icon } from '@/src/ui/icons';
import { ut } from '@/src/ui/strings';
import { relativeDate } from './logic';
import { lt } from './strings';
import { it as importT } from '@/src/import/strings';

/** Open the original file of an imported note (PDF kept as an Asset) in a new tab; the browser's viewer shows it. */
async function openOriginal(c: Clip): Promise<void> {
  const found = await assetStore.getMany(c.assetIds ?? []);
  const pdf = found.find((a) => a.mime === 'application/pdf');
  if (!pdf) throw new Error(importT('originalMissing'));
  const url = URL.createObjectURL(pdf.data);
  window.open(url, '_blank');
  // The new tab has loaded it by then; keep memory from piling up while the Library stays open.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const kindLabel = (c: Clip): string => {
  if (!c.source.url) return lt('kindNote');
  return { page: lt('kindPage'), selection: lt('kindSelection'), transcript: lt('kindTranscript'), chapter: lt('kindChapter') }[c.kind];
};

interface Draft { title: string; markdown: string; note: string }
const draftOf = (c: Clip): Draft => ({ title: c.title, markdown: c.markdown, note: c.note ?? '' });
type Status = 'saved' | 'saving' | 'error';

/**
 * `fresh`: just created, so the editor gets focus.
 * `highlights`: made on this clip's page, colored in the note. `focusHighlight`: scroll to that mark and flash it.
 */
export function ClipPane(p: {
  clip: Clip; projects: Project[]; fresh?: boolean; onDelete: () => void;
  highlights?: Highlight[]; focusHighlight?: string;
  /** Open the note a [[wikilink]] points to. */
  onOpenLink?: (title: string) => void;
  folders?: string[]; onMoveToFolder?: (folder: string | null) => void;
}) {
  const ui = useUi();
  const [draft, setDraft] = useState<Draft>(() => draftOf(p.clip));
  const [status, setStatus] = useState<Status>('saved');
  const draftRef = useRef(draft);
  const clipRef = useRef(p.clip);
  clipRef.current = p.clip;
  const ver = useRef(0);
  const savedVer = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

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

  // Came here from a highlight: bring its mark into view once the editor is ready.
  const editorApi = useRef<EditorApi | null>(null);
  const revealed = useRef<string | undefined>(undefined);
  const reveal = () => {
    const id = p.focusHighlight;
    const api = editorApi.current;
    if (!id || !api || revealed.current === id) return;
    revealed.current = id; // once per jump, not on every re-render while editing
    if (!api.revealHighlight(id)) ui.toast(lt('hlNotInNote'));
  };
  useEffect(reveal, [p.focusHighlight]);

  // Tags: saved at once (not part of the debounced text draft).
  const [tags, setTags] = useState<string[]>(p.clip.tags);
  const tagsRef = useRef(tags);
  const tagSaves = useRef(0);
  useEffect(() => { if (!tagSaves.current) { tagsRef.current = p.clip.tags; setTags(p.clip.tags); } }, [p.clip.tags.join('\n')]);
  const [tagInput, setTagInput] = useState('');
  const saveTags = (next: string[]) => {
    tagsRef.current = next;
    setTags(next);
    tagSaves.current++;
    void persist({ tags: next }).finally(() => { tagSaves.current--; });
  };
  const addTags = (raw: string) => {
    const cur = tagsRef.current;
    const add = raw.split(/[,\s]+/).map(normTag).filter(Boolean).filter((t) => !cur.includes(t));
    setTagInput('');
    if (add.length) saveTags([...cur, ...add]);
  };

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
        </div>
        <div class="pane-meta">
          {c.source.url && (
            <a class="meta-link truncate" href={c.source.url} target="_blank" rel="noopener noreferrer" title={c.source.url}>
              <Icon name="external" size={13} />{domainOf(c.source.url)}
            </a>
          )}
          {(c.assetIds?.length ?? 0) > 0 && (
            <button type="button" class="btn sm ghost" onClick={() => openOriginal(c).catch((e) => ui.toast(errText(e), true))}>
              <Icon name="file" size={13} />{importT('original')}
            </button>
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
          {p.onMoveToFolder && (
            <Menu placement="down" align="left"
              items={[
                ...(folderName(c.section) ? [{ label: lt('noFolder'), icon: 'note' as const, onSelect: () => p.onMoveToFolder!(null) }] : []),
                ...(p.folders ?? []).filter((f) => f !== folderName(c.section)).map((f) => ({ label: f, icon: 'folder' as const, onSelect: () => p.onMoveToFolder!(f) })),
              ]}
              trigger={(toggle) => (
                <button type="button" class="btn sm ghost" onClick={toggle} title={lt('moveToFolder')}
                  disabled={!(p.folders ?? []).length}>
                  <Icon name="folderPlus" size={13} />
                  <span class="truncate move-name">{folderName(c.section) || lt('noFolder')}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
              )} />
          )}
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

      <div class="tags-field" aria-label={lt('tags')}>
        <Icon name="tag" size={13} />
        {tags.map((t) => (
          <span key={t} class="tag-chip">#{t}
            <button type="button" class="tag-x" title={ut('delete')} aria-label={`${ut('delete')} #${t}`}
              onClick={() => saveTags(tags.filter((x) => x !== t))}><Icon name="x" size={10} stroke={2.4} /></button>
          </span>
        ))}
        <input class="tag-input" value={tagInput} placeholder={tags.length ? '' : lt('addTags')} aria-label={lt('addTags')}
          onInput={(e) => {
            const v = e.currentTarget.value;
            if (/[,\s]$/.test(v)) addTags(v); else setTagInput(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTags(tagInput); }
            if (e.key === 'Backspace' && !tagInput && tags.length) saveTags(tags.slice(0, -1));
          }}
          onBlur={() => { if (tagInput.trim()) addTags(tagInput); }} />
      </div>

      <div class="pane-body">
        <div class="pane-editor">
          <MarkdownEditor value={draft.markdown} onChange={(v) => edit({ markdown: v })} onSave={() => void persist()}
            highlights={p.highlights} onOpenLink={p.onOpenLink} autofocus={p.fresh}
            onReady={(api) => { editorApi.current = api; reveal(); }} />
        </div>
      </div>
    </section>
  );
}
