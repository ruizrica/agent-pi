---
description: "Manage tasks via the cmd CLI (Commander v2 on cmd backend). Standing rule for when to reach for cmd over TodoWrite, plus pointers to the cmd-plan/cmd-task/cmd-execute workflows."
---

# cmd-tasks — Manage Tasks with the `cmd` CLI

## What it does

Use the `cmd` CLI (Commander v2 — `~/.local/bin/cmd`, sourced from `commander-v2/cli/cmd`) as the **default task manager** when you want commander-style typed comments, agent-identity claims, and a kanban-friendly status surface, while still benefiting from the cmd dependency graph underneath.

`cmd` owns the task backend adapter. Tasks live in the project task store managed by `cmd`, plus sidecar metadata in `.commander/`:

- `id-map.json` — numeric `cmd` task ids ↔ backend record ids
- `claims.json` — full `AgentIdentity` records on every claim/release event
- `comments.json` — typed comments (`progress`, `error`, `attempt`, `handoff`, `info`, `planner_question`, `context_answer`, `research_finding`, `planner_microtask`) with `parentCommentId` threading

To use the JSON-mock backend instead (no backend, no sidecar persistence — useful for tests), set `CMD_BACKEND=mock`.

For multi-agent workflows, three slash commands wrap the cmd CLI:

- **`/cmd-plan <description>`** — scout subagents (Haiku) gather context, planner subagent (Opus) builds CodeRabbit-style microtasks, the result is written via `cmd task add` with `cmd dep add` edges between waves.
- **`/cmd-task <description>`** — single task: scouts + planner, then execute directly with constant `cmd task comment` updates.
- **`/cmd-execute [filter]`** — claim-loop runner over existing cmd tasks. Default filter is `cmd task list --status pending`. Includes Haiku→Sonnet→Opus escalation per task.

Use this skill (`cmd-tasks`) for ad-hoc / lightweight task management directly via `cmd`. Reach for the slash commands when you want the scout/planner/executor pattern.

## When to invoke

Invoke this skill when the user:

- Says "manage tasks via cmd", "use commander", "commander task", "cmd task".
- Wants typed comments (planner_question / context_answer / etc.) — raw backend comments are flat and won't carry types.
- Wants AgentIdentity-rich claim audit — raw backend assignment is a single string; cmd captures runtime, model, sessionId, pid, hostname.
- Has a project where `commander-v2` is checked out and `~/.local/bin/cmd` is symlinked.

Do **not** bypass `cmd` in this project. Use `cmd` for task, dependency, status, comment, and mailbox operations. If `cmd` appears to be missing a needed capability, stop and report the wrapper/Commander gap instead of bypassing the wrapper.

## First-touch checklist

1. **Confirm install:** `which cmd && cmd --version` (should print `cmd 1.0.0` or higher).
2. **Check active project:** `cmd whoami` — shows the resolved project + working dir.
3. **Confirm project initialization:** run `cmd whoami`; if the project is not initialized, run `cmd init`.
4. **Search before creating:** `cmd task list --json | jq '...'` to dedupe.
5. **Check ready queue:** `cmd task list --status pending` to see unblocked work, then `cmd task list --status pending` for everything else.

## Backend selection

```bash
# Default: cmd backend (production)
cmd task list

# Mock backend (in-memory JSON, no backend writes)
CMD_BACKEND=mock cmd task list
```

The mock backend is appropriate when:
- Running tests that should not touch a real cmd project database
- Demoing the CLI without the backend installed
- Debugging cmd-side issues without the backend as a moving part

## Status lifecycle

| cmd status | backend status | Notes |
|---|---|---|
| `pending` | `open` | Default for new tasks |
| `working` / `in-progress` | `in_progress` | Set when an agent starts work |
| `done` / `completed` | `closed` | Terminal — appears in `cmd task list --status done` via JSON parse |
| `failed` | `closed` + label `cmd-status:failed` | backend has no native "failed"; round-trips via label |
| `cancelled` | `closed` + label `cmd-status:cancelled` | Same pattern |
| `backlog` | `open` + label `cmd-status:backlog` | Hidden from default `cmd task list --status pending` if you also add a defer or block |
| `needs_review` | `open` + label `cmd-status:needs_review` | Use when human input is required |
| `blocked` | `blocked` | Native |
| `deferred` | `deferred` | Native |

Statuses with a `cmd-status:*` label round-trip through `cmd task list` correctly because `mapStatusFromBd` honors the label. Do not inspect raw backend status directly; use `cmd task list` for cmd-aware reads.

## v1 boundaries (will be implemented in subsequent passes)

The cmd backend adapter throws `not implemented` for these operations:

- `cmd task delete --status … --yes` (filter-based bulk delete)
- `cmd task delete --all --yes` (cross-project bulk delete)
- `cmd task update --filter-status … --yes` (filter-based bulk update)
- `cmd task import --from tasks.json` (bulk create)

Workaround: set `CMD_BACKEND=mock` for those calls, or loop `cmd task delete <id>` per task.

`cmd advance` (the orchestrator pipeline / planner-executor lifecycle) currently runs through the JSON mock adapter regardless of `CMD_BACKEND`, because its planner/researcher modules still depend on the mock store directly. Migration is tracked separately.

## Quick reference

```bash
# Create
cmd task add "Title" --priority 2 --type task --json   # parse .id and .task_id
cmd task add "..." --parent 5                          # child task; add explicit blockers with cmd dep add when needed

# Find
cmd task list                                          # default to current cwd / project
cmd task list --status pending --json
cmd task list --all --json                             # all projects
cmd task show <id> --json
cmd tree                                               # hierarchy view
cmd context <id>                                       # parent + children + comments + blockers
cmd task list --status pending                                               # unblocked work (cmd-managed, dependency-aware)

# Update
cmd task update <id> --status working                  # cmd → backend in_progress
cmd task update <id> --status done                     # cmd → backend closed
cmd task update <id> --priority 1 --title "New title"

# Lifecycle
cmd task claim <id>                                    # captures full AgentIdentity in .commander/claims.json
cmd task release <id>
cmd task delete <id> --yes

# Comments (typed)
cmd task comment <id> "STARTED: …" --type progress
cmd task comment <id> "FAILED: …" --type error
cmd task comment <id> "What's the deploy target?" --type planner_question
cmd task comment <id> "us-east-1" --type context_answer --parent <prev-comment-id>
cmd task comments <id>

# Dependencies (cmd-managed — cmd dep is mock-only today)
cmd dep add <child-task> <parent-task>                  # default type=blocks
cmd dep list <task>
cmd dep blockers

# Mailbox (agent-to-agent within commander)
cmd mailbox send <to-agent> "<subject>" "<body>"
cmd mailbox inbox
cmd mailbox read <message-id>

# Project / session
cmd project list|show|switch|add|delete
cmd session list|cleanup
cmd whoami
```

## Failure modes to avoid

- **Stale id-map after bypassing `cmd`.** If task storage is modified outside Commander, `.commander/id-map.json` can point at non-existent records. Prefer `cmd task delete <id>` so both sides stay in sync.
- **Mock  in the same project.** Don't flip `CMD_BACKEND` mid-session — the mock state and backend state will drift. Pick one per project.
- **Skipping `cmd init`.** If task storage is not initialized, run `cmd init` first; do not run backend setup commands directly.

## When NOT to use `cmd`

- Inside-this-turn tracking → use TodoWrite.
- Non-Commander backend workflows are out of scope for this project; use `cmd` here.
- Personal scratchpad / journal → use the journal.
- One-line fixes about to be done now → just do them.
