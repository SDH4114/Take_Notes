// Right-pane content for highlights and books.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { books as bookStore } from '@/src/core/storage';
import type { Book, Highlight } from '@/src/core/types';
import { domainOf, Empty, errText, IconButton } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { renderMarkdown } from '@/src/ui/markdown';
import { ut } from '@/src/ui/strings';
import { relativeDate } from './logic';
import { lt } from './strings';
import { colorHex } from '@/src/core/colors';

export function HighlightPane(p: { h: Highlight; onJump: (h: Highlight) => void; onDelete: (h: Highlight) => void }) {
  const { h } = p;
  return (
    <section class="pane">
      <header class="pane-head">
        <div class="pane-meta">
          <a class="meta-link truncate" href={h.url} target="_blank" rel="noopener noreferrer" title={h.source.title || h.url}>
            <Icon name="external" size={13} />{domainOf(h.url)}
          </a>
          <span class="muted small" title={new Date(h.createdAt).toLocaleString()}>{relativeDate(h.createdAt)}</span>
          <span class="dot" style={{ background: colorHex(h.color) }} title={lt('color')} />
          <span class="grow" />
          <IconButton icon="trash" title={ut('delete')} danger onClick={() => p.onDelete(h)} />
        </div>
        {h.source.title && <div class="hl-source-title truncate">{h.source.title}</div>}
      </header>
      <div class="pane-body mode-view">
        <div class="preview-scroll">
          <div class="reading">
            <blockquote class="hl-quote" style={{ borderLeftColor: colorHex(h.color) }}>{h.text}</blockquote>
            {h.note && (
              <div class="hl-note">
                <div class="label">{lt('noteInHighlight')}</div>
                <p>{h.note}</p>
              </div>
            )}
            <button type="button" class="btn primary" onClick={() => p.onJump(h)}>
              <Icon name="external" size={14} />{lt('goToSpot')}
            </button>
          </div>
        </div>
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
