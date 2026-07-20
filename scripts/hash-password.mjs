#!/usr/bin/env node
/**
 * Generate the pre-hashed Administrator credentials for the `ADMIN_*` env vars.
 *
 * The Worker stores only a salted, peppered PBKDF2 hash (src/auth/password.ts),
 * so the operator hashes once — here — and feeds the result to the deploy. This
 * uses node:crypto's pbkdf2Sync, which is the same algorithm the Worker's Web
 * Crypto verify expects (the cross-runtime contract is policed by the password
 * fixture test). No plaintext password ever reaches the Worker.
 *
 * Usage:
 *   # Interactive (prompts for the password):
 *   PASSWORD_PEPPER="$(openssl rand -hex 32)" node scripts/hash-password.mjs [iterations]
 *
 *   # Non-interactive (reads PASSWORD_TO_HASH):
 *   PASSWORD_PEPPER=... PASSWORD_TO_HASH='...' node scripts/hash-password.mjs [iterations]
 *
 * Then put the printed values in .dev.vars (local) or `wrangler secret put`
 * (prod). Default iterations is 100000 (tune to the Free ~10ms-CPU cap; see
 * ADR-0004).
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, env, argv } from "node:process";

const pepper = env.PASSWORD_PEPPER;
if (!pepper) {
  console.error(
    "PASSWORD_PEPPER is not set. Generate one with: openssl rand -hex 32",
  );
  process.exit(1);
}

const iterations = Number(argv[2] ?? "100000");
if (!Number.isFinite(iterations) || iterations <= 0) {
  console.error("iterations must be a positive integer");
  process.exit(1);
}

let password = env.PASSWORD_TO_HASH;
if (!password) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: false });
  password = await rl.question("Admin password: ");
  rl.close();
}
if (!password) {
  console.error("No password provided.");
  process.exit(1);
}

// Must match src/auth/password.ts: PBKDF2-SHA256(password+pepper, salt, iter, 256).
const salt = randomBytes(16);
const hash = pbkdf2Sync(
  Buffer.from(password + pepper),
  salt,
  iterations,
  32,
  "sha256",
);

console.log("Add these to .dev.vars (local) or set via `wrangler secret put` (prod):");
console.log(`ADMIN_PASSWORD_HASH=${hash.toString("base64")}`);
console.log(`ADMIN_PASSWORD_SALT=${salt.toString("base64")}`);
console.log(`ADMIN_PASSWORD_ITERATIONS=${iterations}`);
