/**
 * Wordflare Worker — entry point.
 *
 * Ticket #2 (walking skeleton) stood up the spine; ticket #4 adds auth:
 *  - Static Assets serve the public placeholder homepage (ADR-0001): reads of
 *    `/` bypass the Worker entirely.
 *  - `/admin/login` (GET/POST) signs in the Administrator: PBKDF2+pepper verify
 *    (src/auth/password.ts), then an HMAC session cookie (src/auth/session.ts).
 *  - `/admin/*` is gated: no valid session -> redirect to login; a session whose
 *    role lacks the required capability -> 403 (src/auth/capabilities.ts).
 *  - The Administrator is seeded lazily from env vars on the login page
 *    (src/auth/seed.ts).
 *  - `/__health` remains the walking-skeleton status probe.
 */

import { can } from "./auth/capabilities";
import { ensureAdminSeeded } from "./auth/seed";
import {
  createSession,
  verifySession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionUser,
} from "./auth/session";
import { verifyPassword } from "./auth/password";
import { renderDashboard, renderLoginPage } from "./pages";

interface Env {
  /** D1 — source of truth for Posts and Users (ADR-0002). */
  DB: D1Database;
  /** HMAC session-cookie signing key. Local: `.dev.vars`; prod: `wrangler secret`. */
  SESSION_SECRET: string;
  /** Password pepper mixed into every hash. Local: `.dev.vars`; prod: secret. */
  PASSWORD_PEPPER: string;
  /** Seeded Administrator username (defaults to "admin"). */
  ADMIN_USERNAME?: string;
  /** Pre-hashed Administrator password (base64 PBKDF2). Local/prod as above. */
  ADMIN_PASSWORD_HASH?: string;
  /** Salt for the seeded password (base64). */
  ADMIN_PASSWORD_SALT?: string;
  /** Iterations used for the seeded password (per-row self-describing). */
  ADMIN_PASSWORD_ITERATIONS?: string;
}

const LOGIN_PATH = "/admin/login";
const LOGOUT_PATH = "/admin/logout";
const DASHBOARD_PATH = "/admin";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/__health") return handleHealth(env);

    if (pathname === LOGIN_PATH) {
      return request.method === "POST"
        ? handleLoginPost(request, env)
        : handleLoginGet(env);
    }
    if (pathname === LOGOUT_PATH && request.method === "POST") {
      return handleLogout();
    }

    if (
      pathname === DASHBOARD_PATH ||
      pathname === DASHBOARD_PATH + "/" ||
      pathname.startsWith("/admin/")
    ) {
      return handleAdmin(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ── Auth routes ──────────────────────────────────────────────────────────────

/** `GET /admin/login` — render the form, seeding the admin first if needed. */
async function handleLoginGet(env: Env): Promise<Response> {
  await ensureAdminSeeded(env);
  return html(renderLoginPage());
}

/** `POST /admin/login` — verify credentials, set the session cookie or reject. */
async function handleLoginPost(request: Request, env: Env): Promise<Response> {
  await ensureAdminSeeded(env);

  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");

  const user = await env.DB.prepare(
    "SELECT username, password_hash, password_salt, password_iterations, role FROM users WHERE username = ? LIMIT 1",
  )
    .bind(username)
    .first<{
      username: string;
      password_hash: string;
      password_salt: string;
      password_iterations: number;
      role: string;
    }>();

  // Verify only when the user exists and is an Administrator (iteration 1).
  const passwordOk =
    user?.role === "administrator"
      ? await verifyPassword(password, env.PASSWORD_PEPPER, {
          hash: user.password_hash,
          salt: user.password_salt,
          iterations: user.password_iterations,
        })
      : false;

  if (!user || !passwordOk) {
    // Re-render the form with a notice; no session cookie is set on rejection.
    return html(renderLoginPage({ error: true }), 401);
  }

  const value = await createSession(
    { username: user.username, role: user.role },
    env.SESSION_SECRET,
  );
  return new Response(null, {
    status: 303,
    headers: {
      location: DASHBOARD_PATH,
      "set-cookie": sessionCookieHeader(value, SESSION_TTL_SECONDS),
    },
  });
}

/** `POST /admin/logout` — clear the session cookie and return to login. */
function handleLogout(): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: LOGIN_PATH,
      "set-cookie": sessionCookieHeader("", 0),
    },
  });
}

/**
 * `GET /admin` (and other `/admin/*`) — gate on a valid session, then on the
 * `edit_posts` capability per action. Unauthenticated -> redirect to login;
 * authenticated but lacking the capability -> 403; otherwise the dashboard.
 */
async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return redirectToLogin();
  if (!can(user.role, "edit_posts")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { pathname } = new URL(request.url);
  if (pathname === DASHBOARD_PATH || pathname === DASHBOARD_PATH + "/") {
    return html(renderDashboard({ username: user.username }));
  }
  return new Response("Not Found", { status: 404 });
}

// ── Session helpers ──────────────────────────────────────────────────────────

/** Resolve the signed-in user from the request cookie, or `null`. */
async function getSessionUser(
  request: Request,
  env: Env,
): Promise<SessionUser | null> {
  const value = readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (!value) return null;
  return verifySession(value, env.SESSION_SECRET);
}

/** 303 redirect to the login page (the unauthenticated entry point). */
function redirectToLogin(): Response {
  return new Response(null, { status: 303, headers: { location: LOGIN_PATH } });
}

/** Build the `Set-Cookie` header value for the session cookie. */
function sessionCookieHeader(value: string, maxAge: number): string {
  const attrs = [
    `${SESSION_COOKIE}=${value}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  return attrs.join("; ");
}

/** Read the first value for `name` from a `Cookie` header, or `null`. */
function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** Wrap an HTML body in a 200 response with the right content type. */
function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// ── Health (walking-skeleton probe) ──────────────────────────────────────────

/** Body of `GET /__health` — the walking-skeleton status probe. */
export type HealthResponse = {
  db: "ok" | "error";
  posts: number;
  /** True when `SESSION_SECRET` is set (`.dev.vars` in dev, secret in prod). */
  session_secret_set: boolean;
  /** True when `PASSWORD_PEPPER` is set (added with auth, ticket #4). */
  password_pepper_set: boolean;
};

/**
 * Walking-skeleton status check: proves the Worker can reach D1 and read
 * `.dev.vars` secrets. A real health check can replace this later; for now it is
 * the spine's end-to-end probe (migrations applied, binding round-trips).
 */
async function handleHealth(env: Env): Promise<Response> {
  let db: HealthResponse["db"] = "error";
  let posts = 0;
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM posts").first<{
      count: number;
    }>();
    posts = row?.count ?? 0;
    db = "ok";
  } catch {
    db = "error";
  }

  const session_secret_set =
    typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length > 0;
  const password_pepper_set =
    typeof env.PASSWORD_PEPPER === "string" && env.PASSWORD_PEPPER.length > 0;

  const body: HealthResponse = {
    db,
    posts,
    session_secret_set,
    password_pepper_set,
  };
  // The HTTP status reflects DB health: 503 when the probe failed, so an
  // HTTP-level monitor isn't misled by a 200 that reports trouble only in body.
  return Response.json(body, { status: db === "ok" ? 200 : 503 });
}
