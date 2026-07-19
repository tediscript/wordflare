# Static generation via redeploy-on-publish

We serve published posts as **static assets** on a single Cloudflare Worker (not runtime-rendered), and **Publishing a Post regenerates the affected HTML and triggers a redeploy** (a Workers Build). We rejected the alternative — rendering into KV/R2/Cache at runtime with no rebuild — because it trades the free, unlimited, best-SEO static reads for marginally simpler operations, and this project's priorities are "cheapest / free-tier" and "readers never hit a dynamic render." Drafts and draft preview still render on demand through the Worker, gated by auth.

## Considered Options

- **(A) Redeploy-on-publish** (chosen) — regenerate static assets from D1 on Publish; reads are free + unlimited. Cost: a build per publish.
- **(B) Runtime store** — render → store HTML in KV/R2/Cache; the Worker serves it on every read; no rebuild. Cost: every read consumes Worker/KV/R2 quota (still ~$0 at low traffic, but not unlimited-free) and the Worker runs on each read.

## Consequences

- Each Publish (or edit/unpublish of a live post) triggers a Workers Build/deploy. Accepted — a blog publishes infrequently.
- Reads of published posts bypass the Worker entirely, so they are verified through the build/render seam, not the HTTP-boundary seam.
- Draft preview and any non-asset route remain dynamic (Worker + D1 + auth).
- Assumes **Workers, not Pages**: Static Assets is Cloudflare's current, recommended serving path and Pages is legacy-bound.
