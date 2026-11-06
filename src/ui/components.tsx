// Shared Preact UI components for extension pages (popup, sidepanel, library, crawler, options).
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send } from '@/src/core/messages';
import type { ExportFormat, Project } from '@/src/core/types';
import { Icon, type IconName } from './icons';
import { ut } from './strings';

export const INBOX = '__inbox__';
export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ---------- IconButton

export function IconButton(p: {
  icon: IconName; title: string; onClick?: (e: MouseEvent) => void; danger?: boolean; active?: boolean;
  disabled?: boolean; size?: 'sm'; iconSize?: number;
}) {
  const cls = ['icon-btn', p.danger && 'danger', p.active && 'active', p.size].filter(Boolean).join(' ');
  return (
    <button type="button" class={cls} title={p.title} aria-label={p.title} disabled={p.disabled}
      onClick={(e) => { e.stopPropagation(); p.onClick?.(e); }}>
      <Icon name={p.icon} size={p.iconSize ?? (p.size === 'sm' ? 14 : 16)} />
    </button>
  );
}

// ---------- Menu (dropdown)

export interface MenuItem {
  label: string; hint?: string; icon?: IconName; onSelect: () => void; separatorBefore?: boolean;
  /** Small group caption shown above this item. */
  section?: string;
}

export function Menu(p: {
  trigger: (open: () => void, isOpen: boolean) => ComponentChildren; items: MenuItem[];
  placement?: 'up' | 'down'; align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span class="menu-anchor" ref={ref}>
      {p.trigger(() => setOpen((v) => !v), open)}
      {open && (
        <div class={`menu ${p.placement ?? 'down'} ${p.align ?? 'left'}`} role="menu">
          {p.items.map((it) => (
            <>
              {it.separatorBefore && <div class="menu-sep" />}
              {it.section && <div class="menu-section" role="presentation">{it.section}</div>}
              <button type="button" class="menu-item" role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}>
                {it.icon && <Icon name={it.icon} />}
                <span>{it.label}{it.hint && <span class="hint">{it.hint}</span>}</span>
              </button>
            </>
          ))}
        </div>
      )}
    </span>
  );
}

// ---------- Toasts + dialogs (one provider per page)

interface Toast { id: number; text: string; error?: boolean }
interface DialogState {
  title: string; message?: string; input?: { value: string; placeholder?: string };
  okLabel: string; danger?: boolean; resolve: (v: string | boolean | null) => void;
}
interface UiApi {
  toast(text: string, error?: boolean): void;
  prompt(title: string, opts?: { value?: string; placeholder?: string; okLabel?: string }): Promise<string | null>;
  confirm(title: string, opts?: { message?: string; okLabel?: string; danger?: boolean }): Promise<boolean>;
}
const UiCtx = createContext<UiApi | null>(null);

export function UiProvider({ children }: { children: ComponentChildren }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const seq = useRef(0);
  const toast = useCallback((text: string, error = false) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 5000 : 2200);
  }, []);
  // Stable identity: pages put `ui` in effect/callback deps; a new object per render made a failing load
  // re-run forever (error → toast → re-render → new ui → load again).
  const api = useMemo<UiApi>(() => ({
    toast,
    prompt: (title, o = {}) => new Promise((resolve) => setDialog((prev) => { prev?.resolve(null); return {
      title, input: { value: o.value ?? '', placeholder: o.placeholder }, okLabel: o.okLabel ?? ut('save'),
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    }; })),
    confirm: (title, o = {}) => new Promise((resolve) => setDialog((prev) => {
      prev?.resolve(null); // an open dialog is cancelled, its caller must not hang
      return { title, message: o.message, okLabel: o.okLabel ?? ut('confirm'), danger: o.danger, resolve: (v) => resolve(v === true) };
    })),
  }), [toast]);
  return (
    <UiCtx.Provider value={api}>
      {children}
      {dialog && <Dialog state={dialog} close={(v) => { dialog.resolve(v); setDialog(null); }} />}
      <div class="toasts">
        {toasts.map((t) => (
          <div key={t.id} class={`toast ${t.error ? 'error' : ''}`}>
            {!t.error && <Icon name="check" size={14} />}{t.text}
          </div>
        ))}
      </div>
    </UiCtx.Provider>
  );
}

export function useUi(): UiApi {
  const v = useContext(UiCtx);
  if (!v) throw new Error('useUi() outside <UiProvider>');
  return v;
}

function Dialog({ state, close }: { state: DialogState; close: (v: string | boolean | null) => void }) {
  const [value, setValue] = useState(state.input?.value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const ok = () => {
    if (state.input) { if (value.trim()) close(value.trim()); } else close(true);
  };
  return (
    <div class="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(state.input ? null : false); }}>
      <div class="dialog" role="dialog" aria-modal="true"
        onKeyDown={(e) => { if (e.key === 'Escape') close(state.input ? null : false); if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) ok(); }}>
        <h3>{state.title}</h3>
        {state.message && <p class="muted" style={{ margin: 0 }}>{state.message}</p>}
        {state.input && (
          <input ref={inputRef} class="input" value={value} placeholder={state.input.placeholder}
            onInput={(e) => setValue(e.currentTarget.value)} />
        )}
        <div class="actions">
          <button type="button" class="btn ghost" onClick={() => close(state.input ? null : false)}>{ut('cancel')}</button>
          <button type="button" class={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={ok}
            disabled={!!state.input && !value.trim()} autoFocus={!state.input}>{state.okLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Empty state

export function Empty(p: { icon: IconName; title: string; text?: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon name={p.icon} size={32} stroke={1.5} />
      <b>{p.title}</b>
      {p.text && <span class="small">{p.text}</span>}
      {p.children}
    </div>
  );
}

// ---------- Project picker with inline "New project"

export function ProjectPicker(p: {
  projects: Project[]; value: string | null; onChange: (id: string | null) => void;
  onCreated?: (project: Project) => void; compact?: boolean;
}) {
  const ui = useUi();
  const create = async () => {
    const name = await ui.prompt(ut('newProject'), { placeholder: ut('projectName'), okLabel: ut('create') });
    if (!name) return;
    try {
      const proj = await send('project/create', { name });
      p.onCreated?.(proj);
      p.onChange(proj.id);
    } catch (e) {
      ui.toast(errText(e), true);
    }
  };
  return (
    <div class="row">
      <select class="input grow" value={p.value ?? INBOX} title={ut('project')}
        onChange={(e) => { const v = e.currentTarget.value; p.onChange(v === INBOX ? null : v); }}>
        <option value={INBOX}>{ut('inbox')}</option>
        {p.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {p.compact
        ? <IconButton icon="plus" title={ut('newProject')} onClick={create} />
        : <button type="button" class="btn" onClick={create} title={ut('newProject')}><Icon name="plus" size={14} />{ut('newProject')}</button>}
    </div>
  );
}

// ---------- Export menu

export type ExportSubject =
  | { kind: 'clip'; id: string }
  | { kind: 'project'; projectId: string | null }
  | { kind: 'book'; id: string }
  | { kind: 'board'; projectId: string | null }
  | { kind: 'highlights'; projectId?: string | null; url?: string };

const OPTIONS: Record<ExportSubject['kind'], { format: ExportFormat; label: () => string; hint: () => string; icon: IconName }[]> = {
  clip: [
    { format: 'md', label: () => ut('exportMd'), hint: () => ut('exportMdHint'), icon: 'file' },
    { format: 'md-zip', label: () => ut('exportZip'), hint: () => ut('exportZipHint'), icon: 'layers' },
    { format: 'pdf', label: () => ut('exportPdf'), hint: () => ut('exportPdfHint'), icon: 'book' },
  ],
  // Whole project only: single notes are exported from the note itself.
  project: [
    { format: 'md-folder-zip', label: () => ut('exportProject'), hint: () => ut('exportProjectHint'), icon: 'folder' },
    { format: 'pdf-zip', label: () => ut('exportProjectPdf'), hint: () => ut('exportProjectPdfHint'), icon: 'book' },
  ],
  board: [
    { format: 'md', label: () => ut('exportBoardMd'), hint: () => ut('exportBoardMdHint'), icon: 'file' },
    { format: 'pdf', label: () => ut('exportPdf'), hint: () => ut('exportBoardPdfHint'), icon: 'book' },
  ],
  book: [
    { format: 'pdf', label: () => ut('exportPdf'), hint: () => ut('exportPdfHint'), icon: 'book' },
    { format: 'md', label: () => ut('exportMd'), hint: () => ut('exportMdHint'), icon: 'file' },
    { format: 'md-folder-zip', label: () => ut('exportFolder'), hint: () => ut('exportFolderHint'), icon: 'folder' },
  ],
  highlights: [
    { format: 'md', label: () => ut('exportHlMd'), hint: () => ut('exportHlMdHint'), icon: 'highlighter' },
    { format: 'pdf', label: () => ut('exportHlPdf'), hint: () => ut('exportHlPdfHint'), icon: 'book' },
    { format: 'anki-tsv', label: () => ut('exportAnki'), hint: () => ut('exportAnkiHint'), icon: 'layers' },
  ],
};

export async function runExport(subject: ExportSubject, format: ExportFormat): Promise<void> {
  switch (subject.kind) {
    case 'clip': return send('export/clip', { id: subject.id, format });
    case 'project':
      // Built here (lazy chunk), not in the background; see src/export/pdfzip.ts.
      if (format === 'pdf-zip') return (await import('@/src/export/pdfzip')).exportProjectPdfZip(subject.projectId);
      return send('export/project', { projectId: subject.projectId, format });
    case 'book': return send('export/book', { id: subject.id, format });
    case 'board': return send('export/board', { projectId: subject.projectId, format: format === 'pdf' ? 'pdf' : 'md' });
    case 'highlights': return send('export/highlights', { projectId: subject.projectId, url: subject.url, format });
  }
}

/** "Export ▾" button. `extra` adds e.g. highlight exports to a project menu. */
export function ExportMenu(p: {
  subject: ExportSubject; extra?: ExportSubject;
  /** Only these formats of `extra` (e.g. just Anki for highlights). */
  extraFormats?: ExportFormat[];
  placement?: 'up' | 'down'; align?: 'left' | 'right';
  variant?: 'primary' | 'default' | 'icon'; label?: string;
}) {
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const go = async (s: ExportSubject, f: ExportFormat) => {
    setBusy(true);
    try {
      await runExport(s, f);
      ui.toast(ut('exported'));
    } catch (e) {
      ui.toast(errText(e), true);
    } finally {
      setBusy(false);
    }
  };
  // With an extra group the menu gets captions, so the two groups (whole project vs. highlights only) can't be confused.
  const caption = (k: ExportSubject['kind']) => (k === 'highlights' ? ut('menuHighlightsOnly') : k === 'project' ? ut('menuProjectAll') : undefined);
  const extraOptions = p.extra ? OPTIONS[p.extra.kind].filter((o) => !p.extraFormats || p.extraFormats.includes(o.format)) : [];
  const items: MenuItem[] = OPTIONS[p.subject.kind].map((o, i) => ({
    label: o.label(), hint: o.hint(), icon: o.icon, onSelect: () => void go(p.subject, o.format),
    section: p.extra && i === 0 ? caption(p.subject.kind) : undefined,
  }));
  if (p.extra) {
    extraOptions.forEach((o, i) => items.push({
      label: o.label(), hint: o.hint(), icon: o.icon, separatorBefore: i === 0, section: i === 0 ? caption(p.extra!.kind) : undefined,
      onSelect: () => void go(p.extra!, o.format),
    }));
  }
  return (
    <Menu placement={p.placement} align={p.align} items={items}
      trigger={(toggle) => p.variant === 'icon'
        ? <IconButton icon="download" title={ut('export')} onClick={toggle} disabled={busy} />
        : (
          <button type="button" class={`btn ${p.variant === 'primary' ? 'primary' : ''}`} onClick={toggle} disabled={busy}>
            <Icon name="download" size={14} />{busy ? ut('exporting') : (p.label ?? ut('export'))}<Icon name="chevronDown" size={14} />
          </button>
        )} />
  );
}

// ---------- Library tab

export interface LibraryTarget { project?: string | null; clip?: string; view?: 'clips' | 'highlights' | 'books' }

/** Open (or focus) the library tab, optionally at a project/clip. */
export async function openLibrary(target: LibraryTarget = {}): Promise<void> {
  const q = new URLSearchParams();
  if (target.project !== undefined) q.set('project', target.project ?? INBOX);
  if (target.clip) q.set('clip', target.clip);
  if (target.view) q.set('view', target.view);
  const base = browser.runtime.getURL('/library.html');
  const url = q.toString() ? `${base}?${q}` : base;
  const [existing] = await browser.tabs.query({ url: `${base}*` });
  if (existing?.id != null) {
    await browser.tabs.update(existing.id, { active: true, url });
    if (existing.windowId != null) await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url });
  }
}

/** Hostname without www., for source labels. */
export function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
