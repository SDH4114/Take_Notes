// Library workspace: nav | list | detail. All data comes through messages; broadcasts refresh it live.
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { onBroadcast, send } from '@/src/core/messages';
import { books as bookStore } from '@/src/core/storage';
import type { Clip, Highlight, Project } from '@/src/core/types';
import { Empty, errText, ExportMenu, useUi } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { ut } from '@/src/ui/strings';
import { ClipPane } from './ClipPane';
import { BookList, ClipList, HighlightList, type BookSummary } from './Lists';
import {
  buildParams, filterClips, filterHighlights, parseParams, type LibraryState, type LibraryView,
} from './logic';
import { Nav } from './Nav';
import { BookReader, HighlightPane } from './Panes';
import { lt } from './strings';

type ClipMap = Map<string | null, Clip[]>;

const isEditable = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

export function App() {
  const ui = useUi();
  const [nav, setNav] = useState<LibraryState>(() => parseParams(location.search));
  const navRef = useRef(nav);
  navRef.current = nav;
  const [projects, setProjects] = useState<Project[]>([]);
  const [clipMap, setClipMap] = useState<ClipMap>(new Map());
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [freshId, setFreshId] = useState<string | undefined>();
  const [editingTitle, setEditingTitle] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const go = useCallback((patch: Partial<LibraryState>) => setNav((n) => ({ ...n, ...patch })), []);

  // ---- data
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [projs, allHl, bks] = await Promise.all([
        send('project/list'), send('highlight/listAll', {}), bookStore.list(),
      ]);
      const keys: (string | null)[] = [null, ...projs.map((x) => x.id)];
      const lists = await Promise.all(keys.map((k) => send('clip/list', { projectId: k })));
      if (mine !== seq.current) return; // a newer load is in flight
      setProjects(projs);
      setClipMap(new Map(keys.map((k, i) => [k, lists[i]!])));
      setHighlights(allHl.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setBooks(bks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ chapters, ...rest }) => ({ ...rest, chapterCount: chapters.length })));
      if (navRef.current.project && !projs.some((x) => x.id === navRef.current.project)) {
        setNav((n) => ({ ...n, project: null, clip: undefined }));
      }
      setLoaded(true);
    } catch (e) {
      ui.toast(errText(e), true);
    }
  }, [ui]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onBroadcast('data/changed', () => { clearTimeout(timer); timer = setTimeout(() => void load(), 120); });
    return () => { off(); clearTimeout(timer); };
  }, [load]);

  // ---- URL follows the state, so a reload keeps the place
  useEffect(() => {
    history.replaceState(null, '', `${location.pathname}${buildParams(nav)}`);
  }, [nav]);

  // ---- derived
  const clips = clipMap.get(nav.project) ?? [];
  const projectHighlights = useMemo(() => highlights.filter((h) => h.projectId === nav.project), [highlights, nav.project]);
  const clipCounts = useMemo(() => new Map([...clipMap].map(([k, v]) => [k, v.length])), [clipMap]);
  const shownClips = useMemo(() => filterClips(clips, query), [clips, query]);
  const shownHl = useMemo(() => filterHighlights(projectHighlights, query), [projectHighlights, query]);
  const projectName = nav.project === null ? ut('inbox') : (projects.find((x) => x.id === nav.project)?.name ?? '');
  const project = projects.find((x) => x.id === nav.project);

  // Always have something selected when the list is not empty.
  useEffect(() => {
    if (!loaded) return;
    const ids = nav.view === 'clips' ? clips.map((c) => c.id) : nav.view === 'highlights' ? projectHighlights.map((h) => h.id) : books.map((b) => b.id);
    if (nav.clip && ids.includes(nav.clip)) return;
    const first = ids[0];
    if (first !== nav.clip) go({ clip: first });
  }, [loaded, nav.view, nav.clip, clips, projectHighlights, books, go]);

  // ---- actions
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { ui.toast(errText(e), true); }
  };

  const newNote = () => run(async () => {
    if (nav.view === 'books') return;
    const c = await send('clip/create', { projectId: nav.project, title: lt('newNoteTitle'), markdown: '' });
    setQuery('');
    setFreshId(c.id);
    go({ view: 'clips', clip: c.id });
    await load();
  });

  const deleteClip = (c: Clip) => run(async () => {
    const ok = await ui.confirm(lt('deleteClip'), { message: lt('deleteClipMsg', { title: c.title.trim() || lt('untitled') }), okLabel: ut('delete'), danger: true });
    if (!ok) return;
    const list = clipMap.get(c.projectId) ?? [];
    const i = list.findIndex((x) => x.id === c.id);
    const neighbour = list[i + 1] ?? list[i - 1];
    await send('clip/delete', { id: c.id });
    if (nav.clip === c.id) go({ clip: neighbour?.id });
    await load();
    ui.toast(lt('clipDeleted'));
  });

  const moveClip = (c: Clip, projectId: string | null, name: string) => run(async () => {
    await send('clip/update', { ...c, projectId });
    ui.toast(lt('moved', { name }));
    await load();
  });

  const reorder = (ids: string[]) => run(async () => {
    const byId = new Map(clips.map((c) => [c.id, c]));
    setClipMap((m) => new Map(m).set(nav.project, ids.map((id) => byId.get(id)!).filter(Boolean)));
    try {
      await send('clip/reorder', { projectId: nav.project, ids });
    } finally {
      await load();
    }
  });

  const jump = (h: Highlight) => run(() => send('highlight/open', { id: h.id }));

  const deleteHighlight = (h: Highlight) => run(async () => {
    if (!(await ui.confirm(lt('deleteHighlight'), { message: lt('deleteHighlightMsg'), okLabel: ut('delete'), danger: true }))) return;
    await send('highlight/delete', { id: h.id });
    await load();
  });

  const deleteBook = (b: BookSummary) => run(async () => {
    if (!(await ui.confirm(lt('deleteBook'), { message: lt('deleteBookMsg', { title: b.title }), okLabel: ut('delete'), danger: true }))) return;
    await send('book/delete', { id: b.id });
    await load();
  });

  const newProject = () => run(async () => {
    const name = await ui.prompt(ut('newProject'), { placeholder: ut('projectName'), okLabel: ut('create') });
    if (!name) return;
    const created = await send('project/create', { name });
    setQuery('');
    go({ project: created.id, view: 'clips', clip: undefined });
    await load();
  });

  const renameProject = (pr: Project) => run(async () => {
    const name = await ui.prompt(lt('renameProject'), { value: pr.name, okLabel: ut('save') });
    if (!name || name === pr.name) return;
    await send('project/update', { ...pr, name });
    await load();
  });

  const deleteProject = (pr: Project) => run(async () => {
    const ok = await ui.confirm(lt('deleteProject', { name: pr.name }), {
      message: lt('deleteProjectMsg', { n: clipCounts.get(pr.id) ?? 0 }), okLabel: ut('delete'), danger: true,
    });
    if (!ok) return;
    await send('project/delete', { id: pr.id });
    if (nav.project === pr.id) go({ project: null, clip: undefined });
    await load();
  });

  const selectProject = (id: string | null) => { setQuery(''); setEditingTitle(false); go({ project: id, view: nav.view === 'books' ? 'clips' : nav.view, clip: undefined }); };
  const setView = (view: LibraryView) => { if (view !== nav.view) go({ view, clip: undefined }); };

  // ---- global keys: Mod-N new note, "/" search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void newNote();
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ---- render
  const selectedClip = nav.view === 'clips' ? clips.find((c) => c.id === nav.clip) : undefined;
  const selectedHl = nav.view === 'highlights' ? projectHighlights.find((h) => h.id === nav.clip) : undefined;
  const searching = query.trim() !== '';

  let listBody: ComponentChildren;
  if (!loaded) {
    listBody = <Empty icon="note" title={lt('loading')} />;
  } else if (nav.view === 'clips') {
    listBody = !clips.length
      ? <Empty icon="note" title={lt('emptyClips')} text={lt('emptyClipsText')} />
      : !shownClips.length
        ? <Empty icon="search" title={lt('emptySearch')} text={lt('emptySearchText')} />
        : <ClipList clips={shownClips} projects={projects} selected={nav.clip} canReorder={!searching}
          onSelect={(id) => go({ clip: id })} onMove={moveClip} onDelete={deleteClip} onReorder={reorder} />;
  } else if (nav.view === 'highlights') {
    listBody = !projectHighlights.length
      ? <Empty icon="highlighter" title={lt('emptyHighlights')} text={lt('emptyHighlightsText')} />
      : !shownHl.length
        ? <Empty icon="search" title={lt('emptySearch')} text={lt('emptySearchText')} />
        : <HighlightList items={shownHl} selected={nav.clip} onSelect={(id) => go({ clip: id })} onJump={jump} onDelete={deleteHighlight} />;
  } else {
    listBody = !books.length
      ? <Empty icon="book" title={lt('noBooks')} text={lt('noBooksText')} />
      : <BookList books={books} selected={nav.clip} onSelect={(id) => go({ clip: id })} onDelete={deleteBook}
        exportSlot={(b) => <ExportMenu subject={{ kind: 'book', id: b.id }} variant="icon" align="right" />} />;
  }

  let detail: ComponentChildren;
  if (selectedClip) {
    detail = <ClipPane key={selectedClip.id} clip={selectedClip} projects={projects} fresh={selectedClip.id === freshId}
      onDelete={() => void deleteClip(selectedClip)} />;
  } else if (selectedHl) {
    detail = <HighlightPane h={selectedHl} onJump={jump} onDelete={deleteHighlight} />;
  } else if (nav.view === 'books' && nav.clip) {
    detail = <BookReader bookId={nav.clip} />;
  } else {
    detail = (
      <section class="pane">
        <Empty icon={nav.view === 'books' ? 'book' : nav.view === 'highlights' ? 'highlighter' : 'note'}
          title={nav.view === 'books' ? lt('pickBook') : nav.view === 'highlights' ? lt('pickHighlight') : lt('pickClip')}
          text={nav.view === 'clips' ? lt('pickClipText') : undefined} />
      </section>
    );
  }

  return (
    <div class="lib">
      <Nav projects={projects} counts={clipCounts} books={books} activeProject={nav.project} booksActive={nav.view === 'books'}
        activeBook={nav.view === 'books' ? nav.clip : undefined} query={query} onQuery={setQuery} searchRef={searchRef}
        onSelectProject={selectProject} onRename={renameProject} onDelete={deleteProject} onNewProject={newProject}
        onSelectBook={(id) => go({ view: 'books', clip: id })} onOpenBooks={() => setView('books')} />

      <section class="list-col">
        <header class="list-head">
          {nav.view === 'books'
            ? <h1 class="list-title">{lt('books')}</h1>
            : editingTitle && project
              ? <input class="list-title-input" defaultValue={project.name} autoFocus aria-label={lt('renameProject')}
                onBlur={(e) => {
                  setEditingTitle(false);
                  const name = e.currentTarget.value.trim();
                  if (name && name !== project.name) void run(async () => { await send('project/update', { ...project, name }); await load(); });
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = project.name; e.currentTarget.blur(); } }} />
              : <h1 class="list-title truncate" title={project ? lt('renameProject') : undefined} onDblClick={() => { if (project) setEditingTitle(true); }}>{projectName}</h1>}
          {nav.view !== 'books' && (
            <>
              <div class="segmented tabs" role="tablist">
                <button type="button" role="tab" aria-selected={nav.view === 'clips'} class={nav.view === 'clips' ? 'on' : ''}
                  onClick={() => setView('clips')}>{lt('notes')} ({clips.length})</button>
                <button type="button" role="tab" aria-selected={nav.view === 'highlights'} class={nav.view === 'highlights' ? 'on' : ''}
                  onClick={() => setView('highlights')}>{lt('highlights')} ({projectHighlights.length})</button>
              </div>
              <div class="list-toolbar">
                <button type="button" class="btn primary sm" onClick={() => void newNote()}><Icon name="plus" size={14} />{lt('newNote')}</button>
                <span class="grow" />
                <ExportMenu subject={{ kind: 'project', projectId: nav.project }} extra={{ kind: 'highlights', projectId: nav.project }}
                  placement="down" align="right" />
              </div>
            </>
          )}
        </header>
        <div class="list-body">{listBody}</div>
      </section>

      <main class="detail">{detail}</main>
    </div>
  );
}
