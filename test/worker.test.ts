import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import type { HealthResponse } from "../src/worker";

/**
 * Walking-skeleton smoke tests — Seam 1 (the Worker's HTTP boundary).
 *
 * Prove the local-dev spine through external behavior only (HTTP Responses):
 *  - Static Assets serve the placeholder homepage (reads of `/` bypass the Worker).
 *  - The Worker runs and drives the D1 binding (a written row is observable).
 *  - A `.dev.vars` secret is readable inside the Worker.
 */

async function getHealth(): Promise<HealthResponse> {
  const res = await SELF.fetch("http://localhost/__health");
  expect(res.status).toBe(200);
  return res.json() as Promise<HealthResponse>;
}

describe("walking skeleton", () => {
  it("serves the static placeholder homepage at GET /", async () => {
    const res = await SELF.fetch("http://localhost/");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Wordflare");
  });

  it("drives the D1 binding through the Worker at GET /__health", async () => {
    const before = await getHealth();

    // Write a Post row directly through the D1 binding.
    await env.DB.prepare(
      "INSERT INTO posts (slug, title, status, content, tags, author, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "hello-world",
        "Hello World",
        "draft",
        "# Hello",
        "[]",
        "admin",
        new Date(0).toISOString(),
        new Date(0).toISOString(),
      )
      .run();

    const after = await getHealth();

    expect(after.status).toBe("ok");
    expect(after.db).toBe("ok");
    expect(after.configured).toBe(true);
    // The row written through the binding is observable through the Worker.
    expect(after.posts).toBe(before.posts + 1);
  });
});
