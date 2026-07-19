# Spec: Wordflare blog engine — iteration 1

> Companion artifacts: [`CONTEXT.md`](../../CONTEXT.md) (glossary), [ADR-0001](../adr/0001-static-generation-via-redeploy-on-publish.md) (static generation), [ADR-0002](../adr/0002-d1-is-the-source-of-truth.md) (D1 as source of truth), [research: Cloudflare stack](../research/cloudflare-stack-for-blog-engine.md).
> Published as the canonical spec: [#1 — Spec: Wordflare blog engine — iteration 1](https://github.com/tediscript/wordflare/issues/1).

## Problem Statement

A WordPress-familiar author wants to run their own blog on Cloudflare's native stack at minimal cost, writing in a Markdown/Obsidian-style editor with a real publish workflow. Existing options force a trade-off: a full CMS (heavy, not "native Cloudflare," often paid) versus a static site generator (content lives as git files, with no in-browser editor or publish flow). Neither gives a lightweight, reusable, in-app-editor blog that deploys on Cloudflare's free tier.

## Solution

**Wordflare** — a reusable, single-tenant blog engine: one Cloudflare Worker + Static Assets, D1 as the content store, and an in-browser Obsidian-style Markdown editor behind username/password auth. Writing and publishing are dynamic (admin writes to D1); reading is static HTML generated on publish and served as edge-cached assets. Anyone deploys their own instance from a template repo; a low-traffic single-author blog runs on the free tier ($0).

## User Stories

### Setup & deployment
1. As a site owner, I want to deploy my own blog instance from a template repo with a single command, so that I can run my blog on Cloudflare.
2. As a site owner, I want the whole stack to run on Cloudflare's free tier, so that I pay $0 for a low-traffic blog.
3. As a site owner, I want to configure my site (title, description, permalink structure, admin credentials) without editing code, so that I can personalize my instance.
4. As a site owner, I want my secrets (session secret, password pepper) managed via Wrangler secrets, so that they never sit in the repo.

### Authentication & access
5. As the site owner, I want to log in to the admin with a username and password, so that only I can write and publish.
6. As the site owner, I want my password stored only as a salted hash, so that a database leak does not expose it.
7. As the site owner, I want a signed session cookie to persist my login across requests, so that I stay logged in while editing.
8. As a visitor, I want requests to any admin route without a valid session to be rejected or redirected, so that the admin stays private.
9. As the site owner, I want the User/Role/Capability model to support adding more users and roles later, so the engine is not locked to a single hard-coded user.

### Writing (the editor)
10. As the author, I want to write posts in a Markdown editor with live preview, so that I see the rendered result as I type.
11. As the author, I want to edit YAML frontmatter (title, slug, excerpt, tags, status, date), so that I control a post's metadata.
12. As the author, I want to write Obsidian-style wikilinks `[[like this]]` to other posts, so that cross-referencing is effortless.
13. As the author, I want wikilinks that point to no existing post to be flagged before I publish, so that I catch broken links.
14. As the author, I want to tag posts inline with `#tag` and in frontmatter, so that I can organize and surface them.
15. As the author, I want GFM Markdown — tables, task lists, fenced code with syntax highlighting, and footnotes — so that rich content renders correctly.
16. As the author, I want to save a post as a Draft, so that I can keep working without it being public.
17. As the author, I want to preview a Draft exactly as it will appear when published, so that I can review before publishing.
18. As the author, I want a slug auto-derived from the title (and editable), so that I don't hand-write every permalink.
19. As the author, I want a dashboard listing my posts by status and date, so that I can find and manage them.

### Publishing
20. As the author, I want to Publish a post, so that it becomes live to readers.
21. As the author, I want to edit or unpublish a live post, so that I can revise what readers see.
22. As the site owner, I want Publish to regenerate the affected static pages and trigger a redeploy, so that readers see the update with no manual rebuild.
23. As the site owner, I want publishing a post to update the Posts index and its pagination, so that the listing reflects new posts.
24. As the site owner, I want regeneration to be safe to retry, so that a failed deploy does not corrupt the live site.
25. As a visitor, I want the site to stay available while a deploy is in progress, so that reads are not interrupted.

### Reading (public)
26. As a visitor, I want the front page to list the latest published posts, so that I can browse.
27. As a visitor, I want the Posts index paginated (`/`, `/page/2/`, …), so that I can browse beyond the first page.
28. As a visitor, I want to read a Single Post at a clean permalink, so that I can read and share it.
29. As a visitor, I want wikilinks in a post to render as clickable links to the target post, so that navigation between posts works.
30. As a visitor, I want each page to have a correct title and description (from frontmatter), so that pages are usable and shareable.
31. As a visitor, I want published pages to load fast from the edge cache, so that reading is snappy.
32. As a visitor, I want a 404 page for missing routes, so that dead links are handled gracefully.

## Implementation Decisions

- **Platform.** One Cloudflare **Worker + Static Assets**, deployed via Wrangler / Workers Builds. Workers, not Pages (Static Assets is the recommended path; see ADR-0001).
- **Static generation.** Published posts are pre-rendered to static assets; **Publish triggers regeneration + redeploy** (ADR-0001, option A). Drafts and draft preview render on demand through the Worker, gated by auth. Reads of published posts bypass the Worker.
- **Data.** **D1** is the source of truth for Posts and Users (ADR-0002). Index `slug`, `status`, `published_at`. KV is an optional read cache only (not the record); R2 is reserved for media (iteration 2).
- **Content model.** A Post is Markdown with YAML frontmatter. Frontmatter: `title`, `slug`, `excerpt`, `tags[]`, `status` (`draft` | `published`), `published_at`, `updated_at`, `author`. Body is GFM Markdown. The exact frontmatter schema may be refined by the editor/content-model prototype.
- **Markdown pipeline (pure).** Parse frontmatter → render body (GFM, code highlighting, footnotes) → resolve `[[wikilinks]]` to published-post permalinks (alias and `#heading` supported; unresolved links flagged) → extract tags. The specific renderer/editor library is chosen in the editor prototype (see Further Notes).
- **Editor.** Obsidian-style: live-preview Markdown editing plus frontmatter editing, behind auth.
- **Auth.** Single User (Administrator), username + password. Password stored as a salted **PBKDF2** hash via Web Crypto, with iterations tuned to fit the Free plan's 10 ms-CPU/invocation cap. Signed session cookie (HMAC). A **Roles & Capabilities** model (`edit_posts`, `publish_posts`, …) so more users/roles can be added later. _Caveat:_ if tuned-PBKDF2 proves too weak, robust hashing pushes the project to Workers Paid ($5/mo) — flagged, not decided.
- **Permalinks.** Configurable structure; default flat `/<slug>/`. Posts index at `/`; pagination at `/page/<n>/`.
- **Public serving.** Static HTML generated at build time, served as assets (Worker not invoked on hit). `404` via generated asset / `not_found_handling`.
- **Admin API.** The Worker serves `/admin/*` (login, dashboard, editor CRUD, publish, draft preview), all behind the session check.
- **Packaging.** Template/seed repo + `wrangler deploy`; D1 binding; secrets via `wrangler secret`. Optional "Deploy to Cloudflare" button for one-click fork-and-deploy.

## Testing Decisions

- **A good test asserts external behavior only** — HTTP Responses and rendered HTML output — never internal module structure, query shapes, or framework internals. No prior art (greenfield), so both seams below are new.
- **Seam 1 — HTTP boundary (the Worker's `fetch`).** Request in → Response out, via `@cloudflare/vitest-pool-workers` running the Worker under Miniflare with in-memory D1/KV/R2. Covers: public dynamic routes (pagination, 404, tag display), **draft preview**, **auth** (login sets the cookie; protected routes reject without it), and **admin CRUD + publish → regenerate**.
- **Seam 2 — Markdown render pipeline (pure).** `render(markdown, ctx) → { html, metadata }` as a Vitest unit. Covers: frontmatter parse/validate, GFM features, code highlighting, wikilink resolution (valid slug, alias, dead link), tag extraction. This single function feeds both draft preview (runtime) and the build (static generation), so it is the seam for the whole content→HTML transform — including the output of published posts (whose reads bypass the Worker).
- **Auth tests.** Hash-then-verify round-trip; wrong password rejected; session cookie honored/rejected; Capability gating per action.

## Out of Scope

For iteration 1: media library and Featured Image; tag-archive pages (tags are stored and shown on a post, but clicking one goes nowhere yet); Pages (static post type); comments; RSS/Atom feed; search; full SEO (sitemap, Open Graph, structured data); revisions; multi-author Roles beyond Administrator; backlinks view; callouts/admonitions; transclusions/embeds; math/LaTeX. The specific editor/render library selection is also out of scope here — it is settled by the editor prototype (see Further Notes) and then folded back in.

## Further Notes

- **The editor is the core — prototype it first.** The first implement ticket should be an editor/render-library spike (e.g. evaluate CodeMirror / Milkdown / TipTap-Markdown / bytemd against live preview, frontmatter, wikilinks) to lock the library before the admin app is built. Its output may refine the frontmatter schema above.
- **Free-tier watch-items** (from the research): index every filtered D1 column or "rows read" burns the quota; never use KV as a write store (1,000 writes/day); watch password-hashing CPU against the Free 10 ms cap.
- **Deploy-on-publish** means a Workers Build per publish — design the publish/regenerate pipeline and deploy hook early.
- Artifacts produced alongside this spec: `CONTEXT.md`, `docs/adr/0001`, `docs/adr/0002`, `docs/research/cloudflare-stack-for-blog-engine.md`.
