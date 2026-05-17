---
name: setup
description: "Set up a Pi work session in an isolated git worktree and prepare the agent to work."
argument-hint: "[task name or branch slug]"
allowed-tools: '["bash", "read", "ask_user"]'
context: inline
---

# /setup — Pi Worktree Setup

Create or reuse an isolated worktree for the current Pi task, then orient the agent before any implementation.

## Input

Task or branch slug: `$ARGUMENTS`

If empty, derive a timestamped slug such as `wip-YYYYMMDD-HHMMSS`.

## Workflow

1. Verify the current directory is inside a git repository.
2. Identify the repository root, current branch, default base branch (`main` preferred, then `master`), and current status.
3. If the current tree has uncommitted changes, stop and ask whether to continue, commit first, or create the worktree from the current state.
4. Derive:
   - branch: `work/<slug>` or `wip/<timestamp>`
   - path: `.pi/worktrees/<slug>` relative to the repo root unless the user gave an explicit path
5. If the target path or branch already exists:
   - clean existing worktree: allow reuse after confirmation
   - dirty existing worktree: stop and ask before reuse
6. Create the worktree with `git worktree add` using the base branch as the starting point.
7. Print:
   - worktree path
   - branch name
   - exact `cd <path>` instruction
   - current status
   - suggested next Pi mode, usually `/pi plan <task>`

## Preparation checks

After creation, inspect the worktree for common project setup files:

- `package.json`
- `pyproject.toml` / `requirements.txt`
- `go.mod`
- `Cargo.toml`

Report likely install/test commands, but ask before running expensive dependency installation.

## Agent-memory bootstrap

Include `agent-memory` as part of setup when it is available:

1. Check whether `agent-memory` is on PATH.
   - If missing, report that memory search/code navigation is unavailable and point the user to the trusted local/bundled installer for their Pi setup.
   - Do not run remote shell installers.
2. If present, run a quick status check such as `agent-memory status --json` when Pi needs to parse it, or `agent-memory status` for human output.
3. If memories have never been indexed or the user asks for refresh, run `agent-memory index`.
4. For code/file-tree navigation, offer to run `agent-memory code-index <worktree-path>`.
   - Ask before indexing very large repositories.
   - Skip obvious vendor/build/generated folders where the CLI supports ignores or scope narrowing.
5. Print useful next commands:
   - `/agent-memory search "<task or feature>"`
   - `agent-memory code-tree --json`
   - `agent-memory code-nav "<feature area>" --json`

Use `agent-memory` for durable decisions and code navigation; Pi native memory-cycle remains responsible for compaction/session-state logs.

## Guardrails

- Do not overwrite dirty worktrees.
- Do not delete branches or worktrees in `/setup` except for rollback of a failed creation that produced no user work.
- Do not start implementation immediately; switch to the appropriate Pi mode or plan workflow first.
- Do not index secrets, credentials, private env files, or huge generated/vendor trees when avoidable.
