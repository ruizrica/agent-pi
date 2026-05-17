---
name: abort-worktree
description: "Stop a Pi worktree workflow without merging, preserving dirty work by default."
argument-hint: "[reason]"
allowed-tools: '["bash", "ask_user", "read", "write"]'
context: inline
---

# /abort-worktree — Stop Without Merging

Use this when the current worktree should not be saved to `main`.

## Input

Reason: `$ARGUMENTS`

## Workflow

1. Verify the current directory is inside a git repository and detect whether it is a linked worktree.
2. Inspect current branch and short status.
3. If dirty:
   - preserve by default
   - write or update a handoff describing why the work is being aborted
   - print the branch/path for later recovery
4. If clean:
   - ask before removing the worktree
   - ask before deleting the local branch
5. Never merge to `main`.

## Guardrails

- Do not force-remove dirty worktrees.
- Do not delete unmerged branches without explicit confirmation.
- Prefer `/handoff` or `/compact` before abandoning substantial work.
