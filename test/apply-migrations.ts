import { applyD1Migrations, env } from "cloudflare:test";

// Setup files run outside isolated storage and may run more than once.
// `applyD1Migrations()` only applies migrations not already recorded in the
// `d1_migrations` table, so calling it here is safe and idempotent.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
