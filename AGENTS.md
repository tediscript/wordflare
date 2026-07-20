## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues (uses the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Using the five default canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Source-control workflow

GitHub Flow. `main` is protected and always deployable; **never push directly to `main`**. Every change (including every agent `/implement` run) starts on a short-lived branch and lands via a pull request:

- Branch from `main`: `feat/<ticket>-<slug>` (or `fix/`, `chore/`, `docs/`). The ticket number in the branch name does **not** auto-link the PR to its issue — a **closing keyword** (`Closes #<ticket>`) in the PR body is what links it (and closes it on merge); a bare `#<ticket>` does not.
- **Maker-checker, two reviews** (named, so they don't read as a contradiction): `/implement` runs its built-in **self-review** (`/code-review`, internal) *before* pushing, then opens a **draft** PR; a *separate, fresh* session runs the **independent audit** (`/code-review` on the PR) and posts findings to a PR comment; `/implement #N --resume` reads that comment and applies the *fix-in-PR* items. Loop until a clean audit. See `README.md` "Working a ticket (the loop)".
- **Termination:** clean audit → un-draft the PR ("ready for review") → a **human** reviews + squash-merges. (Auto-merge is the last trust gate to open.)
- Squash-merge, then delete the branch. The PR's closing keyword (`Closes #<ticket>`) is what auto-links the issue and closes it on merge — keep that line intact through the squash.
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
   - **Exists** → **triage** first — open PR? tests green or red? commits? acceptance criteria met? **any `/code-review` audit findings on the PR?**:
     - **Healthy / recoverable** → **resume**: check it out, pull, and **read the PR's `/code-review` comments** — apply the *fix-in-PR* items from the latest audit (the maker-checker handoff; see `README.md` "Working a ticket"). Non-destructive — just say so.
     - **Broken / unclear** → **do not auto-resume** (inherits a mess) and **do not auto-discard** (lossy). Report the state and ask.
5. **Flags override the triage:** `/implement #N --resume` forces resume; `/implement #N --restart` wipes the branch (closes any open PR — kept as a record — deletes the branch, starts fresh from `main`) without asking.
6. **Draft PR early:** push and open a *draft* PR on the first commit, so an interrupted run leaves recoverable state on GitHub.
