// Kanban board of a project: notes as cards in columns (drag between/within columns), columns editable.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { boards } from '@/src/core/storage';
import type { BoardColumn, Clip, Highlight } from '@/src/core/types';
import { newId, normalizeUrl } from '@/src/core/util';
import { domainOf, errText, IconButton, useUi } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { ut } from '@/src/ui/strings';
import { columnOf, defaultColumns, doneColumnId, groupByColumn, isDone, moveCard, removeColumn, setDoneColumn, toggleDone } from './board';
import { clipTags } from './graph';
import { clipIcon, snippet } from './logic';
import { lt } from './strings';

export function BoardView(p: {
  projectId: string | null; clips: Clip[]; highlights: Highlight[];
  onOpen: (c: Clip) => void;
  /** Persist a card move: new status of one clip + new order of the whole project. */
  onMove: (c: Clip, status: string, ids: string[]) => Promise<void>;
  /** Cards removed with a column go to `fallback`. */
  onColumnRemoved: (moved: Clip[], fallback: string) => Promise<void>;
  /** A card is a note: creating one creates a note in that column, deleting one deletes the note (after a confirm). */
  onCreate: (column: string, title: string, text: string) => Promise<void>;
  onDelete: (c: Clip) => void;
}) {
  const ui = useUi();
  const fallback = useMemo(() => defaultColumns({ todo: lt('colTodo'), doing: lt('colDoing'), done: lt('colDone') }), []);
  const [columns, setColumns] = useState<BoardColumn[]>(fallback);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ column: string; before?: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  /** Column whose "new card" form is open. */
  const [composing, setComposing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', text: '' });
  const [creating, setCreating] = useState(false);

  const openComposer = (col: string) => { setComposing(col); setDraft({ title: '', text: '' }); };
  const createCard = async (col: string, keepOpen: boolean) => {
    const title = draft.title.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      await p.onCreate(col, title, draft.text.trim());
      setDraft({ title: '', text: '' });
      if (!keepOpen) setComposing(null);
    } catch (e) {
      ui.toast(errText(e), true); // the draft stays, nothing typed is lost
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setColumns(fallback);
    boards.get(p.projectId).then((c) => { if (alive && c) setColumns(c); }, (e) => ui.toast(errText(e), true));
    return () => { alive = false; };
  }, [p.projectId]);

  const saveColumns = async (next: BoardColumn[]) => {
    setColumns(next);
    try { await boards.set(p.projectId, next); } catch (e) { ui.toast(errText(e), true); }
  };

  const groups = useMemo(() => groupByColumn(p.clips, columns), [p.clips, columns]);
  const hlCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of p.highlights) m.set(h.url, (m.get(h.url) ?? 0) + 1);
    return m;
  }, [p.highlights]);

  const finishDrop = () => {
    const id = dragId, target = drop;
    setDragId(null);
    setDrop(null);
    if (!id || !target) return;
    const card = p.clips.find((c) => c.id === id);
    if (!card || target.before === id) return;
    const { ids, status } = moveCard(p.clips, columns, id, target.column, target.before);
    const same = columnOf(card, columns) === status && ids.join() === [...groups.values()].flat().map((c) => c.id).join();
    if (!same) void p.onMove(card, status, ids);
  };

  // New column form (inline, so it can offer "collect completed cards here").
  const [newCol, setNewCol] = useState<{ name: string; done: boolean } | null>(null);
  const addColumn = async () => {
    const name = newCol?.name.trim();
    if (!name) return;
    const id = newId();
    const next = [...columns, { id, name }];
    await saveColumns(newCol!.done ? setDoneColumn(next, id) : next);
    setNewCol(null);
  };
  const doneId = doneColumnId(columns);
  const markDoneColumn = (col: BoardColumn) => void saveColumns(setDoneColumn(columns, col.id));
  const check = (c: Clip) => {
    const res = toggleDone(p.clips, columns, c.id);
    if (res) void p.onMove(c, res.status, res.ids);
  };
  const rename = (col: BoardColumn, name: string) => {
    setEditing(null);
    if (name.trim() && name.trim() !== col.name) void saveColumns(columns.map((c) => (c.id === col.id ? { ...c, name: name.trim() } : c)));
  };
  const remove = async (col: BoardColumn) => {
    const res = removeColumn(columns, col.id);
    if (!res) return;
    const cards = groups.get(col.id) ?? [];
    if (cards.length) {
      const to = columns.find((c) => c.id === res.fallback)?.name ?? '';
      const ok = await ui.confirm(lt('deleteColumn', { name: col.name }), { message: lt('deleteColumnMsg', { n: cards.length, to }), okLabel: ut('delete'), danger: true });
      if (!ok) return;
    }
    try {
      await p.onColumnRemoved(cards, res.fallback);
    } catch (e) {
      ui.toast(errText(e), true);
      return; // keep the column: its cards were not moved
    }
    await saveColumns(res.columns);
  };

  return (
    <div class="board">
      {columns.map((col) => {
        const cards = groups.get(col.id) ?? [];
        return (
          <section key={col.id} class={`board-col ${drop?.column === col.id && !drop.before ? 'drop-end' : ''}`}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); if (drop?.column !== col.id || drop.before) setDrop({ column: col.id }); }}
            onDrop={(e) => { e.preventDefault(); finishDrop(); }}>
            <header class="board-col-head">
              {editing === col.id
                ? <input class="input sm" defaultValue={col.name} autoFocus aria-label={lt('columnName')}
                  onBlur={(e) => rename(col, e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null); }} />
                : <h3 class="truncate" title={lt('renameColumn')} onDblClick={() => setEditing(col.id)}>{col.name}</h3>}
              <span class="nav-count">{cards.length}</span>
              <span class="grow" />
              {columns.length > 1 && (
                <IconButton icon="checkCircle" size="sm" title={col.id === doneId ? lt('doneColumnOn') : lt('doneColumnSet')}
                  active={col.id === doneId} onClick={() => markDoneColumn(col)} />
              )}
              <IconButton icon="pencil" size="sm" title={lt('renameColumn')} onClick={() => setEditing(col.id)} />
              {columns.length > 1 && <IconButton icon="trash" size="sm" danger title={ut('delete')} onClick={() => void remove(col)} />}
            </header>
            <div class="board-cards">
              {cards.map((c) => {
                const tags = clipTags(c);
                const done = isDone(c, columns);
                const hl = c.source.url ? (hlCount.get(normalizeUrl(c.source.url)) ?? 0) : 0;
                return (
                  <article key={c.id} draggable class={`card board-card ${done ? 'done' : ''} ${c.id === dragId ? 'dragging' : ''} ${drop?.before === c.id ? 'drop-before' : ''}`}
                    tabIndex={0} onClick={() => p.onOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter') p.onOpen(c); }}
                    onDragStart={(e) => { setDragId(c.id); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); } }}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const i = cards.findIndex((x) => x.id === c.id);
                      const before = e.clientY < r.top + r.height / 2 ? c.id : cards[i + 1]?.id;
                      if (drop?.column !== col.id || drop.before !== before) setDrop({ column: col.id, before });
                    }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); finishDrop(); }}
                    onDragEnd={() => { setDragId(null); setDrop(null); }}>
                    <div class="board-card-title">
                      {columns.length > 1 ? (
                        <button type="button" role="checkbox" aria-checked={done} class={`todo-check ${done ? 'on' : ''}`}
                          title={done ? lt('markUndone') : lt('markDone')} aria-label={done ? lt('markUndone') : lt('markDone')}
                          onClick={(e) => { e.stopPropagation(); check(c); }}>
                          {done && <Icon name="check" size={11} stroke={3} />}
                        </button>
                      ) : <Icon name={clipIcon(c)} size={13} />}
                      <span class="grow card-title-text">{c.title.trim() || lt('untitled')}</span>
                      <span class="board-card-actions" onClick={(e) => e.stopPropagation()}>
                        <IconButton icon="trash" size="sm" danger title={lt('deleteCard')} onClick={() => p.onDelete(c)} />
                      </span>
                    </div>
                    {c.note && <div class="item-note">{snippet(c.note, 80)}</div>}
                    <div class="board-card-meta">
                      {c.source.url && <span class="muted small truncate">{domainOf(c.source.url)}</span>}
                      {hl > 0 && <span class="badge" title={lt('highlights')}><Icon name="highlighter" size={11} />{hl}</span>}
                    </div>
                    {tags.length > 0 && <div class="board-tags">{tags.slice(0, 4).map((t) => <span key={t} class="tag-chip sm">#{t}</span>)}</div>}
                  </article>
                );
              })}
              {!cards.length && composing !== col.id && <div class="board-empty muted small">{lt('dropHere')}</div>}
              {composing === col.id && (
                <form class="card board-compose" onSubmit={(e) => { e.preventDefault(); void createCard(col.id, true); }}>
                  <input class="board-compose-title" value={draft.title} autoFocus placeholder={lt('cardTitle')} aria-label={lt('cardTitle')}
                    onInput={(e) => setDraft((d) => ({ ...d, title: e.currentTarget.value }))}
                    onKeyDown={(e) => { if (e.key === 'Escape') setComposing(null); }} />
                  <textarea class="board-compose-text" rows={2} value={draft.text} placeholder={lt('cardText')} aria-label={lt('cardText')}
                    onInput={(e) => setDraft((d) => ({ ...d, text: e.currentTarget.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setComposing(null);
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void createCard(col.id, true); }
                    }} />
                  <div class="row">
                    <button type="submit" class="btn primary sm" disabled={!draft.title.trim() || creating}>{lt('addCard')}</button>
                    <button type="button" class="btn ghost sm" onClick={() => setComposing(null)}>{ut('cancel')}</button>
                  </div>
                </form>
              )}
            </div>
            {composing !== col.id && (
              <button type="button" class="board-new-card" onClick={() => openComposer(col.id)}>
                <Icon name="plus" size={13} />{lt('newCard')}
              </button>
            )}
          </section>
        );
      })}
      {newCol ? (
        <form class="board-col board-new-col" onSubmit={(e) => { e.preventDefault(); void addColumn(); }}>
          <input class="input" value={newCol.name} autoFocus placeholder={lt('columnName')} aria-label={lt('columnName')}
            onInput={(e) => setNewCol({ ...newCol, name: e.currentTarget.value })}
            onKeyDown={(e) => { if (e.key === 'Escape') setNewCol(null); }} />
          <label class="row small">
            <input type="checkbox" checked={newCol.done} onChange={(e) => setNewCol({ ...newCol, done: e.currentTarget.checked })} />
            {lt('collectDone')}
          </label>
          <div class="row">
            <button type="submit" class="btn primary sm" disabled={!newCol.name.trim()}>{ut('create')}</button>
            <button type="button" class="btn ghost sm" onClick={() => setNewCol(null)}>{ut('cancel')}</button>
          </div>
        </form>
      ) : (
        <button type="button" class="board-add" onClick={() => setNewCol({ name: '', done: false })}><Icon name="plus" size={14} />{lt('newColumn')}</button>
      )}
    </div>
  );
}
