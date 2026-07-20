## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues (uses the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Using the five default canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Source-control workflow

GitHub Flow. `main` is protected and always deployable; **never push directly to `main`**. Every change (including every agent `/implement` run) starts on a short-lived branch and lands via a pull request:

- Branch from `main`: `feat/<ticket>-<slug>` (or `fix/`, `chore/`, `docs/`). The ticket number auto-links the branch/PR to its issue.
- Open a PR against `main`; run `/code-review` on it.
- Squash-merge, then delete the branch. Reference the ticket in the PR title/body so it auto-links.
- `main` is branch-protected: a PR is required (admins included); direct pushes are rejected; self-merge is allowed for solo work.
- Cloudflare Workers Builds deploys `main` to production; each PR/branch gets a preview URL.
- CI status checks become required once the test suite exists (ticket #2). See ADR-0003.
