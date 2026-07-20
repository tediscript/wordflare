/**
 * Admin seeding — idempotently ensures one Administrator exists, from env vars.
 *
 * The operator deploys with pre-hashed credentials (produced by
 * `scripts/hash-password.mjs`):
 *   `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`,
 *   `ADMIN_PASSWORD_ITERATIONS`, plus the `PASSWORD_PEPPER` secret.
 *
 * {@link ensureAdminSeeded} inserts the Administrator **if and only if** none
 * exists — it never overwrites an existing row, so it is safe to call on every
 * login-page load and costs a single indexed read in steady state. To rotate
 * the password, drop the row (one `wrangler d1 execute` DELETE) and the next
 * login-page visit re-seeds from the updated env vars.
 */

/** The subset of `Env` that seeding reads. */
export interface SeedEnv {
  DB: D1Database;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_PASSWORD_SALT?: string;
  ADMIN_PASSWORD_ITERATIONS?: string;
}

/**
 * Ensure exactly one Administrator is present, inserting one from env vars if
 * the table has none. No-op when an Administrator already exists, or when the
 * env vars are incomplete (it will not seed an admin nobody can sign in as).
 */
export async function ensureAdminSeeded(env: SeedEnv): Promise<void> {
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE role = ? LIMIT 1",
  )
    .bind("administrator")
    .first<{ id: number }>();
  if (existing) return;

  const username = env.ADMIN_USERNAME ?? "admin";
  const hash = env.ADMIN_PASSWORD_HASH;
  const salt = env.ADMIN_PASSWORD_SALT;
  const iterations = Number.parseInt(env.ADMIN_PASSWORD_ITERATIONS ?? "", 10);
  if (!hash || !salt || !Number.isFinite(iterations) || iterations <= 0) return;

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO users (username, password_hash, password_salt, password_iterations, role, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 'administrator', ?, ?)",
  )
    .bind(username, hash, salt, iterations, now, now)
    .run();
}
