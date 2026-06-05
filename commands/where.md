---
name: where
description: "Show current Pi git/worktree/session orientation without changing anything."
argument-hint: ""
allowed-tools: ["bash", "read"]
context: inline
---

# /where — Pi Work Session Orientation

Read-only status command for risky workflow moments.

## Report

Show:

- repository root
- current working directory
- current branch
- upstream branch if configured
- whether this is a linked worktree
- `main`/`master` worktree path if present
- short git status
- recent commits
- active `.context/todo.md` or `.context/session-state.json` if present
- suggested next command: `/setup`, `/commit`, `/save`, `/handoff`, or `/pi plan`

## Guardrails

- Do not modify files.
- Do not fetch, pull, merge, commit, or clean anything.
