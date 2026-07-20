import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  // Read the same migrations `wrangler d1 migrations apply` uses, and pass them
  // to the test as a binding so a setup file can apply them to the in-memory D1.
  // Vitest runs from the project root, so this resolves to ./migrations there.
  const migrations = await readD1Migrations("./migrations");

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
              // `.dev.vars` is gitignored and absent in CI, so inject the secret
              // here to keep the suite hermetic. `wrangler dev` reads `.dev.vars`.
              SESSION_SECRET: "test-session-secret",
              // Test-only: the migrations to apply in the setup file.
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
