# STATE.md — Current In-Flight State

Keep this file short and current. It is the fastest human-readable restore point for a fresh agent, not a transcript or history log.

## Current Focus

- **Task:** Implement approved memory-system coherence remediation.
- **Status:** Implementation and verification complete; final summary/reporting in progress.
- **Branch/worktree:** Current repository worktree.
- **Active plan:** `.context/todo.md` approved remediation plan.
- **Active task IDs:** Local tasks #1-#5; Commander sync mapped some tasks (#1245-#1247, #1241) with transient sync retries.

## Last Completed Step

- Restored `/handoff` to standalone pointer-based handoff behavior.
- Added `/cycle-context` as the Project Memory Pack checkpoint/update-docs and optional native compaction flow.
- Reframed `commands/handoff-memory-cycle.md` as compatibility guidance for `/cycle-context`.
- Aligned `/setup`, `/dream`, `/compact-min`, `/save`, `/commit`, `/agent-memory`, handoff skill, and complex-problem-loop guidance to the same ownership model.
- Added canonical memory ownership/lifecycle rules in `CLAUDE.md`, `BACKLOG.md`, `FEATURES.md`, and milestone docs.
- Updated `scripts/project-memory-hook.sh` so `dry-run` is non-writing and milestone notes start with draft/readiness metadata.
- Ran syntax checks, command guidance check, diff whitespace check, and hook dry-run previews successfully.

## Next Step

- Review final diff and decide whether to commit only memory-system related files, excluding unrelated extension changes already present in the worktree.

## Blockers / Open Questions

- Existing unrelated modifications under `extensions/` remain in the worktree and were not part of this implementation.

## Key Files

- `CLAUDE.md`
- `commands/handoff.md`
- `commands/cycle-context.md`
- `commands/handoff-memory-cycle.md`
- `commands/setup.md`
- `commands/dream.md`
- `commands/compact-min.md`
- `commands/save.md`
- `commands/commit.md`
- `commands/agent-memory.md`
- `skills/handoff/SKILL.md`
- `skills/complex-problem-loop/SKILL.md`
- `scripts/project-memory-hook.sh`
- `scripts/install-project-memory-hooks.sh`
- `journal/milestones/README.md`
- `BACKLOG.md`
- `FEATURES.md`

## Update Rules

- Replace stale state instead of appending history.
- Link to journal entries, plans, tasks, commits, or handoffs for historical detail.
- Do not include secrets, full diffs, noisy logs, or transcripts.
