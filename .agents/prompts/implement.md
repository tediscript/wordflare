---
description: Implement a ticket — claim it, set up or resume its branch, delegate the build to the implement skill (tdd + self-review), push a draft PR, queue for audit.
argument-hint: "<#issue>"
---
You are running **`/implement`** — the implement leg of the maker-checker loop
(`docs/agents/triage-labels.md`; "Starting or resuming a ticket" in `AGENTS.md`).
This run owns the issue's workflow-state label and its branch.

Issue: **$1** (e.g. `2` or `#2`). Strip a leading `#`.

> This prompt owns the **state mechanics** only (claim, branch, draft PR, label
> flips, audit handoff). The **build** is delegated to the **implement** skill —
> `.agents/skills/implement/SKILL.md` — which drives tdd at pre-agreed seams and
> the close-out self-review (`/code-review`). That skill is hidden from
> auto-discovery (`disable-model-invocation: true`), so step 3 loads it explicitly
> by path. Same seam as `/audit`: `/audit` runs the *independent* code-review on
> the PR; the implement skill's code-review is the *internal* self-review.

## 1. Claim (guard first, then flip)
- Clean tree required: `git status --short` must be empty. If it isn't, STOP and
  report — **never** stash or commit someone else's changes.
- Verify the issue is at `ready-for-agent`:
  `gh issue view $1 --json labels --jq '[.labels[].name]'`. If not, STOP and report.
- Claim (label-flip CAS):
  `gh issue edit $1 --remove-label ready-for-agent --add-label in-implement`,
  then re-read the labels; if `in-implement` is absent, STOP (a concurrent
  implementer may have won — report it).

## 2. Baseline + branch (create-and-attach, or resume)
- Clean baseline: `git switch main && git pull --ff-only`. If it is **not** a
  fast-forward, flip the issue back to `ready-for-agent` and STOP.
- Detect an existing branch/PR for this issue — check all of:
  `gh pr list --state all --json number,headRefName,title`,
  `git branch --list 'feat/$1-*'`, `git ls-remote --heads origin 'feat/$1-*'`.
  Match a head/name starting `feat/$1-` or a title/body referencing #$1.
  - **None -> create + attach:** slug from the issue title
    (`gh issue view $1 --json title --jq .title`); `git switch -c feat/$1-<slug>`;
    you'll open the draft PR in step 4.
  - **Exists -> resume:** `git switch feat/$1-<slug>` and pull.

## 3. Implement (delegate the build to the implement skill)
- Load context: `AGENTS.md`, ticket $1 (`gh issue view $1`), spec #1, `docs/adr/`.
- **Resume?** If the branch already saw an audit, first read the PR's latest
  `/code-review` comment and apply its **fix-in-PR** items (the maker-checker
  handoff) before any new work.
- **Delegate the build:** load and follow the **implement** skill by reading
  `.agents/skills/implement/SKILL.md` explicitly (it is hidden from
  auto-discovery, so it will NOT appear in the available-skills list — load it by
  path). The skill owns: tdd at pre-agreed seams, regular typechecking, the full
  test suite, and the close-out `/code-review`. Do not re-drive tdd or code-review
  from this prompt — that is the skill's job.
- **Self-review scope constraint:** the skill's `/code-review` pass is the
  **internal self-review** only — fixed point `main` (`git diff main...HEAD`),
  produce the Standards/Spec report and fix what's actionable, but do **not** flip
  labels or post a PR comment; that's `/audit`'s job.

## 4. Finish — queue for audit
- Push the branch; ensure a **draft** PR is open referencing #$1 in the body so it
  auto-links (`gh pr create --draft ...`). Push early for recoverability.
- Flip the issue to the audit queue:
  `gh issue edit $1 --remove-label in-implement --add-label ready-for-audit`
- Report what was built, the draft PR URL, and the new label.
