---
name: cmd-task-tracking
description: "Default task-tracking policy for Pi agents. Whenever a Pi agent needs to track work — creating tasks, claiming, updating status, logging progress, completing, breaking a request into steps, or persisting a multi-step plan — it MUST use the `cmd` (Commander v2) CLI if available. Triggers on: 'track this', 'add a task', 'create a todo', 'list tasks', 'pick up work', 'claim', 'start', 'resume', 'complete', 'finish', or any moment the agent would otherwise reach for an inline TODO list. If `cmd` is not on PATH, the agent falls back to its native tracking quietly."
license: MIT
allowed-tools: Bash(cmd:*) Bash(command:*) Bash(which:*)
metadata:
  category: task-tracking
  applies-to: pi-agents
  scope: default
---

<!-- ABOUTME: Default task-tracking policy for Pi agents — use `cmd` (Commander v2) CLI for all task tracking if available, fall back silently otherwise. -->
<!-- ABOUTME: Activated by description-matching whenever task-tracking intent appears in the agent's turn. -->

# cmd Task Tracking — Default Pi Agent Policy

This skill is the **default task-tracking contract for Pi agents** in this repository.

> **Rule:** If `cmd` is available on PATH, it is the single source of truth for task state. Never use inline markdown checklists, ad-hoc TODO files, `TodoWrite`, or `TaskCreate` while `cmd` is reachable.

## Step 1 — Availability Gate

Before tracking anything, run the gate:

```bash
if command -v cmd >/dev/null 2>&1; then
  echo "cmd available"
else
  echo "cmd not available"
fi
```

- **`cmd available`** → follow the `cmd` Workflow below.
- **`cmd not available`** → fall back to whatever native tracking the agent uses (do **not** mention `cmd` to the user — fail quietly).

Do not assume availability across sessions. Re-probe at the start of each Pi agent turn that needs tracking.

## Step 2 — `cmd` Workflow (when available)

### Open the work

```bash
TASK_ID=$(cmd task add "<concise title of the work>" \
  --type feature \
  --priority high \
  --json | jq -r '.id')

cmd task update "$TASK_ID" --status in-progress
```

Use the **first sentence of the user request** (or the planner-supplied title) as the task title. Set `--type` to one of `feature`, `task`, `bug`, `chore`. Set `--priority` to `critical`, `high`, `medium`, or `low` — never the numeric form.

### Log progress

At every milestone (file written, test green, decision made, blocker hit):

```bash
cmd task comment "$TASK_ID" "<one-line progress note>" --type progress
```

Use comment types: `progress`, `decision`, `blocker`, `result`.

### Spawn subtasks (multi-phase work only)

```bash
SUB=$(cmd task add "<phase title>" \
  --parent "$TASK_ID" \
  --type task \
  --priority high \
  --json | jq -r '.id')
```

Only create subtasks when a phase has its own non-trivial deliverable. Don't shred a 10-minute fix into five subtasks.

### Close the work

```bash
cmd task update "$TASK_ID" --status done
cmd task comment "$TASK_ID" "<one-line outcome summary>" --type result
```

If the work failed or was cancelled, use `--status failed` or `--status cancelled` with a `--type blocker` comment that explains why.

## Step 3 — What to NEVER Do

- **Never** write an inline TODO list in the conversation when `cmd` is available.
- **Never** create `.context/todo.md` or `TODO.md` files alongside `cmd` — pick one tracker, not both.
- **Never** use `TodoWrite` / `TaskCreate` (those belong to Claude Code's native flow, not Pi).
- **Never** mention `cmd` to the user when `cmd` is unavailable — silently use the fallback.

## Step 4 — Multi-Agent Lineage (when relevant)

If a Pi mode (`/pi team`, `/pi chain`, `/pi pipeline`) spawns subagents, the orchestrator creates a **parent session task** and passes its ID to each subagent via the task prompt:

```bash
SESSION_ID=$(cmd task add "Pi session: <goal>" --type feature --priority high --json | jq -r '.id')
# ... pass SESSION_ID to each subagent as parent
```

Subagents create their own child task under `--parent "$SESSION_ID"` and report back with `cmd task comment "$SESSION_ID" "..." --type progress --agent <name>` so the kanban board attributes work to the correct agent. See `COMMANDER_AGENTS.md` for the full identity model.

## Step 5 — Source of Truth

This skill encodes the policy. The `cmd` CLI itself is the live source of truth — when the schema, status names, or commands evolve, defer to:

```bash
cmd guide overview          # full command reference
cmd guide agent             # agent-facing instructions
cmd whoami                  # confirm agent identity on the board
```

If `cmd guide agent` output ever conflicts with this skill, **the CLI wins**. Update this skill afterward.

## Related

- `COMMANDER_AGENTS.md` — full Commander v2 contract and identity model
- `skills/pi/SKILL.md` — `/pi` mode dispatcher (already references `cmd` for plan sessions)
- `skills/pi-agent-orchestrator/SKILL.md` — Cloud-Code-to-Pi bridge with optional `cmd` lineage
