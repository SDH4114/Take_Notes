// Right-pane content for highlights and books.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { books as bookStore, highlights as hlStore } from '@/src/core/storage';
import { send } from '@/src/core/messages';
import { MarkdownEditor } from '@/src/ui/editor';
import type { Book, Clip, Highlight, Project } from '@/src/core/types';
import { MoveMenu } from './Lists';
import { domainOf, Empty, errText, IconButton, useUi } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { renderMarkdown } from '@/src/ui/markdown';
import { ut } from '@/src/ui/strings';
import { relativeDate } from './logic';
import { lt } from './strings';
import { colorHex } from '@/src/core/colors';
import { isPageHighlightUrl } from '@/src/core/util';

type HlMode = 'view' | 'edit' | 'split';
interface HlDraft { note: string; body: string }
const hlDraftOf = (h: Highlight): HlDraft => ({ note: h.note ?? '', body: h.body ?? '' });

/**
 * A highlight with two notes: the short one (also edited in the page popover and shown on the site) and a long
 * Markdown note that lives only in the extension. Both autosave; reloads never clobber what is being typed.
 */
export function HighlightPane(p: {
  h: Highlight; projects: Project[]; note?: Clip; onJump: (h: Highlight) => void; onDelete: (h: Highlight) => void;
  onMove: (h: Highlight, projectId: string | null, name: string) => void; onOpenNote: (h: Highlight, c: Clip) => void;
}) {
  const { h } = p;
  const ui = useUi();
  const [draft, setDraft] = useState<HlDraft>(() => hlDraftOf(h));
  const [mode, setMode] = useState<HlMode>(() => (h.body?.trim() ? 'view' : 'edit'));
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const draftRef = useRef(draft);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    if (!pending.current) return chain.current;
    pending.current = false;
    chain.current = chain.current.then(async () => {
      try {
        const latest = await hlStore.get(h.id);
        if (!latest) return; // deleted elsewhere
        const d = draftRef.current;
        await send('highlight/save', { ...latest, note: d.note.trim() ? d.note : undefined, body: d.body.trim() ? d.body : undefined });
        if (!pending.current) setStatus('saved');
      } catch (e) {
        setStatus('error');
        ui.toast(`${lt('saveFailed')}: ${errText(e)}`, true);
      }
    });
    return chain.current;
  }, [h.id, ui]);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const edit = (patch: Partial<HlDraft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    pending.current = true;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void persistRef.current(), 600);
  };

  // Adopt changes made elsewhere (e.g. the short note edited on the page) only when nothing is pending here.
  useEffect(() => {
    if (pending.current) return;
    const stored = hlDraftOf(h);
    if (stored.note === draftRef.current.note && stored.body === draftRef.current.body) return;
    draftRef.current = stored;
    setDraft(stored);
  }, [h.updatedAt]);

  useEffect(() => {
    const flush = () => { if (pending.current) void persistRef.current(); };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, []);

  const html = useMemo(() => renderMarkdown(draft.body), [draft.body]);

  return (
    <section class="pane">
      <header class="pane-head">
        <div class="pane-meta">
          {isPageHighlightUrl(h.url) && (
            <a class="meta-link truncate" href={h.url} target="_blank" rel="noopener noreferrer" title={h.source.title || h.url}>
              <Icon name="external" size={13} />{domainOf(h.url)}
            </a>
          )}
          <span class="muted small" title={new Date(h.createdAt).toLocaleString()}>{relativeDate(h.createdAt)}</span>
          <span class="dot" style={{ background: colorHex(h.color) }} title={lt('color')} />
          <span class="grow" />
          <span class={`save-status ${status}`} role="status">
            {status === 'saved' && <><Icon name="check" size={12} />{lt('saved')}</>}
            {status === 'saving' && lt('saving')}
            {status === 'error' && lt('saveFailed')}
          </span>
          <MoveMenu current={h.projectId} projects={p.projects} onMove={(id, name) => p.onMove(h, id, name)} />
          <IconButton icon="trash" title={ut('delete')} danger onClick={() => p.onDelete(h)} />
        </div>
        {h.source.title && <div class="hl-source-title truncate">{h.source.title}</div>}
        <blockquote class="hl-quote" style={{ borderLeftColor: colorHex(h.color) }}>{h.text}</blockquote>
        <div class="row hl-actions">
          {p.note && (
            <button type="button" class="btn sm primary" onClick={() => p.onOpenNote(h, p.note!)}>
              <Icon name="note" size={13} />{lt('openNote')}
            </button>
          )}
          {isPageHighlightUrl(h.url) && <button type="button" class="btn sm" onClick={() => p.onJump(h)}><Icon name="external" size={13} />{lt('goToSpot')}</button>}
          {!p.note && <span class="muted small">{lt('noNoteForHl')}</span>}
        </div>
      </header>

      <div class="note-field">
        <label class="label" for="hl-short">{lt('hlShortNote')}</label>
        <textarea id="hl-short" class="input" rows={2} value={draft.note} placeholder={lt('hlShortPlaceholder')}
          onInput={(e) => edit({ note: e.currentTarget.value })} />
      </div>

      <div class="hl-long-head">
        <span class="label">{lt('hlLongNote')}</span>
        <span class="muted small grow">{lt('hlLongHint')}</span>
        <div class="segmented mode-switch" role="tablist">
          {([['view', lt('modeView')], ['edit', lt('modeEdit')], ['split', lt('modeSplit')]] as [HlMode, string][]).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} class={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
      </div>
      <div class={`pane-body mode-${mode}`}>
        {mode !== 'view' && (
          <div class="pane-editor">
            <MarkdownEditor value={draft.body} onChange={(v) => edit({ body: v })} onSave={() => void persist()} autofocus={mode === 'edit' && !!draft.body} />
          </div>
        )}
        {mode !== 'edit' && (
          <div class="preview-scroll" onDblClick={() => { if (mode === 'view') setMode('edit'); }} title={lt('editHint')}>
            {draft.body.trim()
              // renderMarkdown output is sanitized with DOMPurify
              ? <div class="md reading" dangerouslySetInnerHTML={{ __html: html }} />
              : <p class="muted reading">{lt('hlLongEmpty')}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

/** Chapters of the selected book + rendered preview of the chosen chapter. */
export function BookReader(p: { bookId: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined); // undefined = loading, null = missing
  const [error, setError] = useState('');
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    setBook(undefined);
    setError('');
    setIdx(0);
    bookStore.get(p.bookId).then((b) => { if (alive) setBook(b ?? null); }, (e: unknown) => { if (alive) { setError(errText(e)); setBook(null); } });
    return () => { alive = false; };
  }, [p.bookId]);

  const chapter = book?.chapters[idx];
  const html = useMemo(() => (chapter ? renderMarkdown(chapter.markdown) : ''), [chapter]);

  if (book === undefined) return <section class="pane"><Empty icon="book" title={lt('loading')} /></section>;
  if (!book) return <section class="pane"><Empty icon="book" title={lt('pickBook')} text={error} /></section>;
  return (
    <section class="pane book-reader">
      <header class="pane-head">
        <h2 class="pane-title truncate" title={book.title}>{book.title}</h2>
        <div class="pane-meta">
          <a class="meta-link truncate" href={book.rootUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={13} />{domainOf(book.rootUrl)}</a>
          <span class="muted small">{lt('bookChapters', { n: book.chapters.length })}</span>
        </div>
      </header>
      <div class="book-body">
        <ol class="chapters" aria-label={lt('chapters')}>
          {book.chapters.map((c, i) => (
            <li key={c.url}>
              <button type="button" class={`chapter ${i === idx ? 'selected' : ''}`} style={{ paddingLeft: `${10 + Math.min(c.level, 4) * 12}px` }}
                onClick={() => setIdx(i)} title={c.title}>
                <span class="truncate">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <div class="preview-scroll" key={idx}>
          {chapter
            ? <div class="md reading" dangerouslySetInnerHTML={{ __html: html }} />
            : <Empty icon="book" title={lt('pickChapter')} />}
        </div>
      </div>
    </section>
  );
}
