# Editor spike — bytemd as a JS island (throwaway)

> **Ticket #3 — Editor/render-library spike.** This directory is **throwaway**.
> The *decision* is kept in [`docs/adr/0005-editor-library-bytemd.md`](../../docs/adr/0005-editor-library-bytemd.md);
> this demo only exists to *prove* the choice. It will be deleted once the
> decision is folded into the Write-Drafts ticket.

## What it proves

1. **bytemd mounts as a JS island** in server-rendered HTML — no SPA build, no
   React/Vue runtime in the bundle (`new Editor({ target, props })`).
2. **Live preview** — `mode: 'split'` renders the Markdown beside the source as
   you type (user story #10).
3. **YAML frontmatter** — `@bytemd/plugin-frontmatter` parses it for the preview
   (user story #11).
4. **Obsidian `[[wikilinks]]`** — a ~10-line bytemd plugin wrapping
   `remark-wiki-link` (user stories #12 / #13).
5. **GFM + code highlighting** — `@bytemd/plugin-gfm` + `@bytemd/plugin-highlight`
   (user story #15).

Everything loads from `esm.sh` as ESM via a single `<script type="module">` —
the same shape the real admin will use (a worker-rendered shell + an island
script). For production the island would be vendored into `public/`, not loaded
from a public CDN; the spike uses the CDN only to prove the mount with zero
assembly.

## Run it

ES module `import` is blocked on `file://`, so serve the directory over HTTP:

```bash
cd spike/editor-bytemd
python3 -m http.server 8080
# open http://localhost:8080/
```

You should see a split editor: Markdown source on the left, rendered preview on
the right, with the table, fenced code block, and a live `[[wikilink]]` rendering.
