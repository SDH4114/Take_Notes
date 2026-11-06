// Pure graph logic for the Library "Graph" view (Obsidian-like): notes linked by [[wikilinks]] and shared tags.
import type { Clip } from '@/src/core/types';

/** Remove fenced code blocks and inline code: links/tags inside code are not links. */
function stripCode(md: string): string {
  return md.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[^\n]*|$)/gm, '').replace(/`[^`\n]+`/g, '');
}

/** Targets of `[[Title]]`, `[[Title|alias]]`, `[[Title#heading]]` (trimmed, original case). */
export function parseWikilinks(md: string): string[] {
  const out: string[] = [];
  for (const m of stripCode(md).matchAll(/(?<!!)\[\[([^\]\n|#^]+)(?:[#^][^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g)) {
    const target = m[1]!.trim();
    if (target) out.push(target);
  }
  return out;
}

/** Inline `#tags` (Obsidian style: letters/digits/_-/ and at least one non-digit). Headings and URL fragments are not tags. */
export function parseInlineTags(md: string): string[] {
  const out: string[] = [];
  for (const m of stripCode(md).matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]+)/gu)) {
    const tag = m[1]!;
    if (/\D/.test(tag)) out.push(tag);
  }
  return out;
}

export const normTag = (t: string): string => t.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase();
const normTitle = (t: string): string => t.trim().replace(/\s+/g, ' ').toLowerCase();

/** Tags of a clip: its tag list plus inline #tags, normalized and unique. */
export function clipTags(c: Clip): string[] {
  return [...new Set([...c.tags, ...parseInlineTags(c.markdown)].map(normTag).filter(Boolean))];
}

/** Find the clip a [[link]] points to; clips in `preferProject` win over same-titled clips elsewhere. */
export function resolveWikilink(target: string, clips: readonly Clip[], preferProject?: string | null): Clip | undefined {
  const key = normTitle(target);
  const hits = clips.filter((c) => normTitle(c.title) === key);
  return hits.find((c) => c.projectId === preferProject) ?? hits[0];
}

export interface GraphNode {
  id: string;
  kind: 'note' | 'tag' | 'folder';
  label: string;
  /** Project of a note (for coloring); undefined for tags. */
  projectId?: string | null;
  /** Number of edges. */
  degree: number;
}
export interface GraphEdge { source: string; target: string; kind: 'link' | 'tag' | 'folder' }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export const tagNodeId = (tag: string) => `tag:${tag}`;
/** Folders are per project: the same name in two projects is two folders. */
export const folderNodeId = (projectId: string | null, folder: string) => `folder:${projectId ?? ''}:${folder.toLowerCase()}`;

/**
 * Build the graph of `clips`. Links resolve only inside `clips`; `withTags` adds a node per tag,
 * `withFolders` a node per folder that its notes hang on.
 */
export function buildGraph(clips: readonly Clip[], opts: { withTags: boolean; withFolders?: boolean }): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const c of clips) nodes.set(c.id, { id: c.id, kind: 'note', label: c.title.trim() || '…', projectId: c.projectId, degree: 0 });
  const add = (source: string, target: string, kind: GraphEdge['kind']) => {
    const key = kind === 'link' ? [source, target].sort().join('→') : `${source}→${target}`;
    if (source === target || seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
    nodes.get(source)!.degree++;
    nodes.get(target)!.degree++;
  };
  for (const c of clips) {
    for (const target of parseWikilinks(c.markdown)) {
      const to = resolveWikilink(target, clips, c.projectId);
      if (to) add(c.id, to.id, 'link');
    }
    const folder = (c.section ?? '').trim().replace(/\s+/g, ' ');
    if (opts.withFolders && folder) {
      const id = folderNodeId(c.projectId, folder);
      if (!nodes.has(id)) nodes.set(id, { id, kind: 'folder', label: folder, projectId: c.projectId, degree: 0 });
      add(c.id, id, 'folder');
    }
    if (!opts.withTags) continue;
    for (const tag of clipTags(c)) {
      const id = tagNodeId(tag);
      if (!nodes.has(id)) nodes.set(id, { id, kind: 'tag', label: `#${tag}`, degree: 0 });
      add(c.id, id, 'tag');
    }
  }
  return { nodes: [...nodes.values()], edges };
}

// ---------- force layout (small graphs: O(n²) repulsion is fine up to a few hundred nodes)

export interface Pos { x: number; y: number; vx: number; vy: number; fixed?: boolean }

/** Deterministic start positions on a spiral (same graph → same picture). */
export function initialPositions(ids: readonly string[], prev?: ReadonlyMap<string, Pos>): Map<string, Pos> {
  const out = new Map<string, Pos>();
  ids.forEach((id, i) => {
    const old = prev?.get(id);
    if (old) { out.set(id, { ...old }); return; }
    const a = i * 2.399963; // golden angle
    const r = 30 * Math.sqrt(i + 1);
    out.set(id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 });
  });
  return out;
}

/** One simulation step; returns the total movement (stop when it gets small). */
export function stepLayout(pos: Map<string, Pos>, edges: readonly GraphEdge[], alpha = 1): number {
  const list = [...pos.values()];
  const REPULSE = 2200, SPRING = 0.04, LENGTH = 70, GRAVITY = 0.012, DAMP = 0.82;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = (i - j) * 0.1; dy = 0.1; d2 = dx * dx + dy * dy; }
      const f = (REPULSE / d2) * alpha;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
  }
  for (const e of edges) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - LENGTH) * SPRING * alpha;
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  }
  let moved = 0;
  for (const p of list) {
    p.vx = (p.vx - p.x * GRAVITY * alpha) * DAMP;
    p.vy = (p.vy - p.y * GRAVITY * alpha) * DAMP;
    if (p.fixed) { p.vx = 0; p.vy = 0; continue; }
    p.x += p.vx; p.y += p.vy;
    moved += Math.abs(p.vx) + Math.abs(p.vy);
  }
  return moved;
}

/** Ids of a node and its direct neighbours (for hover focus). */
export function neighbourhood(id: string, edges: readonly GraphEdge[]): Set<string> {
  const out = new Set([id]);
  for (const e of edges) {
    if (e.source === id) out.add(e.target);
    if (e.target === id) out.add(e.source);
  }
  return out;
}
