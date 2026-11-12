import { describe, expect, it } from 'vitest';
import type { Clip } from '@/src/core/types';
import {
  buildGraph, clipTags, initialPositions, neighbourhood, parseInlineTags, parseWikilinks, resolveWikilink, stepLayout,
} from '@/src/library/graph';

const clip = (id: string, title: string, markdown = '', over: Partial<Clip> = {}): Clip => ({
  id, projectId: 'p', kind: 'selection', title, html: '', markdown, tags: [], order: 0, assetIds: [],
  source: { url: '', title, authors: [], accessed: '' }, createdAt: '', updatedAt: '', ...over,
});

describe('parsing', () => {
  it('finds wikilinks with alias/heading, not embeds or code', () => {
    expect(parseWikilinks('[[A]] [[B|bee]] [[C#h]] ![[img.png]] `[[D]]`\n```\n[[E]]\n```')).toEqual(['A', 'B', 'C']);
  });
  it('finds inline tags but not headings, numbers or URL fragments', () => {
    expect(parseInlineTags('# Head\n#rust and #web/dev, (#x) #123 https://a.com/#frag `#code`')).toEqual(['rust', 'web/dev', 'x']);
  });
  it('clipTags merges the tag list and inline tags, normalized', () => {
    expect(clipTags(clip('a', 'A', 'about #Rust', { tags: ['rust', 'Data Science'] }))).toEqual(['rust', 'data-science']);
  });
  it('resolves titles case-insensitively, preferring the given project', () => {
    const list = [clip('1', 'Rust', '', { projectId: 'x' }), clip('2', 'rust ', '', { projectId: 'p' })];
    expect(resolveWikilink('RUST', list, 'p')?.id).toBe('2');
    expect(resolveWikilink('Go', list)).toBeUndefined();
  });
});

describe('buildGraph', () => {
  const clips = [clip('1', 'A', 'see [[B]] and [[B]] and [[Missing]] #t'), clip('2', 'B', 'back to [[A]] #t'), clip('3', 'C')];
  it('dedupes links in both directions and adds tag nodes', () => {
    const g = buildGraph(clips, { withTags: true });
    expect(g.edges.filter((e) => e.kind === 'link')).toHaveLength(1);
    expect(g.edges.filter((e) => e.kind === 'tag')).toHaveLength(2);
    expect(g.nodes.find((n) => n.id === 'tag:t')?.degree).toBe(2);
    expect(g.nodes.find((n) => n.id === '3')?.degree).toBe(0);
  });
  it('without tags only notes remain', () => {
    expect(buildGraph(clips, { withTags: false }).nodes.map((n) => n.kind)).toEqual(['note', 'note', 'note']);
  });
  it('neighbourhood lists direct neighbours', () => {
    const g = buildGraph(clips, { withTags: true });
    expect([...neighbourhood('1', g.edges)].sort()).toEqual(['1', '2', 'tag:t']);
  });
});

describe('layout', () => {
  it('is deterministic, keeps known positions and settles', () => {
    const a = initialPositions(['x', 'y']);
    expect(initialPositions(['x', 'y'])).toEqual(a);
    a.get('x')!.x = 999;
    expect(initialPositions(['x', 'y', 'z'], a).get('x')!.x).toBe(999);
    const pos = initialPositions(['1', '2', '3']);
    const edges = [{ source: '1', target: '2', kind: 'link' as const }];
    let moved = Infinity;
    for (let i = 0; i < 400; i++) moved = stepLayout(pos, edges, 1);
    expect(moved).toBeLessThan(0.5);
    const p1 = pos.get('1')!, p2 = pos.get('2')!;
    expect(Math.hypot(p1.x - p2.x, p1.y - p2.y)).toBeGreaterThan(20);
  });
  it('fixed nodes do not move', () => {
    const pos = initialPositions(['1', '2']);
    Object.assign(pos.get('1')!, { x: 5, y: 5, fixed: true });
    stepLayout(pos, [], 1);
    expect(pos.get('1')).toMatchObject({ x: 5, y: 5 });
  });
});

describe('wikilinks in rendered markdown', () => {
  it('renders [[links]] as in-page anchors and keeps external links in a new tab', async () => {
    const { renderMarkdown } = await import('@/src/ui/markdown');
    const html = renderMarkdown('[[Rust Basics|basics]] [[A#h]] [x](https://a.com) [[<img src=x onerror=1>]]');
    expect(html).toContain('<a href="#" class="wikilink" data-wikilink="Rust Basics">basics</a>');
    expect(html).toContain('data-wikilink="A">A#h</a>');
    expect(html).toContain('href="https://a.com" target="_blank" rel="noopener noreferrer"');
    expect(html).not.toContain('<img');
  });
});
