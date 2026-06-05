---
name: sync
description: "Safely update the current Pi work branch against main/master."
argument-hint: "[rebase|merge]"
allowed-tools: ["bash", "ask_user"]
context: inline
---

# /sync — Update Work Branch from Main

Bring the current work branch up to date with `main` or `master`.

## Input

Mode: `$ARGUMENTS`

Default to `rebase` unless the repository convention prefers merge commits.

## Workflow

1. Verify the current directory is inside a git repository.
2. Refuse to run if the working tree is dirty unless the user commits/stashes manually or confirms a safe path.
3. Detect integration branch: `main`, fallback `master`.
4. Fetch configured remotes if available.
5. Update the integration branch.
6. Return to the work branch.
7. Rebase or merge from the integration branch based on the selected mode.
8. If conflicts occur, stop and print conflict files plus recovery steps.
9. Run a lightweight verification if obvious.

## Guardrails

- Do not auto-resolve conflicts.
- Do not force-push.
- Do not delete branches or worktrees.
