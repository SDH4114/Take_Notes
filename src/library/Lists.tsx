// Middle column lists: clips (drag to reorder), highlights, books.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Book, Clip, Highlight, Project } from '@/src/core/types';
import { domainOf, IconButton, Menu } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { ut } from '@/src/ui/strings';
import { clipIcon, moveId, relativeDate, snippet } from './logic';
import { lt } from './strings';
import { folderName, groupByFolder } from './folders';
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

// ---------- clips (grouped by folder)

export function ClipList(p: {
  clips: Clip[]; projects: Project[]; folders: string[]; selected: string | undefined; canReorder: boolean;
  onSelect: (id: string) => void; onMove: (c: Clip, projectId: string | null, name: string) => void;
  onDelete: (c: Clip) => void;
  /** New project order; `section` set when the dragged note lands in another folder. */
  onReorder: (ids: string[], moved?: { id: string; section: string | undefined }) => void;
  onRenameFolder: (name: string) => void; onDeleteFolder: (name: string) => void;
  /** Hide empty folders (e.g. while searching). */
  hideEmptyFolders?: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: 'before' | 'after' } | { folder: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = groupByFolder(p.clips, p.folders);
  const visible = groups.flatMap((g) => (g.folder && collapsed.has(g.folder) ? [] : g.clips));
  const ids = visible.map((c) => c.id);
  const allIds = groups.flatMap((g) => g.clips.map((c) => c.id));
  const end = () => { setDragId(null); setDrop(null); };
  const toggle = (f: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });

  const dropOnFolder = (folder: string | null) => {
    const id = dragId;
    end();
    if (!id) return;
    const card = p.clips.find((c) => c.id === id);
    const section = folder ?? undefined;
    if (!card || folderName(card.section) === (folder ?? '')) return;
    // Append at the end of that folder.
    const rest = allIds.filter((x) => x !== id);
    const last = groups.find((g) => g.folder === folder)?.clips.filter((c) => c.id !== id).at(-1)?.id;
    const at = last ? rest.indexOf(last) + 1 : rest.length;
    p.onReorder([...rest.slice(0, at), id, ...rest.slice(at)], { id, section });
  };

  const item = (c: Clip) => {
    const cls = ['item', 'clip-item', c.id === p.selected && 'selected', c.id === dragId && 'dragging',
      drop && 'id' in drop && drop.id === c.id && `drop-${drop.where}`].filter(Boolean).join(' ');
    return (
      <div key={c.id} class={cls} draggable={p.canReorder} onClick={() => p.onSelect(c.id)}
        onDragStart={(e) => { setDragId(c.id); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); } }}
        onDragOver={(e) => {
          if (!dragId || dragId === c.id) return;
          e.preventDefault();
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const where = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
          if (!drop || !('id' in drop) || drop.id !== c.id || drop.where !== where) setDrop({ id: c.id, where });
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragId && drop && 'id' in drop) {
            const next = moveId(allIds, dragId, drop.id, drop.where);
            const dragged = p.clips.find((x) => x.id === dragId);
            const moved = dragged && folderName(dragged.section) !== folderName(c.section)
              ? { id: dragId, section: folderName(c.section) || undefined } : undefined;
            if (next.join() !== allIds.join() || moved) p.onReorder(next, moved);
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
        <div class="item-actions" onClick={(e) => e.stopPropagation()}>
          {c.source.url && (
            <a class="icon-btn sm" href={c.source.url} target="_blank" rel="noopener noreferrer" title={lt('openSource')}
              aria-label={lt('openSource')}><Icon name="external" size={14} /></a>
          )}
          <MoveMenu current={c.projectId} projects={p.projects} onMove={(id, name) => p.onMove(c, id, name)} />
          <IconButton icon="trash" size="sm" danger title={ut('delete')} onClick={() => p.onDelete(c)} />
        </div>
      </div>
    );
  };

  return (
    <ListBox ids={ids} selected={p.selected} onSelect={p.onSelect}
      onDelete={(id) => { const c = p.clips.find((x) => x.id === id); if (c) p.onDelete(c); }}>
      {groups.map((g) => {
        if (g.folder === null) {
          return (
            <div key="__root" class={`folder-root ${drop && 'folder' in drop && drop.folder === null ? 'drop-into' : ''}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDrop({ folder: null }); } }}
              onDrop={(e) => { e.preventDefault(); dropOnFolder(null); }}>
              {g.clips.map(item)}
            </div>
          );
        }
        if (p.hideEmptyFolders && !g.clips.length) return null;
        const f = g.folder;
        const open = !collapsed.has(f);
        return (
          <div key={`f:${f}`} class="folder">
            <div class={`folder-head ${drop && 'folder' in drop && drop.folder === f ? 'drop-into' : ''}`} role="button" tabIndex={0}
              aria-expanded={open} onClick={() => toggle(f)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(f); } }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); e.stopPropagation(); setDrop({ folder: f }); } }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnFolder(f); }}>
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
              <Icon name="folder" size={14} />
              <span class="folder-name truncate">{f}</span>
              <span class="nav-count">{g.clips.length}</span>
              <span class="folder-actions" onClick={(e) => e.stopPropagation()}>
                <IconButton icon="pencil" size="sm" title={lt('renameFolder')} onClick={() => p.onRenameFolder(f)} />
                <IconButton icon="trash" size="sm" danger title={ut('delete')} onClick={() => p.onDeleteFolder(f)} />
              </span>
            </div>
            {open && (
              <div class="folder-body"
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDrop({ folder: f }); } }}
                onDrop={(e) => { e.preventDefault(); dropOnFolder(f); }}>
                {g.clips.length ? g.clips.map(item) : <div class="folder-empty muted small">{lt('emptyFolder')}</div>}
              </div>
            )}
          </div>
        );
      })}
    </ListBox>
  );
}

// ---------- highlights

/** Projects a highlight/clip can move to (everything except where it is now). */
export function moveTargets(current: string | null, projects: Project[]): { id: string | null; name: string }[] {
  return [
    ...(current === null ? [] : [{ id: null as string | null, name: ut('inbox') }]),
    ...projects.filter((x) => x.id !== current).map((x) => ({ id: x.id as string | null, name: x.name })),
  ];
}

export function MoveMenu(p: { current: string | null; projects: Project[]; onMove: (projectId: string | null, name: string) => void }) {
  const others = moveTargets(p.current, p.projects);
  return (
    <Menu placement="down" align="right"
      items={others.map((o) => ({ label: o.name, icon: o.id === null ? 'inbox' : 'folder', onSelect: () => p.onMove(o.id, o.name) }))}
      trigger={(toggle) => <IconButton icon="folder" size="sm" title={lt('moveTo')} onClick={toggle} disabled={!others.length} />} />
  );
}

export function HighlightList(p: {
  items: Highlight[]; projects: Project[]; selected: string | undefined; onSelect: (id: string) => void;
  onJump: (h: Highlight) => void; onDelete: (h: Highlight) => void;
  onMove: (h: Highlight, projectId: string | null, name: string) => void;
  /** The saved note of the highlight's page, if any. */
  noteOf: (h: Highlight) => Clip | undefined; onOpenNote: (h: Highlight, c: Clip) => void;
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
            <div class="row hl-links">
              {(() => {
                const note = p.noteOf(h);
                return note && (
                  <button type="button" class="btn sm ghost jump" onClick={(e) => { e.stopPropagation(); p.onOpenNote(h, note); }}>
                    <Icon name="note" size={13} />{lt('openNote')}
                  </button>
                );
              })()}
              <button type="button" class="btn sm ghost jump" onClick={(e) => { e.stopPropagation(); p.onJump(h); }}>
                <Icon name="external" size={13} />{lt('goToSpot')}
              </button>
            </div>
          </div>
          <div class="item-actions" onClick={(e) => e.stopPropagation()}>
            <MoveMenu current={h.projectId} projects={p.projects} onMove={(id, name) => p.onMove(h, id, name)} />
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
