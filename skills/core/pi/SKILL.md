---
name: pi
description: "Unified entry point to Pi operational modes. Invoke as /pi <mode> <task>. Modes: plan, spec, investigate, goal, implement, pipeline, team, chain. Triggers on /pi or when user says 'switch to plan mode', 'use spec mode', 'investigate this bug', 'start goal mode', 'implement pending tasks', 'start a pipeline'."
allowed-tools: [set_mode]
---

<!-- ABOUTME: Unified /pi skill that routes to all Pi operational modes via set_mode. -->
<!-- ABOUTME: Parses appended arguments as <subcommand> <task> and activates the matching mode. -->

# Pi — Unified Mode Entry Point

The text following this skill block is the user's arguments. Parse them as:

```
<subcommand> <task description>
```

The **first word** is the subcommand (case-insensitive). Everything after it is the task.

## Subcommand Dispatch

Read the first word of the user's arguments and call `set_mode` with the matching mode. Then immediately begin the mode's workflow using the rest of the text as the task.

| Subcommand | Action | Workflow |
|------------|--------|----------|
| `plan` | `set_mode { mode: "PLAN", reason: "/pi plan" }` | Scout gather context -> write structured plan -> user approves via show_plan -> implement in phases |
| `spec` | `set_mode { mode: "SPEC", reason: "/pi spec" }` | Initialize spec folder -> shape requirements with clarifying questions -> write design doc -> create tasks -> present via show_spec -> implement |
| `investigate` | `set_mode { mode: "INVESTIGATE", reason: "/pi investigate" }` | Clarify the problem -> gather context with scouts -> synthesize findings/hypotheses -> present remediation for approval -> create Commander/cmd tasks -> hand off to IMPLEMENT |
| `debug` | `set_mode { mode: "DEBUG", reason: "/pi debug" }` | Inspect/establish logging and instrumentation -> confirm relevant log output is visible -> run/build/test/start or attach -> observe with logs/CLI/browser/computer-use -> present debug report/recommendation -> create Commander/cmd tasks -> hand off to IMPLEMENT |
| `goal` / `go` | `set_mode { mode: "GOAL", reason: "/pi goal" }` | Objective-driven loop that continues until an explicit success condition is met |
| `implement` / `impl` | `set_mode { mode: "IMPLEMENT", reason: "/pi implement" }` | Autonomous project-folder task-board lane drain: pending first, then relevant failed/working cleanup |
| `pipeline` | `set_mode { mode: "PIPELINE", reason: "/pi pipeline" }` | Phased orchestration: UNDERSTAND -> GATHER -> PLAN -> EXECUTE -> REVIEW |
| `team` | `set_mode { mode: "TEAM", reason: "/pi team" }` | Primary agent dispatches to specialist agents (scout, builder, reviewer, etc.) running in parallel |
| `chain` | `set_mode { mode: "CHAIN", reason: "/pi chain" }` | Sequential pipeline: each step's output becomes $INPUT for the next step |
| `normal` | `set_mode { mode: "NORMAL", reason: "/pi normal" }` | Return to normal interactive mode |

## Commander CLI Alignment

For plan-driven work, this mode routes into workflows that expect `cmd`-tracked tasks:
- `/pi plan` => plan workflows should usually start with `/commander-plan` and `/commander-plan` task trees.
- `/pi chain` / `/pi team` / `/pi pipeline` with substantial execution => keep progress visible via `cmd task` parent/child tasks.

Recommended one-liners for visibility:

```bash
PI_SESSION=$(cmd task add "Pi /pi $SUBCOMMAND session: $TASK" --type feature --priority high --json | jq -r '.id')
cmd task update "$PI_SESSION" --status in-progress
cmd task comment "$PI_SESSION" "Entered /pi $SUBCOMMAND mode" --type progress
```

At completion:

```bash
cmd task update "$PI_SESSION" --status done
cmd task comment "$PI_SESSION" "Mode complete: $SUBCOMMAND" --type progress
```

## Prerequisites

Before calling `set_mode`, check whether the mode requires prior setup:

- **TEAM**: Requires an active team. If no team is loaded, tell the user to run `/agents team` first to select a team (e.g., "full", "plan-build", "quality").
- **CHAIN**: Requires an active chain. If no chain is active, tell the user to run `/chain` first to select a chain (e.g., "plan-build-review", "investigate-fix", "audit").
- **PIPELINE**: Requires an active pipeline config. If no pipeline is active, tell the user to run `/pipeline` first to select a pipeline.
- **PLAN**, **SPEC**, **INVESTIGATE**, **DEBUG**, **GOAL**, **IMPLEMENT**, **NORMAL**: No prerequisites — activate immediately.

## Memory-First Context

For substantial `plan`, `spec`, `investigate`, `debug`, `implement`, `pipeline`, `team`, and `chain` tasks, use the Project Memory Pack first for human-readable continuity, then use `agent-memory` as a recon accelerator when available:

1. Read project `CLAUDE.md` for standing rules and the update-docs contract.
2. Read `STATE.md` if present for current in-flight status.
3. Read the latest `journal/YYYY-MM-DD.md` entry if present for recent decisions, attempts, and verification.
4. Inspect active plan/spec/task artifacts such as `.context/todo.md` or cmd context.
5. Search prior decisions and context: `agent-memory search "<task/topic>" --json`.
6. If code navigation has been indexed, locate likely files with `agent-memory code-nav "<feature/module/symptom>" --json` or inspect structure with `agent-memory code-tree --json`.
7. Continue gracefully if memory-pack files, `agent-memory`, or the code index are missing; do not block mode activation.
8. Do not run these memory-first steps for trivial commands or `normal` mode.

## After Activation

1. Call `set_mode` with the correct mode and reason.
2. For substantial work, run the memory-first context step above before broad file reconnaissance.
3. Immediately begin the mode's workflow using the task from the arguments.
4. Do NOT wait for the user to restate the task — you already have it.
5. The `before_agent_start` handler will inject the full mode-specific system prompt on the next agent turn.

## No Subcommand — Help

If no subcommand is given (empty arguments or the first word does not match any subcommand above), display this help:

```
/pi — Pi Agent Modes

Usage: /pi <mode> <task>

Modes:
  plan      Plan-first workflow with approval gates
  spec      Kiro spec-driven development (requirements -> design -> tasks)
  investigate Structured bug/problem investigation with scout-led diagnosis
  goal      Objective-driven loop until an explicit success condition is met
  implement Autonomous project-folder task-board lane drain
  pipeline  Full phased orchestration (gather -> plan -> execute -> review)
  team      Multi-agent parallel dispatch to specialists
  chain     Sequential agent pipeline (output feeds next step)
  normal    Return to normal interactive mode

Examples:
  /pi plan implement user authentication
  /pi spec design a notification system
  /pi investigate debug why the approval viewer hangs after submit
  /pi goal keep fixing until all targeted tests pass
  /pi implement process all pending project tasks
  /pi pipeline redesign the data pipeline
  /pi team build the dashboard components
  /pi chain run a security audit
```
