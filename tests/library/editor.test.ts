import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from '@/src/ui/editor';

describe('MarkdownEditor', () => {
  it('mounts CodeMirror with the formatting toolbar and applies a toolbar command', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onChange = vi.fn();
    await act(() => render(h(MarkdownEditor, { value: 'hello', onChange }), host));
    expect(host.querySelector('.cm-editor')).toBeTruthy();
    expect(host.querySelectorAll('.md-toolbar .icon-btn')).toHaveLength(10);
    expect(host.querySelector('.cm-content')?.textContent).toBe('hello');
    // the first button cycles the heading level of the cursor line
    await act(() => (host.querySelector('.md-toolbar .icon-btn') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenLastCalledWith('# hello');
    await act(() => render(null, host));
  });
});
