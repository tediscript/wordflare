# Auth: PBKDF2 + pepper passwords; HMAC session cookie

Iteration-1 authentication hashes passwords with **salted, peppered PBKDF2-SHA256 via Web Crypto** and carries login state in an **HMAC-SHA256 signed cookie** keyed by `SESSION_SECRET`. We rejected bcrypt/argon2 (not in the Workers runtime) and server-side session storage (premature for one Administrator), choosing stateless signed cookies instead.

## Considered Options

### Password hashing
- **PBKDF2-SHA256 + pepper** (chosen) — Web-Crypto native (no dependency), tunable iterations. The pepper (`PASSWORD_PEPPER` secret) means a DB leak alone cannot be offline-cracked.
- **bcrypt / argon2** — rejected: not built into the Workers runtime; a WASM port adds bundle size and CPU cost against the same Free-tier cap.
- **Plaintext / unsalted** — rejected outright.

### Sessions
- **Stateless HMAC-signed cookie** (chosen) — no store to run; sufficient for one user.
- **Server-side session store (D1/KV)** — rejected as premature; revisit when revocation or multi-user sessions are needed.

## Consequences

- **The Free-tier CPU cap governs iterations.** Workers Free allows ~10ms CPU/request; PBKDF2 is CPU-bound, so the count sits well below OWASP's 600k (SHA-256) ideal. We default to **100 000** and store iterations **per row** (`users.password_iterations`) so each hash is self-describing and can be re-tuned independently. A future ticket can re-hash on login to raise strength, or the project moves to Workers Paid for stronger hashing. _Benchmarked locally under workerd (a proxy for edge CPU time, which is what the 10ms limit meters): ~6.8ms CPU for 100k iterations, ~3.6ms for 50k, ~17ms for 250k — so 100k fits the cap with margin while 250k does not. The operator should confirm against their own traffic and lower/raise per-row as needed._
- **The pepper is a deploy secret** (`PASSWORD_PEPPER`); losing it invalidates every stored hash (acceptable for single-tenant — the operator regenerates the pepper and re-seeds).
- **Sessions are stateless:** there is no server-side revocation. Signing out clears the cookie client-side; a stolen cookie is valid until its `exp` (default 7 days). Revisit (session store, shorter TTL, or refresh tokens) when the threat model requires revocation.
- **The first Administrator is seeded from pre-hashed env vars** at deploy (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH/SALT/ITERATIONS`), produced by `scripts/hash-password.mjs` and consumed by `src/auth/seed.ts`. The Worker inserts it lazily if absent and never overwrites an existing row. The Node↔Web-Crypto PBKDF2 contract the hash command relies on is policed by the password fixture test.
