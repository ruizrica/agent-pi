---
name: commit
description: "Commit the current related work to the current branch with safety checks and targeted verification."
argument-hint: "[commit message]"
allowed-tools: ["bash", "read", "ask_user"]
context: inline
---

# /commit — Commit Current Related Work

Create a focused commit for the current task. This command does not merge, push, or remove worktrees.

## Required Capabilities

This command requires an execution context with:

- shell command execution
- filesystem read access
- filesystem write access
- git repository access

If any of these capabilities are unavailable, stop immediately. Do not continue with a manual/chat-only fallback unless the user explicitly asks for one.

Report this exact failure:

```text
/commit requires shell/file/git tools, but this session was launched without them.
Relaunch /commit using a CLI/coding-capable profile.
```

This is a tool-routing failure, not a repository failure.

Tool Preflight

Before starting the workflow, verify that shell/git access is available by running:

```bash
git rev-parse --is-inside-work-tree
```

If the command cannot be executed because tools are unavailable, stop with the missing-capability error above.

If the command executes but returns non-zero, report that the current directory is not inside a Git repository.

## Input

Commit message: `$ARGUMENTS`

If empty, derive a clear message from the changed files and current task, then confirm it with the user.

## Workflow

1. Run the tool preflight and verify the current directory is inside a git repository.
2. Inspect:
   - current branch
   - `git status --short`
   - unstaged diff summary
   - staged diff summary
3. Classify changed files into:
   - clearly related to current work
   - generated/build artifacts
   - possibly unrelated local edits
4. If unrelated or ambiguous changes exist, ask whether to exclude, split, or stop.
5. Run targeted verification appropriate to touched files.
   - Prefer project-specific scripts already documented in the repo.
   - If no obvious test exists, run a lightweight syntax/type/check command when safe.
6. Stage only reviewed related files.
7. Create one focused commit with the confirmed message.
8. Show post-commit status and recent commit hash.
9. If the commit changes durable project state, check whether `/cycle-context` should be run or whether a small Project Memory Pack update is needed:
   - `FEATURES.md` for shipped user-visible or agent-visible capabilities
   - `journal/YYYY-MM-DD.md` for decisions, failed attempts worth preserving, verification, or lessons
   - `BACKLOG.md` for deferred follow-ups not already represented as cmd tasks
   - `journal/milestones/` only for explicit large milestones, not routine commits; generated notes start as draft and must be reviewed before Obsidian/wiki ingestion
10. If the commit establishes a durable decision, project convention, verified root cause, or reusable workflow, optionally add one concise memory with `agent-memory add "..." --source memory --tags "..."`.
   - Skip memory writes for routine commits.
   - Do not block the commit if `agent-memory` is unavailable.

## Commit message guidance

Prefer concise, task-oriented messages:

```text
Add Pi handoff-based compact commands
Port agent-memory command to Pi
Fix worktree save cleanup guard
```

## Guardrails

- Avoid blind `git add .` when unrelated changes are present.
- Do not commit secrets, credentials, local env files, or unrelated generated artifacts.
- If verification fails, stop and report failures unless the user explicitly decides to commit anyway.
- Do not store secrets, full diffs, or transient task state in `agent-memory`.
- Do not merge to `main`; use `/save` for that lifecycle step.
