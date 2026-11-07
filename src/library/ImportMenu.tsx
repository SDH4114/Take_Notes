// "Import" in the Library navigation: a folder / zip becomes a new project, loose .md / PDF files go to the current one.
import { useRef, useState } from 'preact/hooks';
import { errText, Menu, useUi } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';
import { it } from '@/src/import/strings';

type Source = 'folder' | 'zip' | 'files';

export function ImportMenu(p: { projectId: string | null; onDone: (projectId: string | null) => void }) {
  const ui = useUi();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputs = { folder: useRef<HTMLInputElement>(null), zip: useRef<HTMLInputElement>(null), files: useRef<HTMLInputElement>(null) };

  const onPicked = async (source: Source, input: HTMLInputElement) => {
    const picked = [...(input.files ?? [])];
    input.value = ''; // picking the same folder again must fire `change` again
    if (!picked.length) return;
    try {
      // Lazy: the import code (and pdf.js behind it) is only loaded when someone imports.
      const { collectFiles, importFiles, suggestedProjectName } = await import('@/src/import/run');
      let target: { projectId: string | null } | { newProject: string } = { projectId: p.projectId };
      if (source !== 'files') {
        const name = await ui.prompt(it('projectName'), { value: suggestedProjectName(picked), okLabel: it('import') });
        if (!name?.trim()) return;
        target = { newProject: name.trim() };
      }
      setProgress({ done: 0, total: 0 });
      const files = await collectFiles(picked);
      const r = await importFiles(files, target, (done, total) => setProgress({ done, total }));
      ui.toast(r.highlights ? `${it('done', { n: r.notes })}. ${it('doneHl', { n: r.highlights })}` : it('done', { n: r.notes }));
      if (r.pdfScans) ui.toast(it('scans', { n: r.pdfScans }));
      if (r.failed.length) ui.toast(it('failed', { list: r.failed.map((f) => `${f.path} (${f.message})`).join('; ') }), true);
      p.onDone(r.projectId);
    } catch (e) {
      ui.toast(errText(e), true);
    } finally {
      setProgress(null);
    }
  };

  const pick = (s: Source) => inputs[s].current?.click();
  const fileInput = (s: Source, extra: Record<string, unknown>) => (
    <input ref={inputs[s]} type="file" hidden {...extra} onChange={(e) => void onPicked(s, e.currentTarget)} />
  );

  return (
    <>
      {fileInput('folder', { webkitdirectory: true, multiple: true })}
      {fileInput('zip', { accept: '.zip,application/zip', multiple: true })}
      {fileInput('files', { accept: '.md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf', multiple: true })}
      <Menu placement="down" align="left"
        items={[
          { label: it('importFolder'), hint: it('importFolderHint'), icon: 'folderPlus', onSelect: () => pick('folder') },
          { label: it('importZip'), hint: it('importZipHint'), icon: 'layers', onSelect: () => pick('zip') },
          { label: it('importFiles'), hint: it('importFilesHint'), icon: 'file', onSelect: () => pick('files') },
        ]}
        trigger={(toggle) => (
          <button type="button" class="nav-add" onClick={toggle} disabled={progress != null}>
            <Icon name="upload" size={14} />
            {progress ? it('importing', { done: progress.done, total: progress.total || '…' }) : it('import')}
          </button>
        )} />
    </>
  );
}
