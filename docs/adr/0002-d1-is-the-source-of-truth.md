# D1 is the source of truth for content

**Cloudflare D1** is the system of record for Posts and Users. Rendered HTML and media are derived from it — HTML is regenerated into static assets on publish (see ADR-0001); media, when added in a later iteration, will live in R2. D1 was chosen over Workers KV and R2 for the record because content is relational and indexable (look up posts by slug, status, date), and KV's free write quota (1,000 writes/day) plus its eventual consistency make it unsuitable as a writeable source of truth — KV is reserved for an optional read cache only.

## Consequences

- Every column a query filters on (`slug`, `status`, `published_at`) must be **indexed**, or "rows read" burns the 5M-rows-read/day free quota fast (a known D1 trap).
- Schema and migrations live in D1; the data model can evolve without touching the rendering layer.
- KV and R2 stay derived/cached stores, never the authority.
