/**
 * Minimal server-rendered HTML for the auth surface (iteration 1).
 *
 * The admin front-end is server-rendered HTML from the Worker (spec #1); the
 * editor island lands in a later ticket. These builders escape all interpolated
 * values — never concatenate untrusted strings into HTML.
 */

/** Escape a string for safe interpolation into HTML text/attribute content. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      (
        {
          "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        } as Record<string, string>
      )[c],
  );
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Wordflare</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.4rem; margin-bottom: 0; }
  h2 { font-size: 1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
  label { display: block; margin: 0.75rem 0 0.15rem; }
  input { display: block; width: 100%; box-sizing: border-box; padding: 0.4rem; font: inherit; }
  button { margin-top: 1rem; padding: 0.5rem 1rem; font: inherit; cursor: pointer; }
  .error { color: #b00020; }
  .muted { color: #666; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Render the login page. `error` shows an invalid-credentials notice. */
export function renderLoginPage(opts: { error?: boolean } = {}): string {
  const notice = opts.error
    ? `\n<p class="error">Invalid username or password.</p>`
    : "";
  return shell(
    "Log in",
    `<h1>Wordflare</h1>
<h2>Log in</h2>${notice}
<form method="post" action="/admin/login">
  <label for="username">Username</label>
  <input id="username" name="username" autocomplete="username" required>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Log in</button>
</form>`,
  );
}

/** Render the admin dashboard shell. */
export function renderDashboard(opts: { username: string }): string {
  return shell(
    "Dashboard",
    `<h1>Wordflare admin</h1>
<p>Signed in as <strong>${escapeHtml(opts.username)}</strong>.</p>
<form method="post" action="/admin/logout">
  <button type="submit">Log out</button>
</form>
<p class="muted">This is the admin dashboard shell. Post editing lands in a later ticket.</p>`,
  );
}
