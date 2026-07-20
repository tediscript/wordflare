import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { hashPassword, type PasswordHash } from "../../src/auth/password";
import {
  createSession,
  SESSION_COOKIE,
} from "../../src/auth/session";

// Credentials the Worker verifies against — pepper/secret come from the vitest
// config (shared with the Worker), so hashing here matches verifying there.
const GOOD_PASSWORD = "correct-horse-battery-staple";
const ITERATIONS = 1000; // low for fast tests; deploys tune higher (ADR-0004)

/** Seed a login-able Administrator directly through D1 using a real hash. */
async function seedAdmin(
  password = GOOD_PASSWORD,
  username = "admin",
): Promise<PasswordHash> {
  const stored = await hashPassword(password, {
    pepper: env.PASSWORD_PEPPER,
    iterations: ITERATIONS,
  });
  const now = new Date(0).toISOString();
  await env.DB.prepare(
    "INSERT INTO users (username, password_hash, password_salt, password_iterations, role, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 'administrator', ?, ?)",
  )
    .bind(username, stored.hash, stored.salt, stored.iterations, now, now)
    .run();
  return stored;
}

/** The session-cookie value from a Response's Set-Cookie, or null if absent. */
function sessionCookie(res: Response): string | null {
  for (const sc of res.headers.getSetCookie()) {
    const match = sc.match(new RegExp(`^${SESSION_COOKIE}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function withSession(cookieValue: string): { cookie: string } {
  return { cookie: `${SESSION_COOKIE}=${cookieValue}` };
}

function postForm(body: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    // Inspect the 303 directly rather than auto-following to the target.
    redirect: "manual",
  };
}

describe("admin gating", () => {
  it("redirects unauthenticated GET /admin to the login page", async () => {
    const res = await SELF.fetch("http://localhost/admin", {
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login");
  });

  it("serves the login form at GET /admin/login", async () => {
    const res = await SELF.fetch("http://localhost/admin/login");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Log in");
    expect(body).toMatch(/action="\/admin\/login"/);
  });
});

describe("login", () => {
  it("sets a signed session cookie on correct credentials", async () => {
    await seedAdmin();
    const res = await SELF.fetch(
      "http://localhost/admin/login",
      postForm(`username=admin&password=${encodeURIComponent(GOOD_PASSWORD)}`),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin");
    const cookie = sessionCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain("."); // payload.signature
  });

  it("rejects the wrong password with a 401 and no cookie", async () => {
    await seedAdmin();
    const res = await SELF.fetch(
      "http://localhost/admin/login",
      postForm("username=admin&password=wrong"),
    );
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeNull();
    expect(await res.text()).toContain("Invalid");
  });

  it("rejects an unknown username with a 401 and no cookie", async () => {
    await seedAdmin();
    const res = await SELF.fetch(
      "http://localhost/admin/login",
      postForm("username=nobody&password=whatever"),
    );
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeNull();
  });
});

describe("authenticated session", () => {
  it("reaches the dashboard with a valid session cookie", async () => {
    const cookie = await createSession(
      { username: "admin", role: "administrator" },
      env.SESSION_SECRET,
    );
    const res = await SELF.fetch("http://localhost/admin", {
      headers: withSession(cookie),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("admin");
    expect(body).toContain("dashboard");
  });

  it("rejects a tampered cookie (treated as unauthenticated -> redirect)", async () => {
    const cookie = await createSession(
      { username: "admin", role: "administrator" },
      env.SESSION_SECRET,
    );
    // Mutate the tail of the signature so the HMAC no longer matches.
    const tampered = cookie.slice(0, -2) + (cookie.endsWith("AA") ? "BB" : "AA");
    const res = await SELF.fetch("http://localhost/admin", {
      headers: withSession(tampered),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login");
  });

  it("rejects a cookie signed with the wrong secret", async () => {
    const cookie = await createSession(
      { username: "admin", role: "administrator" },
      "a-different-secret",
    );
    const res = await SELF.fetch("http://localhost/admin", {
      headers: withSession(cookie),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login");
  });

  it("grants dashboard access with the cookie issued at login", async () => {
    // End-to-end: the cookie the Worker actually issues on login must be the one
    // the gate accepts — proving the login<->session<->gate round trip.
    await seedAdmin();
    const login = await SELF.fetch(
      "http://localhost/admin/login",
      postForm(`username=admin&password=${encodeURIComponent(GOOD_PASSWORD)}`),
    );
    const issued = sessionCookie(login);
    expect(issued).toBeTruthy();

    const res = await SELF.fetch("http://localhost/admin", {
      headers: withSession(issued!),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("dashboard");
  });

  it("denies a session whose role lacks the required capability (403)", async () => {
    // A validly-signed session for a role with no capabilities must be denied at
    // the per-action gate, exercising the capability check over HTTP.
    const cookie = await createSession(
      { username: "admin", role: "editor" },
      env.SESSION_SECRET,
    );
    const res = await SELF.fetch("http://localhost/admin", {
      headers: withSession(cookie),
    });
    expect(res.status).toBe(403);
  });
  it("clears the session cookie on logout and redirects to login", async () => {
    const res = await SELF.fetch("http://localhost/admin/logout", {
      method: "POST",
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login");
    const sc = res.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE));
    expect(sc).toBeDefined();
    expect(sc).toContain("Max-Age=0"); // instructs the client to drop the cookie
  });
});

describe("seeding", () => {
  it("seeds the Administrator from env vars on first login-page load", async () => {
    const res = await SELF.fetch("http://localhost/admin/login");
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT username, password_hash, password_salt, password_iterations FROM users WHERE role = 'administrator' LIMIT 1",
    ).first<{
      username: string;
      password_hash: string;
      password_salt: string;
      password_iterations: number;
    }>();

    expect(row).not.toBeNull();
    expect(row?.username).toBe(env.ADMIN_USERNAME);
    expect(row?.password_hash).toBe(env.ADMIN_PASSWORD_HASH);
    expect(row?.password_salt).toBe(env.ADMIN_PASSWORD_SALT);
    expect(row?.password_iterations).toBe(Number(env.ADMIN_PASSWORD_ITERATIONS));
  });

  it("does not overwrite an already-present Administrator", async () => {
    const inserted = await seedAdmin("my-real-password", "admin");
    await SELF.fetch("http://localhost/admin/login"); // triggers ensureAdminSeeded

    const row = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE role = 'administrator' LIMIT 1",
    ).first<{ password_hash: string }>();
    // Still the hash we inserted — not the env-provided one.
    expect(row?.password_hash).toBe(inserted.hash);
  });
});
