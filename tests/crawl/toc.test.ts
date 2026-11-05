import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectToc, inScope, scopePrefix, entriesFromContainer } from '@/src/crawl/toc';

const load = (name: string): Document =>
  new DOMParser().parseFromString(readFileSync(`tests/fixtures/${name}`, 'utf8'), 'text/html');

describe('scopePrefix', () => {
  it('metanit tutorial page scopes to the section /rust/', () => {
    expect(scopePrefix('https://metanit.com/rust/tutorial/1.1.php')).toBe('https://metanit.com/rust/');
  });
  it('uses the directory of the page otherwise', () => {
    expect(scopePrefix('https://doc.rust-lang.org/book/ch01-01-installation.html')).toBe('https://doc.rust-lang.org/book/');
    expect(scopePrefix('https://acme.dev/docs/guide/intro.html#x')).toBe('https://acme.dev/docs/guide/');
    expect(scopePrefix('https://docs.python.org/3/tutorial/introduction.html')).toBe('https://docs.python.org/3/tutorial/');
  });
  it('treats a trailing slash path as the directory itself', () => {
    expect(scopePrefix('https://metanit.com/rust/')).toBe('https://metanit.com/rust/');
    expect(scopePrefix('https://metanit.com/rust')).toBe('https://metanit.com/');
    expect(scopePrefix('https://acme.dev/index.html')).toBe('https://acme.dev/');
  });
});

describe('inScope', () => {
  const p = 'https://metanit.com/rust/';
  it('accepts same origin under prefix', () => {
    expect(inScope('https://metanit.com/rust/tutorial/1.1.php', p)).toBe(true);
    expect(inScope('https://metanit.com/rust/', p)).toBe(true);
  });
  it('rejects other origin, other path, or sibling with common string prefix', () => {
    expect(inScope('https://example.org/rust/a', p)).toBe(false);
    expect(inScope('https://metanit.com/python/a', p)).toBe(false);
    expect(inScope('https://metanit.com/rustacean/a', p)).toBe(false);
    expect(inScope('not a url', p)).toBe(false);
  });
});

describe('detectToc: metanit', () => {
  it('index page: lists chapters in order, deduped, in scope, HTML only', () => {
    const e = detectToc(load('crawl-metanit-index.html'), 'https://metanit.com/rust/tutorial/');
    expect(e.map((x) => x.url)).toEqual([
      'https://metanit.com/rust/tutorial/1.1.php',
      'https://metanit.com/rust/tutorial/1.2.php',
      'https://metanit.com/rust/tutorial/2.1.php',
      'https://metanit.com/rust/tutorial/2.2.php',
    ]);
    expect(e[0]).toEqual({ url: 'https://metanit.com/rust/tutorial/1.1.php', title: 'Введение в язык Rust', level: 0 });
    expect(e.every((x) => x.level === 0)).toBe(true);
  });
  it('chapter page: picks the side menu, not prev/next or the top nav', () => {
    const e = detectToc(load('crawl-metanit-chapter.html'), 'https://metanit.com/rust/tutorial/2.1.php');
    expect(e.map((x) => x.title)).toEqual([
      '1.1 Введение в язык Rust', '1.2 Установка и первая программа', '2.1 Переменные', '2.2 Типы данных',
    ]);
  });
});

describe('detectToc: mdBook', () => {
  it('derives levels from nested ol and resolves relative URLs', () => {
    const e = detectToc(load('crawl-rustbook.html'), 'https://doc.rust-lang.org/book/ch01-01-installation.html');
    expect(e.map((x) => [x.url.replace('https://doc.rust-lang.org/book/', ''), x.level])).toEqual([
      ['title-page.html', 0],
      ['ch01-00-getting-started.html', 0],
      ['ch01-01-installation.html', 1],
      ['ch01-02-hello-world.html', 1],
      ['ch02-00-guessing-game-tutorial.html', 0],
    ]);
    expect(e[1]?.title).toBe('1. Getting Started');
  });
});

describe('detectToc: generic sidebar', () => {
  it('uses nested ul depth and keeps the current page once', () => {
    const e = detectToc(load('crawl-generic.html'), 'https://acme.dev/docs/guide/intro.html');
    expect(e.map((x) => [x.title, x.level])).toEqual([
      ['Intro', 0], ['Install', 1], ['Config', 1], ['Env', 2], ['API', 0],
    ]);
  });
});

describe('detectToc: edge cases', () => {
  it('returns [] when there is nothing list-like in scope', () => {
    const doc = new DOMParser().parseFromString('<body><p><a href="/a/x.html">x</a></p></body>', 'text/html');
    expect(detectToc(doc, 'https://s.io/a/y.html')).toEqual([]);
  });
  it('skips pure fragment links and respects <base href>', () => {
    const doc = new DOMParser().parseFromString(
      '<head><base href="https://s.io/docs/"></head><body><nav><ul><li><a href="#top">Top</a></li><li><a href="a.html">A</a></li><li><a href="b.html">B</a></li></ul></nav></body>',
      'text/html');
    expect(detectToc(doc, 'https://s.io/docs/a.html').map((x) => x.url)).toEqual(['https://s.io/docs/a.html', 'https://s.io/docs/b.html']);
  });
});

describe('entriesFromContainer', () => {
  it('collects links of a manually chosen container without prefix scope', () => {
    const doc = load('crawl-metanit-chapter.html');
    const page = 'https://metanit.com/rust/tutorial/2.1.php';
    expect(entriesFromContainer(doc.querySelector('#sidebar')!, page)).toHaveLength(4);
    expect(entriesFromContainer(doc.querySelector('nav.top')!, page).map((x) => x.url)).toEqual([
      'https://metanit.com/', 'https://metanit.com/python/', 'https://metanit.com/rust/', 'https://metanit.com/csharp/',
    ]);
  });
});
