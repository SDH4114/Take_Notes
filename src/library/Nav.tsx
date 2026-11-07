// Left navigation: search, projects (with counts and hover actions), books, settings.
import type { ComponentChildren, Ref } from 'preact';
import { browser } from 'wxt/browser';
import type { Project } from '@/src/core/types';
import { IconButton } from '@/src/ui/components';
import { Icon, Logo } from '@/src/ui/icons';
import { ut } from '@/src/ui/strings';
import type { BookSummary } from './Lists';
import { ImportMenu } from './ImportMenu';
import { lt } from './strings';

export function Nav(p: {
  projects: Project[]; counts: Map<string | null, number>; books: BookSummary[];
  activeProject: string | null; booksActive: boolean; activeBook: string | undefined;
  query: string; onQuery: (q: string) => void; searchRef: Ref<HTMLInputElement>;
  onSelectProject: (id: string | null) => void; onRename: (pr: Project) => void; onDelete: (pr: Project) => void;
  onNewProject: () => void; onImported: (projectId: string | null) => void; onSelectBook: (id: string) => void; onOpenBooks: () => void;
}) {
  const count = (id: string | null) => p.counts.get(id) ?? 0;
  return (
    <nav class="nav">
      <div class="brand">
        <span class="logo"><Logo size={22} /></span>
        <span class="brand-name">TakeNotes</span>
      </div>

      <div class="search">
        <Icon name="search" size={14} />
        <input class="search-input" ref={p.searchRef} value={p.query} placeholder={lt('search')} aria-label={lt('search')}
          onInput={(e) => p.onQuery(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { p.onQuery(''); e.currentTarget.blur(); } }} />
        {p.query ? <IconButton icon="x" size="sm" title={ut('close')} onClick={() => p.onQuery('')} /> : <span class="kbd">/</span>}
      </div>

      <div class="nav-scroll">
        <div class="nav-section">{lt('projects')}</div>
        <NavRow icon="inbox" label={ut('inbox')} count={count(null)} active={!p.booksActive && p.activeProject === null}
          onClick={() => p.onSelectProject(null)} />
        {p.projects.map((pr) => (
          <NavRow key={pr.id} icon="folder" label={pr.name} count={count(pr.id)} active={!p.booksActive && p.activeProject === pr.id}
            onClick={() => p.onSelectProject(pr.id)}
            actions={<>
              <IconButton icon="pencil" size="sm" title={ut('rename')} onClick={() => p.onRename(pr)} />
              <IconButton icon="trash" size="sm" danger title={ut('delete')} onClick={() => p.onDelete(pr)} />
            </>} />
        ))}
        <button type="button" class="nav-add" onClick={p.onNewProject}><Icon name="plus" size={14} />{ut('newProject')}</button>
        <ImportMenu projectId={p.activeProject} onDone={p.onImported} />

        <div class="nav-section nav-section-link">
          <button type="button" class="section-btn" onClick={p.onOpenBooks}>{lt('books')}</button>
        </div>
        {p.books.map((b) => (
          <NavRow key={b.id} icon="book" label={b.title} active={p.booksActive && p.activeBook === b.id} onClick={() => p.onSelectBook(b.id)} />
        ))}
      </div>

      <div class="nav-foot">
        <button type="button" class="nav-row" onClick={() => void browser.runtime.openOptionsPage()}>
          <Icon name="settings" size={16} /><span class="nav-label">{lt('settings')}</span>
        </button>
      </div>
    </nav>
  );
}

function NavRow(p: {
  icon: 'inbox' | 'folder' | 'book'; label: string; count?: number; active: boolean; onClick: () => void;
  actions?: ComponentChildren;
}) {
  return (
    <div class={`nav-row ${p.active ? 'active' : ''}`} role="button" tabIndex={0} onClick={p.onClick}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.onClick(); } }}>
      <Icon name={p.icon} size={16} />
      <span class="nav-label truncate" title={p.label}>{p.label}</span>
      {p.actions && <span class="nav-actions">{p.actions}</span>}
      {p.count !== undefined && <span class="nav-count">{p.count}</span>}
    </div>
  );
}
