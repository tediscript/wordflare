---
description: Independent audit — claim the issue, delegate its PR review to the code-review skill, triage findings, post the verdict, flip the label.
argument-hint: "<#issue>"
---
You are running the **independent audit** of the maker-checker loop
(`docs/agents/triage-labels.md`). This is NOT the `/implement` self-review —
this run owns the issue's workflow-state label.

Issue: **$1** (e.g. `2` or `#2`). Strip a leading `#`.

> This prompt owns the **state mechanics** only (claim, checkout PR, triage
> findings into fix-in-PR vs deferred, post the verdict to the PR, flip the
> terminal label). The **review** is delegated to the **code-review** skill —
> `.agents/skills/code-review/SKILL.md` — with fixed point `main`. This is the
> *independent* audit run; `/implement`'s own code-review pass is the internal
> self-review.

## 1. Claim
- Current labels: `gh issue view $1 --json labels --jq '[.labels[].name]'`.
- The issue MUST be at `ready-for-audit`. If it isn't, STOP and report the
  current state — do not flip from any other label.
- Claim it (label-flip CAS):
  `gh issue edit $1 --remove-label ready-for-audit --add-label in-audit`,
  then re-read the labels; if `in-audit` is absent, STOP (a concurrent auditor
  may have won — report it).
- Find the issue's open PR and check it out so the diff is non-empty:
  `gh pr list --state open --json number,headRefName,title` → pick the one whose
  head is `feat/$1-*` (or references #$1); then `gh pr checkout <PR-NUMBER>`.

## 2. Review (delegate to the skill)
- Load and follow the **code-review** skill: `.agents/skills/code-review/SKILL.md`,
  passing **fixed point `main`** (the skill captures `git diff main...HEAD`
  three-dot itself, and emits the `## Standards` / `## Spec` reports).

## 3. Triage findings (this split is what lets the loop terminate)
Sort every finding into:
- **fix-in-PR** — blocking; do before merge (hard-standard breach, spec gap,
  clearly-wrong behavior).
- **deferred** — judgement calls, smells, future-ticket scope; noted, non-blocking.

**"Clean" = no fix-in-PR items — NOT zero findings.** Deferred items are
recorded but never block.

## 4. Close out
- Post the report to the **PR** (the handoff `/implement #$1 --resume` reads —
  NOT the issue):
  `gh pr comment <PR-NUMBER> --body "<report>"`, with sections `## Standards`,
  `## Spec`, and a `## Verdict` block listing fix-in-PR vs deferred.
- Set the issue's terminal label:
  - **No fix-in-PR items (clean):**
    `gh issue edit $1 --remove-label in-audit --add-label ready-for-merge`
  - **Any fix-in-PR items:**
    `gh issue edit $1 --remove-label in-audit --add-label ready-for-agent`
- State the verdict and the new label to the user.
