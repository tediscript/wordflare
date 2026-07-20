-- Posts: the source of truth for content (ADR-0002).
-- Columns mirror the Post content model (CONTEXT.md, spec #1 frontmatter):
-- title, slug, excerpt, tags[], status (draft|published), published_at,
-- updated_at, author; plus the Markdown `content` body and housekeeping ids.

CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,           -- permalink identifier; filtered on for lookups
  title         TEXT    NOT NULL,
  excerpt       TEXT,                              -- short summary for listings / page description
  content       TEXT    NOT NULL DEFAULT '',       -- the Markdown body (below the frontmatter)
  status        TEXT    NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  tags          TEXT    NOT NULL DEFAULT '[]',     -- JSON array of tag strings
  author        TEXT,                              -- username of the author (frontmatter 'author')
  published_at  TEXT,                              -- ISO8601 (UTC); NULL until first published
  updated_at    TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  CHECK (status IN ('draft', 'published'))
);

-- Index every column a query filters on (ADR-0002), or unfiltered "rows read"
-- burns the 5M-rows-read/day free quota. slug is indexed via its UNIQUE constraint.
CREATE INDEX IF NOT EXISTS idx_posts_status       ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts (published_at);
