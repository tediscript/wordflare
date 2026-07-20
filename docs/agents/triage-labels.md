# Triage & workflow labels

This repo uses two complementary label sets on GitHub issues:

- **Triage labels** — intake. *What does this issue need next?*
- **Workflow-state labels** — the maker-checker loop. *Where is this issue in the build → audit → merge cycle?* (See [#12](https://github.com/tediscript/wordflare/issues/12) for the loop itself.)

Both live in the same GitHub label space.

## Triage labels

The skills speak in terms of five canonical triage roles. This table maps those roles to the actual label strings used in this repo.

| Canonical role (mattpocock/skills) | Our label         | Meaning                                  |
| ---------------------------------- | ----------------- | ---------------------------------------- |
| `needs-triage`                     | `needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`                       | `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent`                  | `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human`                  | `ready-for-human` | Requires **human implementation**        |
| `wontfix`                          | `wontfix`         | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

> **`ready-for-human` is triage-only.** It means "a human must *implement* this." It does **not** mean "agent done, human merges" — that is [`ready-for-merge`](#workflow-state-labels-maker-checker-loop). The two never collide.

## Workflow-state labels (maker-checker loop)

These labels track an issue through the `/implement` → `/code-review` (audit) → merge loop documented in [#12](https://github.com/tediscript/wordflare/issues/12). `ready-for-agent` is the seam: triage lands an issue there, and the workflow consumes it from there.

### The state machine

```
Forward flow (queues and active states alternate):
  ready-for-agent → in-implement → ready-for-audit → in-audit → ready-for-merge → merge
     (queue)         (active)       (queue)          (active)     (queue/human)

Return edges (both re-queue for implement; never jump to an active state):
  • in-audit        → ready-for-agent   [audit found issues]
  • ready-for-merge → ready-for-agent   [human review requests changes]
```

### What each label means

- **`ready-for-agent`** — the implement **queue**. Two modes, told apart by the **assignee**:
  - _unassigned_ (fresh from triage) → a **human tags the implementer once** (the delegation);
  - _assigned_ (return after a failed audit/review) → that same implementer **auto-resumes**, no re-tag.
- **`in-implement`** — an agent has claimed it and is building (driving `/tdd` + the built-in self-review). Set **only** by the claiming agent.
- **`ready-for-audit`** — implement is done (draft PR + self-review complete); queued for an independent audit. **Auto-picked by the standing audit pool** — no per-issue mention (auditing is a pre-delegated standing role).
- **`in-audit`** — a fresh-session `/code-review` from the standing audit pool has claimed it (label-flip CAS) and is independently auditing (maker-checker; [#12](https://github.com/tediscript/wordflare/issues/12)). Set **only** by the claiming audit agent.
- **`ready-for-merge`** — the audit came back clean; **queued for a human to review + merge** (not auto-merge). Sending it back re-queues at `ready-for-agent`.

### The core invariant

> **`ready-for-*`** = a _queue_ / dispatch target.
> **`in-*`** = an agent is _actively working_, set **only** by the agent that claims it (never by whoever is returning the work).
>
> So **every return targets a queue.** No one but the claimant ever sets an `in-*` label.

This is why `ready-for-audit` exists: an `in-*` active state can't be set by the implementer, only by the agent that claims it — so implement-done needs a _queue_ (`ready-for-audit`) before audit starts. It completes the `ready-for-*` / `in-*` alternation.

### Dispatch model (who picks up what)

The two agent roles are delegated differently — an asymmetry that matters:

- **Implementer — per-issue, tagged once.** The human chooses _which_ agent implements _this_ issue, by tagging/assigning it on first entry. The assignment **persists** through the loop, so returns to `ready-for-agent` auto-resume under the same implementer — no re-tag, no re-trigger.
- **Auditor — standing role, auto-pick.** Auditing is pre-delegated to a standing pool; no agent is ever mentioned per-issue. Any `ready-for-audit` item is auto-claimed (label-flip CAS) by the pool. Independence is the point — hand-picking an auditor would defeat maker-checker.

Net: the only per-issue human delegation is the **first implementer tag**. Everything else flows automatically until `ready-for-merge`.

### Trust gates the automation, not the labels

The labels are stable. What changes with trust is _which gates still have a human in them_. The middle is **already auto** today; the human gates are the two boundaries:

|                                              | First implement claim (`ready-for-agent`, unassigned) | Middle (`ready-for-audit` ↔ resume)                                              | Merge (`ready-for-merge`)   |
| -------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| **Now (low trust)**                          | human tags the implementer (once)                     | auto: standing auditor auto-picks; assigned implementer auto-resumes             | human reviews + merges      |
| **Later (earned)**                           | auto-dispatch — any implement-agent grabs it          | (unchanged — already auto)                                                       | auto-merge (last gate open) |

### Claim atomicity (when auto-trigger is on)

Once auto-trigger is on, several agents may race for the same queue item. The **label flip is the compare-and-swap (CAS)** — the single write that turns a claim attempt into an exclusive claim:

1. **Read** — the item sits in a `ready-for-*` queue, and (for implement) the assignee is the resuming implementer / (for audit) it is unclaimed by the pool.
2. **CAS** — atomically flip `ready-for-* → in-*`. Exactly one writer wins; GitHub's single-label-space update serializes it.
3. **Record** — the **assignee** field records _who_ claimed it (implement) / the audit session records itself (audit).
4. **Re-check** — immediately re-read the labels. The **loser** sees the flip already happened and **bails**; the winner is whichever flip stuck.

Humans don't need CAS — they assign by hand.

### Return edges (explicit, so issues don't stall mid-loop)

- **`in-audit → ready-for-agent`** — audit found issues; the assigned implementer re-resumes.
- **`ready-for-merge → ready-for-agent`** — human review requested changes; the assigned implementer re-resumes.

Both target the `ready-for-agent` **queue** (never an `in-*` active state), because only the claiming agent sets an active state. Returns do **not** re-tag — the assignee already records the implementer.

### Measurable trust

Track the rate of **`ready-for-merge → merge`** vs **`ready-for-merge → ready-for-agent`** (human sent it back). That ratio is the "is the audit trustworthy yet?" signal that tells us when to open the auto-merge gate.

## Design notes

- **`ready-for-human` stays triage-only** ("a human must _implement_ this"). No collision with `ready-for-merge` ("agent _did_ implement; awaiting merge").
- **`in-tdd` rejected** — too granular; no pool polls for "mid red-green."
- **`in-implement`** over `in-dev`/`in-progress` — names the skill.
- **`in-audit`** over `in-review` — avoids GitHub's "PR review" connotation.
- **`ready-for-audit` added** — implement-done needs a queue before audit starts. Completes the `ready-for-*` / `in-*` alternation.
- **No `agent-*` prefix** — matches the existing unprefixed set; `in-*` = active, `ready-for-*` = queue/dispatch target.
