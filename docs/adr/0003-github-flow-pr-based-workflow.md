# GitHub Flow: all changes via pull request; main is protected

All work lands on `main` through short-lived feature branches and pull requests — no direct pushes. `main` is branch-protected (a pull request is required, admins included) so the rule holds for humans and agent sessions alike. We chose GitHub Flow over trunk-based direct-to-main because the project is ticket-driven (each tracer-bullet ticket maps to one branch + one PR), and PRs give us a review surface for `/code-review` and a deploy gate; the cost is a little ceremony per change, acceptable for the safety it buys.

## Considered Options

- **GitHub Flow** (chosen) — short-lived `feat/<ticket>-<slug>` branches → PR → squash-merge to `main`.
- **Trunk-based, direct to `main`** — rejected: no review surface, no deploy gate, and agent sessions could push unreviewed code straight to the deployable branch.
- **Git Flow** (develop + release branches) — rejected: too much ceremony for a single-developer project.

## Consequences

- Every change (including agent `/implement` runs) starts on a branch and opens a PR; `main` accepts no direct pushes.
- `main` is always deployable; Cloudflare Workers Builds deploys `main` to production, with a preview URL per branch/PR.
- Branch protection requires a PR with 0 approving reviews (self-merge is allowed for solo work) and applies to admins. As an escape hatch, protection can be disabled temporarily via the GitHub UI or `gh api`.
- CI status checks are **not** required yet; they become required once the test suite exists (ticket #2, the walking skeleton).
