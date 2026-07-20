/**
 * Byte <-> text encoding helpers shared by the auth modules.
 *
 * Web Crypto works in `ArrayBuffer`/`Uint8Array`; D1 and cookies want strings,
 * so every hash/session value is base64. Password hashes use standard base64
 * (SQL/JSON-safe), session cookies use base64url (cookie-safe, no padding).
 * Centralizing these keeps the two algorithms bit-for-bit consistent with the
 * operator's `node:crypto` reference (scripts/hash-password.mjs).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** UTF-8 encode a string to bytes. */
export function utf8Encode(value: string): Uint8Array {
  return encoder.encode(value);
}

/** UTF-8 decode bytes to a string. */
export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

function bytesOf(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/** Standard-alphabet base64 of a byte buffer. */
export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = bytesOf(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Byte buffer from a standard-alphabet base64 string. */
export function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Base64url (no padding) of a byte buffer. */
export function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  return toBase64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Byte buffer from a base64url string (with or without padding). */
export function fromBase64Url(b64: string): ArrayBuffer {
  const padded =
    b64.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((b64.length + 3) % 4);
  return fromBase64(padded);
}
