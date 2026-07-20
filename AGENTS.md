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

#### Starting or resuming a ticket

`/implement` commits to the *current* branch, so the agent sets the branch up first. Default behavior when starting `/implement #N`:

1. **Name:** derive `feat/<N>-<slug>` from the issue (slug from its title). One branch per issue.
2. **Clean tree required.** If the working tree is dirty, stop and tell the user — never blindly stash.
3. **Clean baseline:** `git switch main && git pull --ff-only`. Abort if it is not a fast-forward.
4. **Branch decision:**
   - **Does not exist** → create it from `main`, then proceed.
   - **Exists** → **triage** first (open PR? tests green or red? commits? acceptance criteria met?):
     - **Healthy / recoverable** → **resume** (check it out, pull, continue). Non-destructive — just say so.
     - **Broken / unclear** → **do not auto-resume** (inherits a mess) and **do not auto-discard** (lossy). Report the state and ask.
5. **Flags override the triage:** `/implement #N --resume` forces resume; `/implement #N --restart` wipes the branch (closes any open PR — kept as a record — deletes the branch, starts fresh from `main`) without asking.
6. **Draft PR early:** push and open a *draft* PR on the first commit, so an interrupted run leaves recoverable state on GitHub.
