---
description: "Dispatch Pi agents as subprocesses via the pi-agent-orchestrator bridge. Use /pi <mode> <task> to run plan, spec, team, chain, or pipeline workflows."
argument-hint: "<mode> <task> — modes: plan, spec, team, chain, pipeline"
allowed-tools: ["Bash", "Read", "Write"]
---

# Pi — Agent Subprocess Dispatcher

Dispatch Pi agents as subprocesses using the `pi-agent-orchestrator` bridge at `scripts/pi-agent-orchestrator.mjs`. This spawns real `pi` CLI processes with the correct agent definitions, models, and system prompts from `agents/`.

## User's Arguments

$ARGUMENTS

## How to Execute

Parse the first word of the arguments above as the subcommand (case-insensitive). Everything after it is the task.

### Step 1: Inspect (always run first)

```bash
node scripts/pi-agent-orchestrator.mjs inspect
```

Verify auth is present and agents are available. If inspect fails, tell the user.

### Step 2: Dispatch based on subcommand

| Subcommand | Bridge execution |
|------------|-----------------|
| `plan` | Run chain `plan-build-review`: scouts context, plans, builds, reviews |
| `spec` | Sequential dispatch: scout explores, then planner writes spec |
| `team` | Batch: write a JSON spec, then run batch with parallel agents |
| `chain` | Run a named chain (default: `plan-build-review`) |
| `pipeline` | Run chain `full-pipeline`: scout → plan → build → review → test |

#### plan — Plan-Build-Review Chain

```bash
node scripts/pi-agent-orchestrator.mjs chain \
  --chain plan-build-review \
  --task "<task>" \
  --approved true \
  --execute
```

#### spec — Scout then Planner

Step 1: Dispatch scout for context gathering:
```bash
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent scout \
  --task "Explore the codebase and gather context for: <task>" \
  --execute
```

Step 2: Use scout output to dispatch planner for spec writing:
```bash
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent planner \
  --task "Write a detailed spec based on this context:\n\n<scout output>\n\nOriginal request: <task>" \
  --execute
```

#### team — Parallel Batch

Step 1: Write a batch spec to `.context/pi-batch.json`:
```json
[
  { "name": "scout", "task": "Map the codebase structure relevant to: <task>" },
  { "name": "planner", "task": "Draft an implementation plan for: <task>" },
  { "name": "builder", "task": "Implement the core changes for: <task>" },
  { "name": "reviewer", "task": "Review the approach and identify risks for: <task>" }
]
```

Step 2: Execute the batch:
```bash
node scripts/pi-agent-orchestrator.mjs batch \
  --spec .context/pi-batch.json \
  --approved true \
  --execute
```

#### chain — Named Chain

If the user specifies a chain name (e.g., `/pi chain audit <task>`), use that chain. Otherwise default to `plan-build-review`.

Available chains can be seen from the inspect output. Common ones:
- `plan-build-review` — standard dev cycle
- `investigate-fix` — bug investigation and fix
- `audit` — security audit
- `full-pipeline` — end-to-end with testing
- `test-fix` — test-driven fix cycle

```bash
node scripts/pi-agent-orchestrator.mjs chain \
  --chain <chain-name> \
  --task "<task>" \
  --approved true \
  --execute
```

#### pipeline — Full Pipeline Chain

```bash
node scripts/pi-agent-orchestrator.mjs chain \
  --chain full-pipeline \
  --task "<task>" \
  --approved true \
  --execute
```

### Step 3: Summarize Results

The bridge returns JSON. Parse it and summarize:
- For each agent step: agent name, model used, whether it succeeded
- Key output/findings from each agent
- Any failures with stderr details
- Overall success/failure status

## No Subcommand — Help

If no valid subcommand is found, display:

```text
/pi — Pi Agent Dispatcher

Usage: /pi <mode> <task>

Modes:
  plan      Plan-build-review chain (planner → builder → reviewer)
  spec      Scout context then planner writes spec
  team      Parallel batch dispatch (scout + planner + builder + reviewer)
  chain     Run a named agent chain (default: plan-build-review)
  pipeline  Full pipeline chain (scout → plan → build → review → test)

Examples:
  /pi plan implement user authentication
  /pi spec design a notification system
  /pi team build the dashboard components
  /pi chain audit review the security posture
  /pi pipeline redesign the data pipeline
```

## Important

- The bridge script lives at `scripts/pi-agent-orchestrator.mjs`
- The bridge automatically reads agent definitions from the agent-pi repo's `agents/` directory
- All agents run as **separate `pi` CLI subprocesses** — they are NOT Claude Code agents
- Each agent has its own model (scout uses Grok, builder uses Haiku, reviewer uses Opus, etc.)
- Bridge output is JSON — always parse and summarize it for the user
- The bridge works from **any working directory** — it resolves paths relative to its own location
