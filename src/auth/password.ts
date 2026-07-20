/**
 * Password hashing — salted, peppered PBKDF2-SHA256 via Web Crypto.
 *
 * Construction: `PBKDF2-SHA256(password + pepper, salt, iterations, 256 bits)`.
 * The pepper (`PASSWORD_PEPPER`, a per-deploy secret distinct from the DB) means
 * a database-only leak still cannot be offline-cracked without the secret.
 * Iterations are stored per-row (the `users` migration) so each hash is
 * self-describing and independently re-tunable — important because the Free-tier
 * ~10ms-CPU/request cap forces a lower count than OWASP's ideal (ADR-0004).
 *
 * All byte buffers are base64 so values are SQL/JSON-safe. The algorithm is
 * deliberately the same shape as `node:crypto.pbkdf2Sync`, so the operator's
 * hash command (`scripts/hash-password.mjs`) and this verify agree bit-for-bit;
 * that cross-runtime contract is policed by the password fixture test.
 */

import { fromBase64, toBase64, utf8Encode } from "./encoding";

/** PBKDF2-SHA256 output length. */
const HASH_BITS = 256;
/** Per-hash random salt length. */
const SALT_BYTES = 16;

/** A self-describing stored password hash (base64 fields). */
export interface PasswordHash {
  /** Base64 PBKDF2-SHA256 output (256 bits). */
  hash: string;
  /** Base64 per-hash salt (128 bits). */
  salt: string;
  /** Iteration count used to derive this hash. */
  iterations: number;
}

/** Inputs to {@link hashPassword}. */
export interface HashOptions {
  /** Server-side secret from `PASSWORD_PEPPER`; mixed into every hash. */
  pepper: string;
  /**
   * Iteration count. Tune to the Free ~10ms-CPU cap; stored per-row so it can be
   * raised per-hash later (ADR-0004).
   */
  iterations: number;
}

/**
 * Hash a password, returning the self-describing `{hash, salt, iterations}`
 * triple (base64). Check a candidate later with {@link verifyPassword}.
 */
export async function hashPassword(
  password: string,
  opts: HashOptions,
): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, opts.pepper, salt, opts.iterations);
  return {
    hash: toBase64(hash),
    salt: toBase64(salt),
    iterations: opts.iterations,
  };
}

/**
 * Verify a candidate password against a stored hash. Returns `false` on any
 * mismatch — wrong password, wrong pepper, or malformed stored value. The
 * comparison is length-checked and branch-free over the bytes (timing-safe).
 */
export async function verifyPassword(
  password: string,
  pepper: string,
  stored: PasswordHash,
): Promise<boolean> {
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = new Uint8Array(fromBase64(stored.salt));
    expected = new Uint8Array(fromBase64(stored.hash));
  } catch {
    return false;
  }
  const derived = new Uint8Array(
    await derive(password, pepper, salt, stored.iterations),
  );
  return timingSafeEqual(derived, expected);
}

/** `PBKDF2-SHA256(password+pepper, salt, iterations)` -> 256-bit ArrayBuffer. */
async function derive(
  password: string,
  pepper: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8Encode(password + pepper),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    HASH_BITS,
  );
}

/** Constant-time equality of two byte arrays (mismatched lengths reject). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
