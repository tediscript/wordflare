import type { D1Migration } from "cloudflare:test";

// Type the bindings the test accesses on `env` (from `cloudflare:test`).
// The Worker's own `Env` is declared in `src/worker.ts`; this only covers the
// test surface (including the test-only `TEST_MIGRATIONS` binding).
declare module "cloudflare:test" {
  interface ProvidedEnv {
    /** D1 — source of truth for Posts and Users (ADR-0002). */
    DB: D1Database;
    /** HMAC session-cookie secret (injected for tests; `.dev.vars` in dev). */
    SESSION_SECRET: string;
    /** Test-only: migrations read by `readD1Migrations()` in the vitest config. */
    TEST_MIGRATIONS: D1Migration[];
  }
}
