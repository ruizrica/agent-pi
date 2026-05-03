---
name: pi
description: "Unified entry point to Pi operational modes. Invoke as /pi <mode> <task>. Modes: plan, investigate, spec, team, pipeline, chain. Triggers on /pi or when user says 'switch to plan mode', 'investigate this bug', 'use spec mode', 'start a pipeline'."
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
| `investigate` | `set_mode { mode: "INVESTIGATE", reason: "/pi investigate" }` | Clarify the problem -> gather context with scouts -> synthesize findings/hypotheses -> present remediation for approval -> hand off to PIPELINE |
| `spec` | `set_mode { mode: "SPEC", reason: "/pi spec" }` | Initialize spec folder -> shape requirements with clarifying questions -> write design doc -> create tasks -> present via show_spec -> implement |
| `team` | `set_mode { mode: "TEAM", reason: "/pi team" }` | Primary agent dispatches to specialist agents (scout, builder, reviewer, etc.) running in parallel |
| `chain` | `set_mode { mode: "CHAIN", reason: "/pi chain" }` | Sequential pipeline: each step's output becomes $INPUT for the next step |
| `pipeline` | `set_mode { mode: "PIPELINE", reason: "/pi pipeline" }` | Phased orchestration: UNDERSTAND -> GATHER -> PLAN -> EXECUTE -> REVIEW |
| `normal` | `set_mode { mode: "NORMAL", reason: "/pi normal" }` | Return to normal interactive mode |

## Prerequisites

Before calling `set_mode`, check whether the mode requires prior setup:

- **TEAM**: Requires an active team. If no team is loaded, tell the user to run `/agents-team` first to select a team (e.g., "full", "plan-build", "quality").
- **CHAIN**: Requires an active chain. If no chain is active, tell the user to run `/chain` first to select a chain (e.g., "plan-build-review", "investigate-fix", "audit").
- **PIPELINE**: Requires an active pipeline config. If no pipeline is active, tell the user to run `/pipeline` first to select a pipeline.
- **PLAN**, **INVESTIGATE**, **SPEC**, **NORMAL**: No prerequisites — activate immediately.

## After Activation

1. Call `set_mode` with the correct mode and reason.
2. Immediately begin the mode's workflow using the task from the arguments.
3. Do NOT wait for the user to restate the task — you already have it.
4. The `before_agent_start` handler will inject the full mode-specific system prompt on the next agent turn.

## No Subcommand — Help

If no subcommand is given (empty arguments or the first word does not match any subcommand above), display this help:

```
/pi — Pi Agent Modes

Usage: /pi <mode> <task>

Modes:
  plan      Plan-first workflow with approval gates
  investigate Structured bug/problem investigation with scout-led diagnosis
  spec      Kiro spec-driven development (requirements -> design -> tasks)
  team      Multi-agent parallel dispatch to specialists
  chain     Sequential agent pipeline (output feeds next step)
  pipeline  Full phased orchestration (gather -> plan -> execute -> review)
  normal    Return to normal interactive mode

Examples:
  /pi plan implement user authentication
  /pi investigate debug why the approval viewer hangs after submit
  /pi spec design a notification system
  /pi team build the dashboard components
  /pi chain run a security audit
  /pi pipeline redesign the data pipeline
```
