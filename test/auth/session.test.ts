import { describe, expect, it } from "vitest";
import {
  createSession,
  verifySession,
  SESSION_COOKIE,
} from "../../src/auth/session";

const SECRET = "test-session-secret";
const USER = { username: "admin", role: "administrator" };

describe("session cookie", () => {
  it("round-trips: a created session verifies and yields the user", async () => {
    const value = await createSession(USER, SECRET);
    await expect(verifySession(value, SECRET)).resolves.toEqual(USER);
  });

  it("rejects a tampered payload (signature no longer matches)", async () => {
    const value = await createSession(USER, SECRET);
    const [payload, signature] = value.split(".");
    const last = payload.slice(-1);
    const flipped = payload.slice(0, -1) + (last === "A" ? "B" : "A");
    await expect(
      verifySession(`${flipped}.${signature}`, SECRET),
    ).resolves.toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const value = await createSession(USER, SECRET);
    const [payload, signature] = value.split(".");
    // Mutate the tail (>=2 chars) so a fully-significant byte always differs.
    // A 256-bit HMAC base64url-encodes to 43 chars; the last char holds only
    // 4 significant bits + 2 zero padding bits, so flipping just one trailing
    // char can change only padding bits — leaving the decoded signature
    // identical and verify() returning true (the original flake).
    const tampered = signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");
    await expect(
      verifySession(`${payload}.${tampered}`, SECRET),
    ).resolves.toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const value = await createSession(USER, SECRET);
    await expect(verifySession(value, "other-secret")).resolves.toBeNull();
  });

  it("rejects malformed cookie values", async () => {
    await expect(verifySession("garbage", SECRET)).resolves.toBeNull();
    await expect(verifySession("only-one-part", SECRET)).resolves.toBeNull();
    await expect(verifySession("a.", SECRET)).resolves.toBeNull();
    await expect(verifySession(".b", SECRET)).resolves.toBeNull();
  });

  it("rejects an expired session", async () => {
    // A negative TTL places exp in the past.
    const value = await createSession(USER, SECRET, -60);
    await expect(verifySession(value, SECRET)).resolves.toBeNull();
  });

  it("exposes the documented cookie name", () => {
    expect(SESSION_COOKIE).toBe("wordflare_session");
  });
});
