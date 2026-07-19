# Wordflare

A reusable, single-tenant blog engine that runs on Cloudflare's native stack. The author writes in an Obsidian-style Markdown editor; published posts are served as static, edge-cached HTML. Vocabulary borrows from WordPress (the author's familiar frame) and Obsidian (the content format).

## Content

**Post**:
A unit of published writing with a title, Markdown body, and metadata. The thing the Loop iterates and readers read.
_Avoid_: Article, entry, document.

**Page**:
A static, non-temporal content type (e.g. About). Out of scope for iteration 1.
_Avoid_: (none — but do not confuse with a Post.)

**Frontmatter**:
The YAML block at the top of a Post holding its metadata (title, slug, excerpt, tags, status, dates, author).
_Avoid_: Metadata (too generic), header.

**Content (body)**:
The Markdown text of a Post, below the frontmatter.
_Avoid_: Body, HTML (the body is Markdown, not HTML).

**Tag**:
A label on a Post, written inline as `#tag` or listed in frontmatter. Used to organize posts.
_Avoid_: Category (a separate, deferred taxonomy), label, keyword.

**Wikilink**:
An internal link to another Post, written `[[target]]` (optionally `[[target|alias]]` or `[[target#heading]]`). Resolves to the target Post's permalink.
_Avoid_: Internal link (too generic), cross-reference.

**Excerpt**:
A short summary of a Post, shown in listings and used as the page description.
_Avoid_: Summary, description (those words name other things).

**Featured Image**:
A representative image for a Post. Out of scope for iteration 1.

## Lifecycle

**Post Status**:
The publication state of a Post. Iteration 1 has **Draft** and **Published**; future statuses (Scheduled, Pending, Private) are reserved.
_Avoid_: State, visibility.

**Draft**:
A Post not yet visible to readers.
_Avoid_: Unpublished (use the Status), work-in-progress.

**Published**:
A Post visible to readers, rendered into static HTML.

**Publish**:
The action that moves a Post to Published and triggers Regeneration of the static site.
_Avoid_: Deploy (that's the mechanism), go-live, release.

**Draft preview**:
An on-demand render of a Draft, shown only to an authenticated author, exactly as it will appear when published.
_Avoid_: Staging, preview mode.

**Regenerate**:
Rebuild the static HTML (index pages and single posts) from current Posts, producing a new deployment. Triggered by Publish (and by editing/unpublishing a live post).
_Avoid_: Rebuild (too generic), re-render.

**The Loop**:
Iterating over Published Posts to render a listing (the Posts index, a tag view, etc.). Borrowed from WordPress.
_Avoid_: Query, feed.

## Reading

**Posts index**:
The front page — a paginated Loop of the latest Published Posts.
_Avoid_: Home (use Posts index), blog page, feed.

**Single Post**:
The page that renders one Published Post at its permalink.
_Avoid_: Post page (ambiguous), detail.

**Permalink**:
The permanent URL of a Post, structured from its slug.
_Avoid_: URL (too generic), link.

**Slug**:
The URL-safe identifier of a Post, used in its permalink. Auto-derived from the title, editable.
_Avoid_: URL fragment, handle.

**Pagination**:
Splitting the Posts index across pages (`/`, `/page/2/`, …).
_Avoid_: Paging.

## Access

**User**:
A person who can authenticate into the admin. Iteration 1 has one User.
_Avoid_: Account, member.

**Role**:
A named bundle of Capabilities assigned to a User (iteration 1: Administrator only).
_Avoid_: Group, permission group.

**Capability**:
A specific permission (e.g. `edit_posts`, `publish_posts`), checked per action. The model is built so more Roles and Capabilities can be added later.
_Avoid_: Permission (use Capability), right.

**Administrator**:
The Role that can do everything in iteration 1 — write, edit, publish, manage the site.
_Avoid_: Admin (use the full term in prose), owner.

**Author**:
The User who wrote a Post. Stored on the Post.
_Avoid_: Writer, contributor.
