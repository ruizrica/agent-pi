---
description: "Manage tasks via the cmd CLI (Commander v2 on bd backend). Standing rule for when to reach for cmd over TodoWrite, plus pointers to the cmd-plan/cmd-task/cmd-execute workflows."
---

# cmd-tasks — Manage Tasks with the `cmd` CLI

## What it does

Use the `cmd` CLI (Commander v2 — `~/.local/bin/cmd`, sourced from `commander-v2/cli/cmd`) as the **default task manager** when you want commander-style typed comments, agent-identity claims, and a kanban-friendly status surface, while still benefiting from the bd dependency graph underneath.

`cmd` writes through a bd-backed adapter by default (see `commander-v2/host/modules/tasks/adapter.bd/`). Tasks live in the same `.beads/<project>.db` you'd see with raw `bd`, plus two sidecar files in `.commander/`:

- `id-map.json` — numeric `cmd` task ids ↔ bd bead ids
- `claims.json` — full `AgentIdentity` records on every claim/release event
- `comments.json` — typed comments (`progress`, `error`, `attempt`, `handoff`, `info`, `planner_question`, `context_answer`, `research_finding`, `planner_microtask`) with `parentCommentId` threading

To use the JSON-mock backend instead (no bd, no sidecar persistence — useful for tests), set `CMD_BACKEND=mock`.

For multi-agent workflows, three slash commands wrap the cmd CLI:

- **`/cmd-plan <description>`** — scout subagents (Haiku) gather context, planner subagent (Opus) builds CodeRabbit-style microtasks, the result is written via `cmd task add` with `bd dep add` edges between waves.
- **`/cmd-task <description>`** — single task: scouts + planner, then execute directly with constant `cmd task comment` updates.
- **`/cmd-execute [filter]`** — claim-loop runner over existing cmd/bd tasks. Default filter is `bd ready`. Includes Haiku→Sonnet→Opus escalation per task.

Use this skill (`cmd-tasks`) for ad-hoc / lightweight task management directly via `cmd`. Reach for the slash commands when you want the scout/planner/executor pattern.

## When to invoke

Invoke this skill when the user:

- Says "manage tasks via cmd", "use commander", "commander task", "cmd task".
- Wants typed comments (planner_question / context_answer / etc.) — bd's native `bd comment` is flat and won't carry types.
- Wants AgentIdentity-rich claim audit — bd's `--assignee` is a single string; cmd captures runtime, model, sessionId, pid, hostname.
- Has a project where `commander-v2` is checked out and `~/.local/bin/cmd` is symlinked.

Use **bd directly** (`bd-tasks` skill) when:

- You want bare bd primitives without commander's typed-comment / claim-identity layer.
- You want bd-native `bd dolt push` sync without commander's id-map sidecar implications.
- You're in a project that doesn't have commander-v2 wired up.

## First-touch checklist

1. **Confirm install:** `which cmd && cmd --version` (should print `cmd 1.0.0` or higher).
2. **Confirm bd is on PATH** (cmd's bd backend shells out to it): `which bd && bd --version`.
3. **Check active project:** `cmd whoami` — shows the resolved project + working dir.
4. **Confirm a bd database exists:** `ls .beads/` — if missing, `bd init` first (or use cmd's auto-init: any `cmd task add` with a `.commander/mock-state.json` present will run `bd init` as part of one-shot migration).
5. **Search before creating:** `cmd task list --json | jq '...'` to dedupe.
6. **Check ready queue:** `bd ready` to see unblocked work, then `cmd task list --status pending` for everything else.

## Backend selection

```bash
# Default: bd backend (production)
cmd task list

# Mock backend (in-memory JSON, no bd writes)
CMD_BACKEND=mock cmd task list
```

The mock backend is appropriate when:
- Running tests that should not touch a real bd database
- Demoing the CLI without `bd` installed
- Debugging cmd-side issues without bd as a moving part

## Status lifecycle

| cmd status | bd status | Notes |
|---|---|---|
| `pending` | `open` | Default for new tasks |
| `working` / `in-progress` | `in_progress` | Set when an agent starts work |
| `done` / `completed` | `closed` | Terminal — appears in `cmd task list --status done` via JSON parse |
| `failed` | `closed` + label `cmd-status:failed` | bd has no native "failed"; round-trips via label |
| `cancelled` | `closed` + label `cmd-status:cancelled` | Same pattern |
| `backlog` | `open` + label `cmd-status:backlog` | Hidden from default `bd ready` if you also add a defer or block |
| `needs_review` | `open` + label `cmd-status:needs_review` | Use when human input is required |
| `blocked` | `blocked` | Native |
| `deferred` | `deferred` | Native |

Statuses with a `cmd-status:*` label round-trip through `cmd task list` correctly because `mapStatusFromBd` honors the label. They will not show as the same status if you read directly via `bd list --status` — use `cmd task list` for cmd-aware reads.

## v1 boundaries (will be implemented in subsequent passes)

The bd adapter throws `not implemented` for these operations:

- `cmd task delete --status … --yes` (filter-based bulk delete)
- `cmd task delete --all --yes` (cross-project bulk delete)
- `cmd task update --filter-status … --yes` (filter-based bulk update)
- `cmd task import --from tasks.json` (bulk create)

Workaround: set `CMD_BACKEND=mock` for those calls, or loop `cmd task delete <id>` per task.

`cmd advance` (the orchestrator pipeline / planner-executor lifecycle) currently runs through the JSON mock adapter regardless of `CMD_BACKEND`, because its planner/researcher modules still depend on the mock store directly. Migration is tracked separately.

## Quick reference

```bash
# Create
cmd task add "Title" --priority 2 --type task --json   # parse .id and .bead_id
cmd task add "..." --parent 5                          # Note: parent flag is no-op on bd backend; use bd dep add instead

# Find
cmd task list                                          # default to current cwd / project
cmd task list --status pending --json
cmd task list --all --json                             # all projects
cmd task show <id> --json
cmd tree                                               # hierarchy view
cmd context <id>                                       # parent + children + comments + blockers
bd ready                                               # unblocked work (bd-native, dependency-aware)

# Update
cmd task update <id> --status working                  # cmd → bd in_progress
cmd task update <id> --status done                     # cmd → bd closed
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

# Dependencies (bd-native — cmd dep is mock-only today)
bd dep add <child-bead> <parent-bead>                  # default type=blocks
bd dep tree <bead>
bd dep cycles

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

- **Stale id-map after manual bd manipulation.** If you delete a bead via `bd delete` directly, `.commander/id-map.json` keeps the old numeric id pointing at a non-existent bead. `cmd task get <id>` returns null gracefully, but it's noisy. Prefer `cmd task delete <id>` so both sides stay in sync.
- **Mock + bd in the same project.** Don't flip `CMD_BACKEND` mid-session — the mock state and bd state will drift. Pick one per project.
- **`cmd dep add` instead of `bd dep add`.** The cmd-side dep bridge is still mock-only and won't persist into bd. Always use `bd dep add` for real dependency edges.
- **Skipping `bd init`.** `cmd task add` in a fresh dir with no `.beads/` and no migration trigger fails with "no beads database found". Run `bd init` (or `cmd init` once it does) first.

## When NOT to use `cmd`

- Inside-this-turn tracking → use TodoWrite.
- Pure bd workflows (no commander UI / no typed comments) → use the `bd-tasks` skill.
- Personal scratchpad / journal → use the journal.
- One-line fixes about to be done now → just do them.
