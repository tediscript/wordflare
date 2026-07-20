import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  // Read the same migrations `wrangler d1 migrations apply` uses, and pass them
  // to the test as a binding so a setup file can apply them to the in-memory D1.
  // Vitest runs from the project root, so this resolves to ./migrations there.
  const migrations = await readD1Migrations("./migrations");

  // ── Auth fixtures ─────────────────────────────────────────────────────────
  // These mirror src/auth/password.ts: PBKDF2-SHA256(password+pepper, salt,
  // iterations, 256 bits) -> base64. They are hardcoded KNOWN-ANSWER vectors
  // (computed offline with `node:crypto`, see password.test.ts) rather than
  // computed at config time, so this Node-side file needs no node types and the
  // Worker's Web-Crypto verify is pinned against an external reference.
  const PASSWORD_PEPPER = "test-pepper";
  const SESSION_SECRET = "test-session-secret";
  // Administrator seeded from env vars (the login tests seed their own admin via
  // D1 + the real hashPassword; these drive the seed-path HTTP test).
  const ADMIN_USERNAME = "admin";
  const ADMIN_PASSWORD_SALT = "ASNFZ4mrze8BI0VniavN7w=="; // hex 0123456789abcdef0123456789abcdef
  const ADMIN_PASSWORD_HASH =
    "tylfim6KdQxgyqE5JVnt1n72GnWI6Vg839Q7NGaGznQ="; // pbkdf2(correct-horse-battery-staple+test-pepper, ^salt, 1000)
  const ADMIN_PASSWORD_ITERATIONS = "1000";
  // Cross-runtime contract fixture: the operator's hash command
  // (scripts/hash-password.mjs, node:crypto) and the Worker (Web Crypto) must
  // both reproduce this exact value for the inputs below.
  const KNOWN_PASSWORD_FIXTURE = {
    password: "operator-password",
    pepper: "operator-pepper",
    salt: "/+7dzLuqmYh3ZlVEMyIRAA==", // hex ffeeddccbbaa99887766554433221100
    hash: "/AMzaOUnoUgcbK7Pk+TUo6ddw+K5nyCv8NyrqtVu2BQ=", // pbkdf2(operator-password+operator-pepper, ^salt, 2500)
    iterations: 2500,
  };

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          // Set explicitly (it's the framework default) so a destructive test
          // like the /__health 503 case stays order-independent — it must not
          // silently break if someone toggles this later (e.g. for Workflows,
          // which require isolatedStorage: false).
          isolatedStorage: true,
          // Drive the real Worker (and its D1/Static-Assets bindings) under
          // Miniflare, reading the same wrangler.jsonc that `wrangler dev` uses.
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              // `.dev.vars` is gitignored and absent in CI, so inject the secrets
              // here to keep the suite hermetic. `wrangler dev` reads `.dev.vars`.
              SESSION_SECRET,
              PASSWORD_PEPPER,
              ADMIN_USERNAME,
              ADMIN_PASSWORD_HASH,
              ADMIN_PASSWORD_SALT,
              ADMIN_PASSWORD_ITERATIONS,
              // Test-only: the migrations to apply in the setup file.
              TEST_MIGRATIONS: migrations,
              // Test-only: cross-runtime PBKDF2 known-answer vector
              // (see password.test.ts).
              KNOWN_PASSWORD_FIXTURE,
            },
          },
        },
      },
    },
  };
});
