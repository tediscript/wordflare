/**
 * Session cookies — HMAC-SHA256 signed, tamper-evident, expiry-bearing.
 *
 * A session value is `base64url(payload).base64url(signature)` where the
 * signature is HMAC-SHA256 over the payload bytes with `SESSION_SECRET`. All
 * state lives in the cookie (no server-side session store) — sufficient for
 * iteration 1's single Administrator; revisit if revocation is ever needed
 * (ADR-0004). Verify recomputes the HMAC via Web Crypto `verify` (constant-time)
 * and rejects any value whose signature, shape, or expiry fails.
 */

import { fromBase64Url, toBase64Url, utf8Decode, utf8Encode } from "./encoding";

/** Default session lifetime: 7 days. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Cookie name carrying the Wordflare session. */
export const SESSION_COOKIE = "wordflare_session";

/** The identity carried by a valid session. */
export interface SessionUser {
  username: string;
  role: string;
}

interface SessionPayload extends SessionUser {
  /** Issued-at, unix seconds. */
  iat: number;
  /** Expiry, unix seconds. */
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    utf8Encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Create a signed session cookie value for `user`. */
export async function createSession(
  user: SessionUser,
  secret: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...user, iat: now, exp: now + ttlSeconds };
  const payloadBytes = utf8Encode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`;
}

/**
 * Verify a session cookie value. Returns the user on a valid, unexpired,
 * correctly-signed cookie; `null` on any failure (tampered, wrong secret,
 * malformed, expired). Never throws — callers can treat `null` as "no session".
 */
export async function verifySession(
  cookieValue: string,
  secret: string,
): Promise<SessionUser | null> {
  const dot = cookieValue.indexOf(".");
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const payloadPart = cookieValue.slice(0, dot);
  const signaturePart = cookieValue.slice(dot + 1);

  let payloadBytes: Uint8Array;
  let signature: ArrayBuffer;
  try {
    payloadBytes = new Uint8Array(fromBase64Url(payloadPart));
    signature = fromBase64Url(signaturePart);
  } catch {
    return null;
  }

  const key = await hmacKey(secret);
  // `verify` is constant-time and also guards against malformed signatures.
  const ok = await crypto.subtle.verify("HMAC", key, signature, payloadBytes);
  if (!ok) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(utf8Decode(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.exp !== "number" ||
    typeof payload.username !== "string" ||
    typeof payload.role !== "string"
  ) {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return { username: payload.username, role: payload.role };
}
