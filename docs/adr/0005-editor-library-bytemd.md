# Editor/render library: bytemd (mounted as a JS island)

Settled by ticket #3 (editor/render-library spike). The admin editor is
**[bytemd](https://github.com/bytedance/bytemd) v1**, mounted as a **JS island**
in the Worker's server-rendered HTML — no SPA build, no React/Vue runtime. The
throwaway proof lives in `spike/editor-bytemd/`; this ADR is the kept decision.

bytemd is built with Svelte but **compiles to vanilla-JS DOM manipulation** —
there is no UI-framework runtime in the shipped bundle, so it mounts with a
plain `new Editor({ target, props })` inside a `<script type="module">`. That is
the exact "JS island in server-rendered HTML" shape the spec (#1) and
ADR-0001 require (the Worker renders the shell; the editor hydrates one node).
It ships **built-in live preview** (`mode: 'split' | 'tab' | 'auto'`) and a
**remark/rehype plugin system**, which is where frontmatter, GFM, code
highlighting, and `[[wikilinks]]` all plug in.

## Considered Options

| Library | Island / no-build | Live preview | Frontmatter | `[[wikilinks]]` | Verdict |
| --- | --- | --- | --- | --- | --- |
| **bytemd** (chosen) | Yes — vanilla mount, ESM on CDN | Built-in split/tab | `@bytemd/plugin-frontmatter` | remark plugin (`remark-wiki-link`) | Best fit on every axis; least assembly |
| Milkdown | Yes — vanilla version, ESM on CDN | WYSIWYG (Typora-like, inline) | via remark plugin | via remark plugin | Strong, but **headless** (ship all CSS yourself) and a heavier ProseMirror-schema story for iteration 1 |
| CodeMirror 6 | Yes — ESM, framework-agnostic | Not built-in — separate render pane; true inline "live preview" needs heavy custom assembly (e.g. atomic-editor, React) | manual | manual | A *source* editor; great for a code-editor feel, but live preview is a build project, not a feature |
| TipTap (+ `@tiptap/markdown`) | **No** — standard path needs a React/Vue adapter and a build | WYSIWYG | via markdown ext | manual | Headless + framework-coupled; violates the "no SPA build" constraint |

**Why not Milkdown** — Milkdown's inline WYSIWYG is the closest thing to
Obsidian's *Live Preview*, and its vanilla build + ESM CDN make it island-capable.
But it is **headless** (no CSS at all — we'd author a full editor stylesheet for
iteration 1), and its ProseMirror-schema/plugin model is a bigger surface to own
than bytemd's remark-plugin model. bytemd's split-pane "live preview" already
satisfies user story #10 with zero styling work; Milkdown's richer UX is not
worth the CSS and schema cost for a single-author blog in iteration 1. (Revisit
if iteration 2 wants a true WYSIWYG.)

**Why not CodeMirror 6** — Framework-agnostic and island-friendly, but it is a
*source* editor. The "live preview" Obsidian users expect (rich rendering as you
type) is not a feature — it is a bespoke build (the only CM6 implementations of
it, e.g. atomic-editor, are React-bound). We'd ship "highlighted Markdown + a
side pane," which is exactly what bytemd already gives us for free.

**Why not TipTap** — Excellent headless rich-text editor, but the documented,
supported path is **React or Vue** (`@tiptap/react`, `@tiptap/vue`), and Markdown
arrived only via `@tiptap/markdown` (3.7.0 / community). It fails the
"no SPA build" constraint outright.

## Consequences

- **Editor = bytemd v1**, loaded as a JS island (`new Editor({ target, props })`).
  The real admin will **vendor** the island into `public/` (not load from a public
  CDN as the spike does); the spike uses `esm.sh` only to prove the mount with
  zero assembly.
- **Live preview** is bytemd's `mode: 'split'` — satisfies user story #10 with no
  custom code.
- **Frontmatter editing model (refinement for the Write-Drafts ticket).** bytemd
  is a *body* editor; `@bytemd/plugin-frontmatter` parses frontmatter for the
  preview but is not an edit surface. **Decision:** decompose the spec's
  frontmatter (`title`, `slug`, `excerpt`, `tags[]`, `status`, `published_at`,
  `updated_at`, `author`) into **typed D1 columns edited via server-rendered form
  fields**, and let bytemd own the **body only** (frontmatter-free Markdown). Keep
  the `frontmatter()` plugin for paste-in fidelity (author pastes a full `.md`
  file) and preview parity. The D1 `body` column therefore stores no frontmatter
  block.
- **`[[wikilinks]]` (user stories #12 / #13)** ship as a bytemd plugin wrapping
  the [`remark-wiki-link`](https://github.com/landakram/remark-wiki-link) npm
  package — the one the spike proved
  (`remark: (p) => p.use(remarkWikiLink, { permalinks, aliasDivider: '|' })`,
  where `permalinks` is a `string[]` of known slugs from D1). Known slugs render
  as `<a href="/slug/">`; unknown ones get the `new` class — the "dead link"
  signal for US #13.
  - _Implementation note for the Write-Drafts ticket:_ [`@flowershow/remark-wiki-link`](https://github.com/flowershow/remark-wiki-link)
    (v4, actively maintained) is a richer Obsidian-focused fork (`![[embeds]]`,
    `#heading` links, Obsidian permalinks) with a different options shape
    (`files`, `permalinks` as a map, `urlResolver`). Evaluate it vs. landakram's
    original when building the real admin; the spike only needed link parsing.
- **GFM + code highlighting** (user story #15) ship via `@bytemd/plugin-gfm` and
  `@bytemd/plugin-highlight`.
- **Render parity.** bytemd's preview is the same remark→rehype pipeline the build
  step uses for published HTML, so "draft preview looks like publish" (user story
  #17) is natural — both share the remark plugins (the render pipeline, Seam 2 in
  spec #1). The wikilink/frontmatter remark plugins must be shared between the
  island and the server render, not duplicated.
- **Security.** bytemd sanitizes its HTML output by default (XSS handled); draft
  preview and published HTML both rely on this rather than a separate DOM sanitize.
- **Maintenance note (flagged).** bytemd v1 is stable (1.22.0) but the repo states
  "v2 is under active development" (as **HashMD**). v1 is sufficient for a
  single-tenant blog; if v1 stalls, HashMD (same author, same plugin model) is the
  documented upgrade path. Worth a note, not a blocker.
- **What this spike deliberately did NOT do:** wire the island into the Worker's
  `/admin/*` routes or the auth gate, persist to D1, or build the render pipeline.
  Those belong to the Write-Drafts ticket; this spike only locked the library.
