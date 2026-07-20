/**
 * Wordflare Worker — entry point.
 *
 * Ticket #2 (walking skeleton): proves the local-dev spine.
 *  - Static Assets serve the public placeholder homepage (ADR-0001): reads of
 *    `/` bypass the Worker entirely.
 *  - This Worker handles dynamic routes. For the skeleton that is just the
 *    `/__health` status check, which drives the D1 binding and reads a local
 *    secret, proving the wiring end to end.
 */

interface Env {
  /** D1 — source of truth for Posts and Users (ADR-0002). */
  DB: D1Database;
  /** HMAC session-cookie secret. Local: `.dev.vars`; prod: `wrangler secret`. */
  SESSION_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__health") {
      return handleHealth(env);
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** Body of `GET /__health` — the walking-skeleton status probe. */
export type HealthResponse = {
  status: "ok";
  db: "ok" | "error";
  posts: number;
  configured: boolean;
};

/**
 * Walking-skeleton status check: proves the Worker can reach D1 and read a
 * `.dev.vars` secret. A real health check can replace this later; for now it is
 * the spine's end-to-end probe (migrations applied, binding round-trips).
 */
async function handleHealth(env: Env): Promise<Response> {
  let db: HealthResponse["db"] = "error";
  let posts = 0;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM posts",
    ).first<{ count: number }>();
    posts = row?.count ?? 0;
    db = "ok";
  } catch {
    db = "error";
  }

  const configured =
    typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length > 0;

  const body: HealthResponse = { status: "ok", db, posts, configured };
  // The HTTP status reflects DB health: 503 when the probe failed, so an
  // HTTP-level monitor isn't misled by a 200 that reports trouble only in body.
  return Response.json(body, { status: db === "ok" ? 200 : 503 });
}
