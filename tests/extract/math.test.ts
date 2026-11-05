import { describe, expect, it } from 'vitest';
import { cleanTex, replaceMath } from '@/src/extract/math';
import { htmlToMarkdown } from '@/src/markdown';

function md(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  replaceMath(root);
  return htmlToMarkdown(root.innerHTML, 'https://x.test/');
}

describe('math', () => {
  it('cleanTex strips the displaystyle wrapper only when it wraps everything', () => {
    expect(cleanTex('{\\displaystyle x^{2}}')).toBe('x^{2}');
    expect(cleanTex(' a+b ')).toBe('a+b');
    expect(cleanTex('{\\frac{a}{b}}')).toBe('{\\frac{a}{b}}');
  });

  it('handles MathJax math/tex scripts and removes the rendered copy', () => {
    const out = md(
      '<p>Inline <span class="MathJax_Preview">x</span><span class="MathJax">rendered</span><script type="math/tex">e^{i\\pi}</script> ok</p>' +
        '<script type="math/tex; mode=display">\\sum_i i</script>',
    );
    expect(out).toContain('Inline $e^{i\\pi}$ ok');
    expect(out).toContain('$$\n\\sum_i i\n$$');
    expect(out).not.toContain('rendered');
  });

  it('handles KaTeX inline and display', () => {
    const katex = (tex: string) =>
      `<span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html">garbage</span></span>`;
    const out = md(`<p>A ${katex('a_1')} B</p><span class="katex-display">${katex('\\int f')}</span>`);
    expect(out).toContain('A $a_1$ B');
    expect(out).toContain('$$\n\\int f\n$$');
    expect(out).not.toContain('garbage');
  });

  it('leaves math without recoverable TeX untouched', () => {
    expect(md('<p>a <math><mi>x</mi></math> b</p>')).toContain('a');
  });
  it('reads TeX from data-mw of Parsoid-era Wikipedia native MathML', () => {
    const out = md(
      `<p>Катеты <math xmlns="http://www.w3.org/1998/Math/MathML" class="mwe-math-element mwe-math-element-inline" data-mw='{"name":"math","attrs":{},"body":{"extsrc":"a"}}'><mi>a</mi></math> и формула:</p>` +
      `<math class="mwe-math-element mwe-math-element-block" display="block" data-mw='{"name":"math","attrs":{"display":"block"},"body":{"extsrc":"c^2 = a^2 + b^2"}}'><mi>c</mi></math>`,
    );
    expect(out).toContain('Катеты $a$ и формула:');
    expect(out).toContain('$$\nc^2 = a^2 + b^2\n$$');
  });
});
