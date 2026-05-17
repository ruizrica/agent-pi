---
name: save
description: "Finalize Pi work: commit related changes, merge the work branch to main, push when configured, and clean up the worktree safely."
argument-hint: "[commit message]"
allowed-tools: '["bash", "read", "ask_user"]'
context: inline
---

# /save — Commit, Merge to Main, Push, and Clean Up

Use `/save` when the current worktree/branch is ready to land on `main`.

This is the only workflow command that should merge to `main` and remove the worktree.

## Input

Commit message: `$ARGUMENTS`

If uncommitted related work exists and no message is provided, derive a message and ask for confirmation.

## Workflow

1. Verify the current directory is inside a git repository.
2. Capture:
   - current worktree path
   - current branch
   - main worktree path from `git worktree list`
   - default integration branch (`main`, fallback `master`)
   - status and uncommitted changes
3. Refuse to run as a merge/cleanup flow if already on `main` unless the user confirms a regular-branch save path.
4. If uncommitted work exists:
   - classify related vs unrelated changes
   - run the `/commit` workflow for related work
   - stop if unrelated dirty changes remain unless the user explicitly excludes them
5. Update the integration branch safely.
6. Merge the current work branch into the integration branch.
7. If conflicts occur:
   - stop
   - report conflicting files
   - preserve the worktree and branch
   - suggest `/handoff` if the user needs to pause; mention an explicit memory-cycle request when native compaction is needed
8. Run post-merge verification when practical.
9. Push if a remote/upstream is configured.
10. After successful merge/push, optionally preserve durable knowledge:
    - add one concise `agent-memory` entry if the work produced a reusable decision, root cause, architecture convention, or workflow pattern
    - run or suggest `agent-memory index` if docs/architecture memories changed significantly
    - treat memory add/index failure as non-fatal and report it
11. Only after merge and push succeed:
    - remove the clean worktree with Git’s normal worktree removal
    - delete the local feature branch only when Git confirms it is merged
    - prune stale worktree metadata
12. Show final status on `main`.

## Guardrails

- Do not force-remove dirty worktrees as the normal path.
- Do not delete an unmerged branch.
- Do not clean up after merge conflicts or push failures.
- Do not silently include unrelated changes.
- Do not store secrets, full diffs, or noisy transient state in `agent-memory`.
- If the user needs to stop mid-save, run `/handoff` to preserve state; explicitly ask it to cycle memory when native compaction is needed.

## Success output

```text
Saved work successfully.
Merged branch: <branch>
Integration branch: <main|master>
Pushed: <yes|no remote configured>
Cleaned worktree: <path>
Next: continue from the main worktree.
```
