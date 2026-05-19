# FEATURES.md — Shipped Feature Inventory

Use this file to preserve a plain-English map of shipped capabilities and where they live.

## Feature Index

| Feature | Status / Date | Entry Points | Verification | Follow-ups |
|---|---|---|---|---|
| Project Memory Pack | Implemented 2026-05-18 | `CLAUDE.md`, `STATE.md`, `journal/`, `BACKLOG.md`, `FEATURES.md`, `commands/setup.md`, `commands/handoff.md`, `skills/pi/SKILL.md`, `scripts/project-memory-hook.sh` | `yarn check:cmd-guidance`, `git diff --check`, hook syntax/dry-run | Consider running `scripts/install-project-memory-hooks.sh` when ready to activate post-commit capture. |

## Project Memory Pack

- **Status:** Implemented 2026-05-18
- **User value:** Gives fresh agents a repo-checked continuity system so setup, checkpoints, handoffs, shipped features, and deferred work are preserved without re-briefing every session.
- **Entry points:** `CLAUDE.md`, `STATE.md`, `journal/`, `BACKLOG.md`, `FEATURES.md`, `/setup`, `/handoff`, `/cycle-context`, `/compact-min`, `/save`, `/commit`, and the project-memory hook scripts.
- **Key decisions:** `/handoff` remains standalone; `/cycle-context` owns Project Memory Pack checkpoint/update-docs behavior and optional native compaction. Routine commits create local raw change summaries only; explicit milestones create durable draft milestone notes under `journal/milestones/` eligible for Obsidian/wiki ingestion after review.
- **Verification:** `yarn check:cmd-guidance`, `git diff --check`, shell syntax checks, routine hook dry-run, and forced milestone dry-run.
- **Follow-ups:** Install/chain hooks with `scripts/install-project-memory-hooks.sh` when the user wants automatic post-commit capture active in the current hooks path.

## Entry Template

```markdown
## <Feature Name>

- **Status:** Shipped YYYY-MM-DD
- **User value:** <What this enables.>
- **Entry points:** <Commands, skills, files, routes, or scripts.>
- **Key decisions:** <Brief rationale and links to journal/ADR/commit.>
- **Verification:** <Commands or manual checks used.>
- **Follow-ups:** <Backlog/task links or none.>
```

## Lifecycle

- Add a feature entry when work ships as a user-visible or agent-visible capability.
- Keep active execution state in cmd, not here.
- Keep in-flight status in `STATE.md`, not here.
- Keep session chronology in `journal/YYYY-MM-DD.md`, not here.
- For large architecture/process milestones, link to `journal/milestones/` and Obsidian/wiki records when reviewed.

## Rules

- Add entries only for shipped user-visible or agent-visible capabilities.
- Keep implementation details high-signal; link to files rather than copying code.
- Do not include secrets, full diffs, or transcript excerpts.
