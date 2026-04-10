---
description: "Unified entry point to Pi operational modes: plan, spec, team, pipeline, chain. Use /pi <mode> <task> to activate a mode and start working."
argument-hint: "<mode> <task> — modes: plan, spec, team, pipeline, chain"
allowed-tools: ["Task", "Read", "Glob", "Grep", "Bash", "Write", "Edit"]
---

# Pi — Unified Mode Entry Point

Parse the user's arguments below. The **first word** is the mode subcommand (case-insensitive). Everything after it is the task.

## User's Arguments

$ARGUMENTS

## Subcommand Dispatch

| Subcommand | What to do |
|------------|------------|
| `plan` | Enter plan mode: spawn Explore agents to gather context, write a structured plan to `.context/todo.md`, present for approval, then implement in phases. Follow a plan-first workflow. |
| `spec` | Enter spec mode: create `.kiro/specs/feature-name/` folder, gather requirements with clarifying questions, write `design.md` with architecture, create `tasks.md`, present the spec for approval, then implement. |
| `team` | Enter team mode: break the task into parallel work streams and spawn multiple specialized agents (gemini-agent for research, cursor-agent for review, codex-agent for implementation, etc.) to work simultaneously. |
| `chain` | Enter chain mode: execute the task as a sequential pipeline. Plan first, then implement, then review — each step's output informs the next. |
| `pipeline` | Enter pipeline mode: run a full phased orchestration — UNDERSTAND the requirements, GATHER context, PLAN the approach, EXECUTE the implementation, REVIEW the results. |

## Execution Rules

1. Parse the first word of `$ARGUMENTS` as the subcommand.
2. If the subcommand matches a mode above, immediately begin that mode's workflow with the remaining text as the task.
3. If no subcommand is given or the first word doesn't match, display the help below.
4. Do NOT ask the user to restate their task — you already have it.
5. For **team** mode: spawn at least 3 agents in parallel in your first response.
6. For **plan** mode: start with Explore agents to gather codebase context before writing the plan.
7. For **spec** mode: start by creating the spec folder structure and asking clarifying questions.
8. For **chain** mode: start with a planning step, then execute sequentially.
9. For **pipeline** mode: start with the UNDERSTAND phase — clarify requirements with the user.

## No Subcommand — Help

If no valid subcommand is found, display:

```
/pi — Pi Agent Modes

Usage: /pi <mode> <task>

Modes:
  plan      Plan-first workflow with approval gates
  spec      Spec-driven development (requirements -> design -> tasks)
  team      Multi-agent parallel dispatch to specialists
  chain     Sequential agent pipeline (output feeds next step)
  pipeline  Full phased orchestration (gather -> plan -> execute -> review)

Examples:
  /pi plan implement user authentication
  /pi spec design a notification system
  /pi team build the dashboard components
  /pi chain run a security audit
  /pi pipeline redesign the data pipeline
```
