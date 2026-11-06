// Graph view (Obsidian-like): notes as dots, [[wikilinks]] and tags as edges. Pan: drag background, zoom: wheel,
// drag a node to pin it, click a note to open it, click a tag to search by it.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Clip, Project } from '@/src/core/types';
import { Empty } from '@/src/ui/components';
import { buildGraph, initialPositions, neighbourhood, stepLayout, type Pos } from './graph';
import { lt } from './strings';

const PROJECT_COLORS = ['#5b5bd6', '#e5484d', '#2f9e6b', '#f76b15', '#0090ff', '#d6409f', '#8e4ec6', '#12a594'];

type Drag =
  | { kind: 'pan'; x: number; y: number; panX: number; panY: number }
  | { kind: 'node'; id: string; moved: boolean; x: number; y: number };

export function GraphView(p: {
  projectClips: Clip[]; allClips: Clip[]; projects: Project[];
  onOpen: (c: Clip) => void; onTag: (tag: string) => void;
}) {
  const [scope, setScope] = useState<'project' | 'all'>('project');
  const [withTags, setWithTags] = useState(true);
  const [withFolders, setWithFolders] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [, setTick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const pos = useRef<Map<string, Pos>>(new Map());
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | undefined>(undefined);
  const alpha = useRef(1);

  const clips = scope === 'all' ? p.allClips : p.projectClips;
  const graph = useMemo(() => buildGraph(clips, { withTags, withFolders }), [clips, withTags, withFolders]);
  const edgesRef = useRef(graph.edges);
  edgesRef.current = graph.edges;
  const byId = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);
  const colorOf = useMemo(() => {
    const m = new Map<string | null, string>([[null, '#8e8e96']]);
    p.projects.forEach((x, i) => m.set(x.id, PROJECT_COLORS[i % PROJECT_COLORS.length]!));
    return m;
  }, [p.projects]);

  // (Re)start the layout whenever the graph changes; positions of known nodes are kept.
  const kick = (a = 1) => {
    alpha.current = Math.max(alpha.current, a);
    if (frame.current !== undefined) return;
    const loop = () => {
      const moved = stepLayout(pos.current, edgesRef.current, alpha.current);
      alpha.current *= 0.985;
      setTick((t) => t + 1);
      if (alpha.current > 0.02 && moved > 0.05 * pos.current.size) frame.current = requestAnimationFrame(loop);
      else frame.current = undefined;
    };
    frame.current = requestAnimationFrame(loop);
  };
  useEffect(() => {
    pos.current = initialPositions(graph.nodes.map((n) => n.id), pos.current);
    kick(1);
  }, [graph]);
  useEffect(() => () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - r.width / 2 - view.x) / view.k, y: (clientY - r.top - r.height / 2 - view.y) / view.k };
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = svgRef.current!.getBoundingClientRect();
    const k = Math.min(4, Math.max(0.2, view.k * Math.exp(-e.deltaY * 0.0015)));
    // Zoom around the cursor.
    const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
    setView({ k, x: cx - ((cx - view.x) / view.k) * k, y: cy - ((cy - view.y) / view.k) * k });
  };
  const onDown = (e: PointerEvent, id?: string) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = id ? { kind: 'node', id, moved: false, x: e.clientX, y: e.clientY }
      : { kind: 'pan', x: e.clientX, y: e.clientY, panX: view.x, panY: view.y };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') { setView((v) => ({ ...v, x: d.panX + e.clientX - d.x, y: d.panY + e.clientY - d.y })); return; }
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    const node = pos.current.get(d.id);
    if (!node) return;
    const w = toWorld(e.clientX, e.clientY);
    Object.assign(node, { x: w.x, y: w.y, vx: 0, vy: 0, fixed: true });
    kick(0.3);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind !== 'node' || d.moved) return;
    const c = byId.get(d.id);
    if (c) p.onOpen(c);
    else if (d.id.startsWith('tag:')) p.onTag(d.id.slice(4));
  };

  const focus = hover ? neighbourhood(hover, graph.edges) : null;
  const radius = (deg: number, tag: boolean) => (tag ? 3.5 : 5) + Math.sqrt(deg) * 1.8;

  return (
    <div class="graph">
      <div class="graph-bar">
        <div class="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={scope === 'project'} class={scope === 'project' ? 'on' : ''}
            onClick={() => setScope('project')}>{lt('graphProject')}</button>
          <button type="button" role="tab" aria-selected={scope === 'all'} class={scope === 'all' ? 'on' : ''}
            onClick={() => setScope('all')}>{lt('graphAll')}</button>
        </div>
        <label class="row small"><input type="checkbox" checked={withTags} onChange={(e) => setWithTags(e.currentTarget.checked)} />{lt('graphTags')}</label>
        <label class="row small"><input type="checkbox" checked={withFolders} onChange={(e) => setWithFolders(e.currentTarget.checked)} />{lt('folders')}</label>
        <span class="grow" />
        <span class="muted small">{lt('graphHint')}</span>
        <button type="button" class="btn sm ghost" onClick={() => { setView({ x: 0, y: 0, k: 1 }); for (const n of pos.current.values()) n.fixed = false; kick(1); }}>
          {lt('graphReset')}
        </button>
      </div>
      {!graph.nodes.length ? (
        <Empty icon="graph" title={lt('graphEmpty')} text={lt('graphEmptyText')} />
      ) : (
        <svg ref={svgRef} class="graph-canvas" onWheel={onWheel} onPointerDown={(e) => onDown(e)} onPointerMove={onMove}
          onPointerUp={onUp} onPointerLeave={() => setHover(null)} role="img" aria-label={lt('graph')}>
          <g transform={`translate(${svgRef.current ? svgRef.current.clientWidth / 2 + view.x : view.x} ${svgRef.current ? svgRef.current.clientHeight / 2 + view.y : view.y}) scale(${view.k})`}>
            {graph.edges.map((e) => {
              const a = pos.current.get(e.source), b = pos.current.get(e.target);
              if (!a || !b) return null;
              const on = focus ? focus.has(e.source) && focus.has(e.target) : true;
              return <line key={`${e.source}-${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                class={`g-edge ${e.kind} ${on ? '' : 'dim'} ${focus && on ? 'hot' : ''}`} />;
            })}
            {graph.nodes.map((n) => {
              const q = pos.current.get(n.id);
              if (!q) return null;
              const tag = n.kind !== 'note';
              const on = focus ? focus.has(n.id) : true;
              const r = radius(n.degree, tag);
              const showLabel = n.id === hover || (on && (view.k > 0.7 || n.degree >= 3));
              return (
                <g key={n.id} class={`g-node ${n.kind} ${on ? '' : 'dim'}`} transform={`translate(${q.x} ${q.y})`}
                  onPointerDown={(e) => onDown(e, n.id)} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
                  {n.kind === 'folder'
                    ? <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} />
                    : <circle r={r} style={!tag && scope === 'all' ? { fill: colorOf.get(n.projectId ?? null) } : undefined} />}
                  {showLabel && <text y={r + 11} text-anchor="middle" style={{ fontSize: `${11 / Math.max(0.8, view.k)}px` }}>{n.label.length > 40 ? `${n.label.slice(0, 40)}…` : n.label}</text>}
                  <title>{n.label}</title>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
