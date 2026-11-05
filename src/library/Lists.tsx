// Middle column lists: clips (drag to reorder), highlights, books.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Book, Clip, Highlight, Project } from '@/src/core/types';
import { domainOf, IconButton, Menu } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { ut } from '@/src/ui/strings';
import { clipIcon, moveId, relativeDate, snippet } from './logic';
import { lt } from './strings';
import { colorHex } from '@/src/core/colors';

/** Focusable list: Up/Down move the selection, Delete asks to delete it. */
export function ListBox(p: {
  ids: string[]; selected: string | undefined; onSelect: (id: string) => void; onDelete?: (id: string) => void;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.selected) return;
    ref.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }, [p.selected]);
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const i = p.selected ? p.ids.indexOf(p.selected) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(p.ids.length - 1, i + 1) : Math.max(0, i - 1);
      const id = p.ids[next];
      if (id) p.onSelect(id);
    } else if (e.key === 'Delete' && p.selected && p.onDelete) {
      e.preventDefault();
      p.onDelete(p.selected);
    }
  };
  return <div class="listbox" tabIndex={0} ref={ref} onKeyDown={onKeyDown}>{p.children}</div>;
}

// ---------- clips

export function ClipList(p: {
  clips: Clip[]; projects: Project[]; selected: string | undefined; canReorder: boolean;
  onSelect: (id: string) => void; onMove: (c: Clip, projectId: string | null, name: string) => void;
  onDelete: (c: Clip) => void; onReorder: (ids: string[]) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: 'before' | 'after' } | null>(null);
  const ids = p.clips.map((c) => c.id);
  const end = () => { setDragId(null); setDrop(null); };
  return (
    <ListBox ids={ids} selected={p.selected} onSelect={p.onSelect}
      onDelete={(id) => { const c = p.clips.find((x) => x.id === id); if (c) p.onDelete(c); }}>
      {p.clips.map((c) => {
        const others = [
          ...(c.projectId === null ? [] : [{ id: null as string | null, name: ut('inbox') }]),
          ...p.projects.filter((x) => x.id !== c.projectId).map((x) => ({ id: x.id as string | null, name: x.name })),
        ];
        const cls = ['item', 'clip-item', c.id === p.selected && 'selected', c.id === dragId && 'dragging',
          drop?.id === c.id && `drop-${drop.where}`].filter(Boolean).join(' ');
        return (
          <div key={c.id} class={cls} draggable={p.canReorder} onClick={() => p.onSelect(c.id)}
            onDragStart={(e) => { setDragId(c.id); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); } }}
            onDragOver={(e) => {
              if (!dragId || dragId === c.id) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const where = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
              if (drop?.id !== c.id || drop.where !== where) setDrop({ id: c.id, where });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && drop) {
                const next = moveId(ids, dragId, drop.id, drop.where);
                if (next.join() !== ids.join()) p.onReorder(next);
              }
              end();
            }}
            onDragEnd={end}>
            <span class="item-icon"><Icon name={clipIcon(c)} size={16} /></span>
            <div class="item-main">
              <div class="item-title">{c.title.trim() || lt('untitled')}</div>
              <div class="item-meta truncate">
                {c.source.url && <>{domainOf(c.source.url)} <span aria-hidden="true">·</span> </>}{relativeDate(c.updatedAt)}
              </div>
              {c.note && <div class="item-note">{snippet(c.note, 90)}</div>}
            </div>
            <div class="item-actions">
              {c.source.url && (
                <a class="icon-btn sm" href={c.source.url} target="_blank" rel="noopener noreferrer" title={lt('openSource')}
                  aria-label={lt('openSource')} onClick={(e) => e.stopPropagation()}><Icon name="external" size={14} /></a>
              )}
              <Menu placement="down" align="right"
                items={others.map((o) => ({ label: o.name, icon: o.id === null ? 'inbox' : 'folder', onSelect: () => p.onMove(c, o.id, o.name) }))}
                trigger={(toggle) => <IconButton icon="folder" size="sm" title={lt('moveTo')} onClick={toggle} disabled={!others.length} />} />
              <IconButton icon="trash" size="sm" danger title={ut('delete')} onClick={() => p.onDelete(c)} />
            </div>
          </div>
        );
      })}
    </ListBox>
  );
}

// ---------- highlights

export function HighlightList(p: {
  items: Highlight[]; selected: string | undefined; onSelect: (id: string) => void;
  onJump: (h: Highlight) => void; onDelete: (h: Highlight) => void;
}) {
  return (
    <ListBox ids={p.items.map((h) => h.id)} selected={p.selected} onSelect={p.onSelect}
      onDelete={(id) => { const h = p.items.find((x) => x.id === id); if (h) p.onDelete(h); }}>
      {p.items.map((h) => (
        <div key={h.id} class={`item hl-item ${h.id === p.selected ? 'selected' : ''}`} onClick={() => p.onSelect(h.id)}>
          <span class="hl-bar" style={{ background: colorHex(h.color) }} />
          <div class="item-main">
            <div class="item-text">{h.text}</div>
            {h.note && <div class="item-note italic">{h.note}</div>}
            <div class="item-meta truncate">{domainOf(h.url)} <span aria-hidden="true">·</span> {relativeDate(h.createdAt)}</div>
            <button type="button" class="btn sm ghost jump" onClick={(e) => { e.stopPropagation(); p.onJump(h); }}>
              <Icon name="external" size={13} />{lt('goToSpot')}
            </button>
          </div>
          <div class="item-actions">
            <IconButton icon="trash" size="sm" danger title={ut('delete')} onClick={() => p.onDelete(h)} />
          </div>
        </div>
      ))}
    </ListBox>
  );
}

// ---------- books

export type BookSummary = Omit<Book, 'chapters'> & { chapterCount: number };

export function BookList(p: {
  books: BookSummary[]; selected: string | undefined; onSelect: (id: string) => void;
  onDelete: (b: BookSummary) => void; exportSlot: (b: BookSummary) => ComponentChildren;
}) {
  return (
    <ListBox ids={p.books.map((b) => b.id)} selected={p.selected} onSelect={p.onSelect}
      onDelete={(id) => { const b = p.books.find((x) => x.id === id); if (b) p.onDelete(b); }}>
      {p.books.map((b) => (
        <div key={b.id} class={`item ${b.id === p.selected ? 'selected' : ''}`} onClick={() => p.onSelect(b.id)}>
          <span class="item-icon"><Icon name="book" size={16} /></span>
          <div class="item-main">
            <div class="item-title">{b.title}</div>
            <div class="item-meta truncate">
              {domainOf(b.rootUrl)} <span aria-hidden="true">·</span> {lt('bookChapters', { n: b.chapterCount })} <span aria-hidden="true">·</span> {relativeDate(b.createdAt)}
            </div>
          </div>
          <div class="item-actions">
            {p.exportSlot(b)}
            <IconButton icon="trash" size="sm" danger title={ut('delete')} onClick={() => p.onDelete(b)} />
          </div>
        </div>
      ))}
    </ListBox>
  );
}
