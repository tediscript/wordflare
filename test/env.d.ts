import type { D1Migration } from "cloudflare:test";

// Type the bindings the test accesses on `env` (from `cloudflare:test`).
// The Worker's own `Env` is declared in `src/worker.ts`; this only covers the
// test surface (including test-only bindings like `TEST_MIGRATIONS` and
// `KNOWN_PASSWORD_FIXTURE`).
declare module "cloudflare:test" {
  interface ProvidedEnv {
    /** D1 — source of truth for Posts and Users (ADR-0002). */
    DB: D1Database;
    /** HMAC session-cookie secret (injected for tests; `.dev.vars` in dev). */
    SESSION_SECRET: string;
    /** Password pepper (injected for tests; `.dev.vars` / secret in prod). */
    PASSWORD_PEPPER: string;
    /** Seeded Administrator username. */
    ADMIN_USERNAME: string;
    /** Seeded Administrator password hash (base64 PBKDF2). */
    ADMIN_PASSWORD_HASH: string;
    /** Seeded Administrator password salt (base64). */
    ADMIN_PASSWORD_SALT: string;
    /** Seeded Administrator password iterations. */
    ADMIN_PASSWORD_ITERATIONS: string;
    /** Test-only: migrations read by `readD1Migrations()` in the vitest config. */
    TEST_MIGRATIONS: D1Migration[];
    /** Test-only: node:crypto fixture for the operator hash-script contract. */
    KNOWN_PASSWORD_FIXTURE: {
      password: string;
      pepper: string;
      salt: string;
      hash: string;
      iterations: number;
    };
  }
}
