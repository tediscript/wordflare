-- Users: people who can authenticate into the admin (CONTEXT.md).
-- Iteration 1 has one Administrator; this shape leaves room for more users/roles
-- (spec #1: Roles & Capabilities). Password auth lands in a later ticket — the
-- columns here are the auth-ready minimal set (salted PBKDF2 hash via Web Crypto).

CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT    NOT NULL UNIQUE,
  password_hash       TEXT    NOT NULL,    -- PBKDF2 output (Web Crypto); see auth ticket
  password_salt       TEXT    NOT NULL,
  password_iterations INTEGER NOT NULL,    -- stored per-row so hashes are self-describing / re-tunable
  role                TEXT    NOT NULL DEFAULT 'administrator', -- iteration 1: Administrator only
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);
