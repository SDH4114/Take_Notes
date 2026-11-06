// Pure helpers for the library page: search, ordering, URL state, dates.
import { translator, uiLang, type Lang } from '@/src/core/i18n';
import type { Clip, Highlight } from '@/src/core/types';
import type { IconName } from '@/src/ui/icons';
import { domainOf, INBOX } from '@/src/ui/components';

// ---------- search

function matches(parts: (string | undefined)[], query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = parts.filter(Boolean).join('\n').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export const filterClips = (list: Clip[], query: string): Clip[] =>
  list.filter((c) => matches([c.title, c.markdown, c.note, c.source.url ? domainOf(c.source.url) : '', c.source.title, ...c.tags.map((t) => `#${t}`)], query));

export const filterHighlights = (list: Highlight[], query: string): Highlight[] =>
  list.filter((h) => matches([h.text, h.note, h.body, h.source.title, h.source.url ? domainOf(h.source.url) : ''], query));

export function countByProject(items: { projectId: string | null }[]): Map<string | null, number> {
  const m = new Map<string | null, number>();
  for (const i of items) m.set(i.projectId, (m.get(i.projectId) ?? 0) + 1);
  return m;
}

// ---------- ordering

/** New id order after dragging `id` next to `target`. Unknown ids / same id leave the order unchanged. */
export function moveId(ids: string[], id: string, target: string, where: 'before' | 'after'): string[] {
  if (id === target || !ids.includes(id) || !ids.includes(target)) return ids;
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(target) + (where === 'after' ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

// ---------- URL state

export type LibraryView = 'clips' | 'highlights' | 'books' | 'graph' | 'board';
export interface LibraryState { project: string | null; clip: string | undefined; view: LibraryView }
const VIEWS: LibraryView[] = ['clips', 'highlights', 'books', 'graph', 'board'];
/** Views that take the whole width (no list + detail split). */
export const isWideView = (v: LibraryView): boolean => v === 'graph' || v === 'board';

export function parseParams(search: string): LibraryState {
  const q = new URLSearchParams(search);
  const project = q.get('project');
  const view = q.get('view') as LibraryView | null;
  return {
    project: project && project !== INBOX ? project : null,
    clip: q.get('clip') || undefined,
    view: view && VIEWS.includes(view) ? view : 'clips',
  };
}

export function buildParams(s: LibraryState): string {
  const q = new URLSearchParams();
  q.set('project', s.project ?? INBOX);
  if (s.clip) q.set('clip', s.clip);
  if (s.view !== 'clips') q.set('view', s.view);
  return `?${q}`;
}

// ---------- display

export function clipIcon(c: Clip): IconName {
  if (!c.source.url) return 'note';
  switch (c.kind) {
    case 'selection': return 'scissors';
    case 'transcript': return 'video';
    case 'chapter': return 'book';
    default: return 'globe';
  }
}

export function snippet(text: string | undefined, max: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

const dateDict = { ru: { justNow: 'только что' }, en: { justNow: 'just now' } };
const tDateLang = (lang: Lang) => translator(dateDict, lang);

export function relativeDate(iso: string, now: Date = new Date(), lang: Lang = uiLang()): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const sec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return tDateLang(lang)('justNow');
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(sec / 86400), 'day');
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(lang, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}
