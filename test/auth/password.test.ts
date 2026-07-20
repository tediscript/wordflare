import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import {
  hashPassword,
  verifyPassword,
  type PasswordHash,
} from "../../src/auth/password";

// Pepper/secret come from the vitest config (single source of truth) so the
// Worker and the test always agree.
const PEPPER = () => env.PASSWORD_PEPPER;

describe("password hashing", () => {
  it("round-trips: a hashed password verifies", async () => {
    const stored = await hashPassword("s3cret", {
      pepper: PEPPER(),
      iterations: 1000,
    });
    await expect(verifyPassword("s3cret", PEPPER(), stored)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword("s3cret", {
      pepper: PEPPER(),
      iterations: 1000,
    });
    await expect(verifyPassword("wrong", PEPPER(), stored)).resolves.toBe(false);
  });

  it("rejects the right password hashed with a different pepper", async () => {
    const stored = await hashPassword("s3cret", {
      pepper: PEPPER(),
      iterations: 1000,
    });
    await expect(verifyPassword("s3cret", "other-pepper", stored)).resolves.toBe(
      false,
    );
  });

  it("uses a fresh salt per hash (same password -> different hash)", async () => {
    const a = await hashPassword("same", {
      pepper: PEPPER(),
      iterations: 1000,
    });
    const b = await hashPassword("same", {
      pepper: PEPPER(),
      iterations: 1000,
    });
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    const stored: PasswordHash = {
      hash: "not-base64!!",
      salt: "also-bad!!",
      iterations: 1000,
    };
    await expect(
      verifyPassword("any", PEPPER(), stored),
    ).resolves.toBe(false);
  });

  it("agrees with a node:crypto fixture (operator hash-script contract)", async () => {
    // Fixture computed offline with node:crypto pbkdf2Sync (the algorithm
    // scripts/hash-password.mjs uses) and injected via the KNOWN_PASSWORD_FIXTURE
    // binding, since tests run under workerd where node:crypto is unavailable.
    // A Web-Crypto verify must accept it — this pins the Node<->Web-Crypto PBKDF2
    // contract the operator's hash command depends on.
    const fixture = env.KNOWN_PASSWORD_FIXTURE;
    const stored: PasswordHash = {
      hash: fixture.hash,
      salt: fixture.salt,
      iterations: fixture.iterations,
    };
    await expect(
      verifyPassword(fixture.password, fixture.pepper, stored),
    ).resolves.toBe(true);
  });
});
