// Pure helpers for folders inside a project. A folder is the clip's `section`; the stored list keeps order + empty folders.
import type { Clip } from '@/src/core/types';

export const folderName = (s: string | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ');

/** Stored folders (their order) plus any folder only found on clips (appended, sorted). */
export function folderList(stored: readonly string[], clips: readonly Clip[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (f: string) => {
    const n = folderName(f);
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
  };
  stored.forEach(push);
  const extra = [...new Set(clips.map((c) => folderName(c.section)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  extra.forEach(push);
  return out;
}

export interface FolderGroup { folder: string | null; clips: Clip[] }

/** Notes without a folder first, then one group per folder (empty folders included); clips by order. */
export function groupByFolder(clips: readonly Clip[], list: readonly string[]): FolderGroup[] {
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const key = (c: Clip) => folderName(c.section).toLowerCase();
  const groups: FolderGroup[] = [{ folder: null, clips: sorted.filter((c) => !key(c)) }];
  for (const f of list) groups.push({ folder: f, clips: sorted.filter((c) => key(c) === f.toLowerCase()) });
  return groups;
}

export function renameFolder(list: readonly string[], from: string, to: string): string[] | null {
  const name = folderName(to);
  if (!name) return null;
  if (list.some((f) => f.toLowerCase() === name.toLowerCase() && f.toLowerCase() !== from.toLowerCase())) return null;
  return list.map((f) => (f === from ? name : f));
}
