import { describe, expect, it } from 'vitest';
import { extractSourceMeta } from '@/src/cite';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const URL_ = 'https://example.com/post';

describe('extractSourceMeta', () => {
  it('prefers citation_* meta tags', () => {
    const d = parse(`<html lang="en"><head>
      <title>Doc title</title>
      <meta name="citation_title" content="Citation Title">
      <meta property="og:title" content="OG Title">
      <meta name="citation_author" content="Smith, John">
      <meta name="citation_author" content="Doe, Jane">
      <meta name="citation_publication_date" content="2023/05/04">
      <meta name="citation_publisher" content="Pub House">
      <meta property="og:site_name" content="Example Site">
      <meta name="description" content="Plain description">
    </head><body><h1>H1</h1></body></html>`);
    const m = extractSourceMeta(d, URL_);
    expect(m.url).toBe(URL_);
    expect(m.title).toBe('Citation Title');
    expect(m.authors).toEqual(['Smith, John', 'Doe, Jane']);
    expect(m.published).toBe('2023-05-04');
    expect(m.publisher).toBe('Pub House');
    expect(m.siteName).toBe('Example Site');
    expect(m.lang).toBe('en');
    expect(m.description).toBe('Plain description');
  });

  it('accessed is now', () => {
    const before = Date.now();
    const m = extractSourceMeta(parse('<title>x</title>'), URL_);
    const t = Date.parse(m.accessed);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it('falls back to og:title, then JSON-LD headline, then h1, then document.title', () => {
    expect(extractSourceMeta(parse('<head><meta property="og:title" content="OG"><title>T</title></head>'), URL_).title).toBe('OG');
    const ld = '<script type="application/ld+json">{"@type":"Article","headline":"LD Head"}</script><title>T</title>';
    expect(extractSourceMeta(parse(`<head>${ld}</head><body><h1>H</h1></body>`), URL_).title).toBe('LD Head');
    expect(extractSourceMeta(parse('<head><title>T</title></head><body><h1>  My \n H1 </h1></body>'), URL_).title).toBe('My H1');
    expect(extractSourceMeta(parse('<head><title>Just title</title></head><body></body>'), URL_).title).toBe('Just title');
  });

  it('uses the URL when nothing else exists', () => {
    expect(extractSourceMeta(parse('<body></body>'), URL_).title).toBe(URL_);
  });

  it('strips known wiki suffixes from document.title', () => {
    const ru = extractSourceMeta(parse('<head><title>Rust — Википедия</title></head>'), 'https://ru.wikipedia.org/wiki/Rust');
    expect(ru.title).toBe('Rust');
    const en = extractSourceMeta(parse('<head><title>Rust (programming language) - Wikipedia</title></head>'), 'https://en.wikipedia.org/wiki/Rust');
    expect(en.title).toBe('Rust (programming language)');
  });

  it('strips a suffix equal to og:site_name from document.title, but keeps other dashes', () => {
    const a = extractSourceMeta(parse('<head><title>Guide | MyBlog</title><meta property="og:site_name" content="MyBlog"></head>'), URL_);
    expect(a.title).toBe('Guide');
    const b = extractSourceMeta(parse('<head><title>Foo - Bar</title></head>'), URL_);
    expect(b.title).toBe('Foo - Bar');
  });

  it('reads authors from meta author, JSON-LD (string/object/array) and article:author, ignoring URLs', () => {
    const d1 = parse('<head><meta name="author" content="Ivan Ivanov"><meta property="article:author" content="https://facebook.com/ivan"></head>');
    expect(extractSourceMeta(d1, URL_).authors).toEqual(['Ivan Ivanov']);

    const d2 = parse('<head><script type="application/ld+json">{"@type":"NewsArticle","author":[{"@type":"Person","name":"A One"},{"name":"B Two"}]}</script></head>');
    expect(extractSourceMeta(d2, URL_).authors).toEqual(['A One', 'B Two']);

    const d3 = parse('<head><script type="application/ld+json">{"author":"Solo Author"}</script></head>');
    expect(extractSourceMeta(d3, URL_).authors).toEqual(['Solo Author']);

    const d4 = parse('<head><meta property="article:author" content="Real Name"><meta property="article:author" content="https://x.com/u"></head>');
    expect(extractSourceMeta(d4, URL_).authors).toEqual(['Real Name']);
  });

  it('dedupes authors', () => {
    const d = parse('<head><meta name="citation_author" content="A B"><meta name="author" content="A B"></head>');
    expect(extractSourceMeta(d, URL_).authors).toEqual(['A B']);
  });

  it('handles JSON-LD @graph, publisher and datePublished', () => {
    const d = parse(`<head><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"X"},
        {"@type":"Article","headline":"G Head","datePublished":"2022-12-31T23:30:00+03:00","publisher":{"@type":"Organization","name":"Pub Org"}}
      ]}</script></head>`);
    const m = extractSourceMeta(d, URL_);
    expect(m.title).toBe('G Head');
    expect(m.published).toBe('2022-12-31');
    expect(m.publisher).toBe('Pub Org');
    expect(m.siteName).toBe('Pub Org');
  });

  it('ignores broken JSON-LD', () => {
    const d = parse('<head><script type="application/ld+json">{not json</script><title>T</title></head>');
    expect(extractSourceMeta(d, URL_).title).toBe('T');
  });

  it('published: article:published_time, then <time datetime>; normalized to ISO date', () => {
    const a = parse('<head><meta property="article:published_time" content="2021-03-09T08:00:00Z"></head>');
    expect(extractSourceMeta(a, URL_).published).toBe('2021-03-09');
    const b = parse('<body><time datetime="2020-02-03T10:00:00+00:00">Feb 3</time></body>');
    expect(extractSourceMeta(b, URL_).published).toBe('2020-02-03');
    const c = parse('<head><meta name="citation_publication_date" content="2019"></head>');
    expect(extractSourceMeta(c, URL_).published).toBe('2019');
    const e = parse('<head><meta name="citation_publication_date" content="garbage"></head>');
    expect(extractSourceMeta(e, URL_).published).toBeUndefined();
    const f = parse('<head><meta property="article:published_time" content="Thu, 04 May 2023 10:00:00 GMT"></head>');
    expect(extractSourceMeta(f, URL_).published).toBe('2023-05-04');
  });

  it('leaves optional fields undefined when absent', () => {
    const m = extractSourceMeta(parse('<body>hi</body>'), URL_);
    expect(m.authors).toEqual([]);
    expect(m.siteName).toBeUndefined();
    expect(m.publisher).toBeUndefined();
    expect(m.published).toBeUndefined();
    expect(m.lang).toBeUndefined();
    expect(m.description).toBeUndefined();
  });
  it('handles real Wikipedia metadata (og:title with suffix, collective JSON-LD author)', () => {
    const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', name: 'Теорема Пифагора',
      author: { '@type': 'Organization', name: 'Contributors to Wikimedia projects' },
      publisher: { '@type': 'Organization', name: 'Фонд Викимедиа' }, datePublished: '2004-10-16T06:50:41Z' });
    const d = parse(`<html lang="ru"><head><title>Теорема Пифагора — Википедия</title>
      <meta property="og:title" content="Теорема Пифагора — Википедия">
      <script type="application/ld+json">${ld}</script></head><body><h1>Теорема Пифагора</h1></body></html>`);
    const m = extractSourceMeta(d, 'https://ru.wikipedia.org/wiki/Теорема_Пифагора');
    expect(m.title).toBe('Теорема Пифагора');
    expect(m.siteName).toBe('Википедия');
    expect(m.authors).toEqual([]);
    expect(m.published).toBe('2004-10-16');
  });
});
