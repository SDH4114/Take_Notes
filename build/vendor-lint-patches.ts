import type { Plugin } from 'vite';

/**
 * Build-time patches for third-party code that the AMO linter (web-ext lint) flags:
 * innerHTML assignments, `Function('return this')` and dynamic `import(variable)`.
 * Every replacement must match exactly the expected number of times, otherwise the build fails —
 * a library update can never turn a patch into a silent no-op.
 */

export interface Replacement {
  find: string;
  replace: string;
  /** Expected occurrences of `find` (default 1). */
  count?: number;
}

export interface VendorPatch {
  name: string;
  /** Path inside node_modules. */
  file: string;
  /** `module` = transformed as a JS module; `asset` = emitted file (pdf.js worker via `?url`). */
  kind: 'module' | 'asset';
  replacements: Replacement[];
  /** Append the `__tnSetHtml` helper to the module. */
  helper?: boolean;
}

/**
 * innerHTML replacement: parse with DOMParser and move the nodes in. The `<body>` prefix keeps the
 * parser in "in body" mode so leading <style>/<meta>/<link> stay in the content (as with innerHTML on
 * a body/div), instead of being hoisted into <head>. Only HTML-namespace, non-table targets are
 * patched (body/div here), where this matches innerHTML. null → '' like innerHTML.
 * A function declaration appended at the end is hoisted, so directives and line numbers are untouched.
 */
const HELPER =
  '\n;function __tnSetHtml(el, html) {' +
  ' var doc = new DOMParser().parseFromString("<body>" + (html === null ? "" : String(html)), "text/html");' +
  ' el.replaceChildren(...Array.from(doc.body.childNodes)); }\n';

const reject = (what: string) => `Promise.reject(new Error("TakeNotes: ${what} is disabled (vendor lint patch)"))`;

export const VENDOR_PATCHES: VendorPatch[] = [
  {
    name: 'readability',
    file: '@mozilla/readability/Readability.js',
    kind: 'module',
    helper: true,
    replacements: [
      // Restores the page from its cached HTML before the next attempt.
      { find: 'page.innerHTML = pageCacheHtml;', replace: '__tnSetHtml(page, pageCacheHtml);' },
      // Unwraps <noscript> images.
      { find: 'tmp.innerHTML = noscript.innerHTML;', replace: '__tnSetHtml(tmp, noscript.innerHTML);' },
    ],
  },
  {
    // Fallback only when DOMParser failed or a non-HTML NAMESPACE is configured (we never set one).
    // Throwing inside its try/catch = "parse failed" → DOMPurify returns '' (fails closed).
    name: 'dompurify',
    file: 'dompurify/dist/purify.es.mjs',
    kind: 'module',
    replacements: [
      {
        find: 'doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;',
        replace: 'throw new Error("TakeNotes: DOMPurify innerHTML fallback is disabled (vendor lint patch)");',
      },
    ],
  },
  {
    // dangerouslySetInnerHTML (Library / sidebar Markdown preview, already sanitized).
    name: 'preact',
    file: 'preact/dist/preact.mjs',
    kind: 'module',
    helper: true,
    replacements: [{ find: 't.innerHTML=h.__html', replace: '__tnSetHtml(t,h.__html)' }],
  },
  {
    // core-js / webpack global lookups; `globalThis` always exists in Firefox 140+ / Chrome 116+.
    name: 'pdfmake',
    file: 'pdfmake/build/pdfmake.js',
    kind: 'module',
    replacements: [
      { find: "(function () { return this; })() || Function('return this')()", replace: '(function () { return this; })() || globalThis' },
      { find: 'new Function("return this")()', replace: 'globalThis' },
      { find: "new Function('return this')()", replace: 'globalThis' },
    ],
  },
  {
    // Fake-worker fallback (main-thread import of the worker) — only used when a real Worker fails;
    // src/import/pdf.ts always sets workerSrc, so text extraction runs in a real module Worker.
    name: 'pdfjs',
    file: 'pdfjs-dist/build/pdf.mjs',
    kind: 'module',
    replacements: [
      {
        find: 'await import(\n      /*webpackIgnore: true*/\n      /*@vite-ignore*/\n      this.workerSrc);',
        replace: `await ${reject('pdf.js fake worker')};`,
      },
    ],
  },
  {
    // JS (no-wasm) fallback decoders for JBIG2/JPX/ICC images, loaded from `wasmUrl`. We never set
    // wasmUrl and only extract text, so this path already failed; now it fails without import().
    name: 'pdfjs-worker',
    file: 'pdfjs-dist/build/pdf.worker.min.mjs',
    kind: 'asset',
    replacements: [
      {
        find: 'await(import(\n/*webpackIgnore: true*/\n/*@vite-ignore*/\n`${WasmImage.#R}${this._noWasmFilename}`))',
        replace: `await ${reject('pdf.js JS image decoder fallback')}`,
      },
    ],
  },
];

const count = (code: string, find: string) => code.split(find).length - 1;

export function applyReplacements(code: string, label: string, replacements: Replacement[]): string {
  let out = code;
  for (const { find, replace, count: expected = 1 } of replacements) {
    const found = count(out, find);
    if (found !== expected) {
      throw new Error(
        `[vendor-lint-patches] ${label}: expected ${expected} occurrence(s) of ${JSON.stringify(find)}, found ${found}. ` +
          'The library changed — update build/vendor-lint-patches.ts.',
      );
    }
    out = out.split(find).join(replace);
  }
  return out;
}

export function applyVendorPatch(code: string, patch: VendorPatch): string {
  const out = applyReplacements(code, patch.name, patch.replacements);
  return patch.helper ? out + HELPER : out;
}

const cleanId = (id: string) => id.replace(/\\/g, '/').replace(/[?#].*$/, '');
const packageDir = (file: string) => {
  const parts = file.split('/');
  return `/node_modules/${(file.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)).join('/')}/`;
};

/** Vite plugin (build only): patches modules on transform and the pdf.js worker asset on generateBundle. */
export function vendorLintPatches(): Plugin {
  const applied = new Set<string>();
  return {
    name: 'takenotes:vendor-lint-patches',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      applied.clear();
    },
    transform(code, id) {
      const path = cleanId(id);
      const patch = VENDOR_PATCHES.find((p) => p.kind === 'module' && path.endsWith(`/node_modules/${p.file}`));
      if (!patch) return null;
      applied.add(patch.name);
      return { code: applyVendorPatch(code, patch), map: null };
    },
    generateBundle(_options, bundle) {
      const outputs = Object.values(bundle);
      for (const patch of VENDOR_PATCHES.filter((p) => p.kind === 'asset')) {
        for (const out of outputs) {
          if (out.type !== 'asset' || !out.originalFileNames.some((f) => `/${cleanId(f)}`.endsWith(`/node_modules/${patch.file}`))) continue;
          const source = typeof out.source === 'string' ? out.source : new TextDecoder().decode(out.source);
          out.source = applyVendorPatch(source, patch);
          applied.add(patch.name);
        }
      }
      // Guard: the library is in this bundle but its patch never ran (file moved/renamed upstream).
      const moduleIds = outputs.flatMap((o) => (o.type === 'chunk' ? o.moduleIds.map(cleanId) : []));
      for (const patch of VENDOR_PATCHES) {
        if (applied.has(patch.name)) continue;
        const dir = packageDir(patch.file);
        if (moduleIds.some((m) => m.includes(dir))) {
          throw new Error(`[vendor-lint-patches] ${patch.name}: ${dir} is bundled but ${patch.file} was never patched.`);
        }
      }
    },
  };
}
