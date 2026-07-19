# Research: Cloudflare stack for a Markdown blog engine (free-tier)

> **Investigated for:** the *wordflare* blog-engine spec.
> **Question:** Which Cloudflare primitives + deployment model fit a reusable, single-tenant Markdown blog engine that must run on the **free tier**?
> **Scope:** compute (Workers vs Pages vs Static Assets), data (D1/KV/R2/Durable Objects, incl. free tiers), static generation + serving on publish, caching, custom username/password auth, and packaging/deployment of a reusable engine.
> **Sources:** Cloudflare primary docs unless marked *(community/secondary)*. All limits verified against the pricing/limits pages fetched for this research.

---

## TL;DR — five findings that shape the spec

1. **Use Workers, not Pages.** Workers + Static Assets is Cloudflare's current, recommended path; Pages still works but every Pages feature now exists in Workers, and Workers has *more* (Durable Objects, Cron, richer observability). Start with Workers. — [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
2. **Static Assets are deploy-time and immutable.** A Worker uploads assets from a local directory at deploy time; the `ASSETS` binding only exposes `.fetch()` (read). **There is no runtime write.** So "generate static HTML on publish" *cannot* write into the Assets directory at runtime — it must either **redeploy** (rebuild assets) or store generated HTML in **KV / R2 / Cache API** at runtime. This is the central constraint on the static-generation strategy.
3. **Durable Objects ARE on the Free plan now** (SQLite-backed only). This corrects the common "DO is paid-only" assumption. Likely overkill for a blog, but it reopens options. — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
4. **Password hashing vs the Free 10 ms-CPU cap is a real tension.** Robust hashing (scrypt/argon2/high-iteration PBKDF2) typically runs ~50–100 ms+ of CPU, which can exceed the Free plan's **10 ms CPU per invocation**. For a single-user blog, login is infrequent so functionally it's fine, but you may hit the Free CPU cap and be pushed to **Workers Paid ($5/mo)**, or accept weaker PBKDF2 iterations. *(community/secondary sources; the 10 ms cap is primary.)*
5. **The whole blog can run at $0** for a low-traffic single-author blog. Static-asset reads are **free and unlimited**; D1/KV/R2 free allotments are ample for one writer. The only thing likely to push you to $5/mo is *robust password hashing* (finding 4).

---

## 1. Compute: Workers vs Pages

| | Workers + Static Assets | Pages |
|---|---|---|
| Status | **Current / recommended** | Legacy; feature parity now lives in Workers |
| Static asset reads | **Free + unlimited** | Free |
| Functions/dynamic | Worker invocations (counts vs quota) | Pages Functions (same rate as Workers) |
| Extras | Durable Objects, Cron Triggers, Workers Logs, Logpush, gradual deployments, `run_worker_first` | Fewer |

Cloudflare's own guidance: *"Now that Workers supports both serving static assets and server-side rendering, you should start with Workers."* — [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/). (Pages is not officially "deprecated", but the direction is unambiguous.)

**Implication:** Build on **one Worker** with Static Assets. Don't start a new project on Pages.

**Workers Free plan** — [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/):
- **100,000 requests/day**
- **10 ms CPU time per invocation**
- Workers Logs: 200,000 events/day, 3-day retention
- Workers Paid: **$5/mo** minimum → 10M requests/mo + 30M CPU-ms/mo included.

---

## 2. Static Assets & the "generate-on-publish" problem (the big one)

From [Static Assets](https://developers.cloudflare.com/workers/static-assets/):

- Deploy = "Worker code and static assets in a single operation." Assets come from a local `assets.directory` in your Wrangler config.
- **Routing default:** if a URL matches a file in the assets dir, that file is served **without invoking the Worker** (this is why asset reads are free/unlimited). If no match, the Worker runs.
- `assets.not_found_handling`: `"single-page-application"` | `"404-page"`.
- `assets.run_worker_first`: `true` | route patterns (e.g. `["/api/*"]`) — **required if you must run logic (auth, logging) before serving assets.**
- `assets.binding` (e.g. `"ASSETS"`): lets the Worker read an asset via `env.ASSETS.fetch(request)`. **Read-only. No runtime write/put.**

> **Consequence for our model:** a "publish" action cannot drop a new `post.html` into the served assets at runtime. Two viable shapes:
>
> - **(A) Redeploy-on-publish (true SSG).** On Publish, regenerate the static site from D1 and trigger a **Workers Build / deploy hook**. Result: post pages become static assets → **reads are free + unlimited**, best SEO/perf. Cost: a build per publish (seconds-to-minutes; fine for a blog).
> - **(B) Runtime-generate + cache (ISR-like).** On Publish (or first read), the Worker renders Markdown→HTML and stores it in **KV** (key = path) or **R2**, or fills the **Cache API**. Reads are served from there via the Worker. No rebuild, near-instant publish. Cost: each read is a Worker request (100k/day free) and/or KV (100k reads/day) / R2 (10M Class B/mo) op — all likely $0 for low traffic, but *not* unlimited-free like static assets.
>
> The spec must pick A vs B (or a hybrid). Both are viable on the free tier; A is the cheapest-for-reads, B is the simplest-to-operate.

---

## 3. Data primitives — free tiers

All figures verified against the pricing/limits pages cited. Free limits reset daily at 00:00 UTC (D1/KV/DO); R2/D1-storage are monthly/total.

| Primitive | Free allotment | Best for in our engine | Source |
|---|---|---|---|
| **D1** (SQL) | **5M rows read/day**, **100k rows written/day**, **5 GB storage** total; max DB **500 MB**; 10 DBs; 50 queries/Worker-invocation | **Source of truth** for Posts (title, slug, markdown, status, dates, author) — the `wp_posts` analog. Index on slug/status for cheap reads. | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) · [pricing](https://developers.cloudflare.com/workers/platform/pricing/#d1) |
| **KV** | **100k reads/day**, **1k writes/day**, 1k deletes/day, 1k list/day, **1 GB** stored | **Read cache** for rendered HTML by path (path → html); config; low-write, high-read. Eventual consistency (~up to ~60s globally) — fine for published content. | [Workers pricing → KV](https://developers.cloudflare.com/workers/platform/pricing/#workers-kv) |
| **R2** | **10 GB-month** storage, **1M Class A ops/mo**, **10M Class B ops/mo**, **free egress** | **Media** (deferred to iter-2) and/or a store for generated HTML (Class B reads are very generous + free egress). | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| **Durable Objects** (SQLite-backed) | **100k requests/day**, 13,000 GB-s/day, **5M rows read/day**, 100k rows written/day, 5 GB | Probably **overkill**; only SQLite-backed DO on Free. Could model a per-post "live preview" object, but unnecessary in iter-1. | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| **Queues** | 10,000 ops/day, 24h retention | Optional: decouple "publish → render" as a background job. Not needed in iter-1. | [Workers pricing → Queues](https://developers.cloudflare.com/workers/platform/pricing/#queues) |
| **Cache API** | Billed as Worker requests (no CPU on cache hit) | Edge caching of rendered HTML (shape B). | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |

**Recommended spine (subject to spec confirmation):**
- **D1** = source of truth for Posts + Users.
- **Static Assets** (shape A) **or** KV/R2 (shape B) = the rendered HTML readers actually get.
- **R2** = media, when iter-2 lands.
- **KV** = optional read cache / config.

> Note the D1 "rows read" gotcha: queries that scan unindexed columns multiply rows-read fast (people have hit 5M/day just browsing). **Always index** the columns you filter on (slug, status, published_at). — [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/)

---

## 4. Auth: single-user username/password on Free

What we need: one admin login (username + password), a Roles & Capabilities model that leaves room for more users later. No OAuth/magic-links.

- **Web Crypto is the native crypto API** in Workers and supports **PBKDF2** (deriveKey) — [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/). bcrypt/argon2/scrypt are **not** in Web Crypto; use a bundled lib like **`@noble/hashes`** (scrypt/argon2) if you want them.
- **The Free CPU cap is the catch.** Strong KDFs run well over the **10 ms CPU/invocation** Free limit (community reports ~100 ms for proper hashing). On Free this can error out; on **Workers Paid ($5/mo)** the default per-invocation CPU ceiling rises to 30 s. *(secondary: [password-hashing writeups](https://lord.technology/2024/02/21/hashing-passwords-on-cloudflare-workers.html), [community thread](https://community.cloudflare.com/t/options-for-password-hashing/138077))*
- **Sessions:** issue a signed session cookie (HMAC via Web Crypto) or a JWT after a successful login; store the user row + a password hash in D1. Single user = one row.

**Decision for the spec:** either (a) tune PBKDF2 iterations to stay under ~10 ms CPU and keep Free, or (b) accept that robust auth = **$5/mo Workers Paid**. For a single-user blog, (a) is probably acceptable; flag the trade-off explicitly.

---

## 5. Deployment & packaging a reusable engine

- **Scaffold:** `npm create cloudflare@latest -- <name> --framework=<fw>` creates a Worker project with Static Assets wired up. — [Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- **Deploy:** `wrangler deploy` (Worker + assets in one step). Git integration via **Workers Builds** (connect a repo → deploy on push; build watch paths, deploy hooks, preview URLs on non-prod branches). — [Migrate from Pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- **Reusable delivery options for "deploy your own instance":**
  1. **Template/seed repo** the user clones + `wrangler deploy` (simplest; matches "reusable engine"). Add a **"Deploy to Cloudflare" button** for one-click fork+deploy.
  2. Engine core as an **npm package** consumed by a thin deployable Worker app (more setup; only worth it if you want versioned engine upgrades for existing installs).
  - For iter-1, (1) is the obvious pick.
- **Config:** a `wrangler.jsonc` with `name`, `compatibility_date`, `main`, `assets` (directory/binding/not_found_handling), and bindings for D1 (and KV/R2 when used). Secrets (password hash pepper, session secret) via `wrangler secret put` / `.dev.vars` locally.

---

## 6. Markdown rendering in Workers

Not fetched as a separate doc (low-risk, well-trodden): pure-JS Markdown parsers run in the Workers runtime — **`markdown-it`**, **`remark`/`marked`** for GFM (tables, task lists, autolinks), **`shiki`** for code syntax highlighting (Cloudflare's own docs use it). Wikilinks (`[[...]]`) and frontmatter (YAML) are handled by parser plugins / a frontmatter pre-pass. These are CPU-cheap per post, well within limits. (Confirm exact lib + plugin set in the editor/content-model prototype ticket.)

---

## How this maps to our open decisions

| Decision (from the grilling) | What the research implies |
|---|---|
| **Packaging & deployment** (was "no idea") | Start with **Workers + Static Assets**, delivered as a **template repo** + `wrangler deploy` (+ optional "Deploy to Cloudflare" button). D1 binding for data. |
| **Static generation & serving** (was open) | The deploy-time/immutability of Static Assets forces the **A (redeploy-on-publish, free reads) vs B (runtime KV/R2/Cache, no rebuild)** choice. Spec must pick. A is cheapest-for-reads; B is simplest-to-operate. |
| **Data layer** (was "cheapest/free-tier") | **D1** source of truth (index slug/status); KV/R2 for generated HTML or media. DO available on Free but overkill. Whole stack is $0 on Free (except possibly auth). |
| **Auth** (was "single user, username/password") | Web Crypto PBKDF2 + signed session cookie + one D1 row. **Watch the Free 10 ms-CPU cap** for hashing; may justify $5/mo Paid. |

---

## Open follow-ups (not resolved here — belong to other tickets/decisions)

- Exact A-vs-B static-generation choice + cache-invalidation + **draft preview** mechanics (drafts need a dynamic render gated by auth regardless).
- Editor/content-model prototype: which Markdown editor lib, frontmatter schema, wikilink resolution, tag handling.
- Whether to use **Queues** to decouple publish→render (probably not in iter-1).
