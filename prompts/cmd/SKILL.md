---
name: cmd-skill
description: Routes Commander v2 (`cmd` CLI on backend) workflows — multi-task planning (`cmd-plan`), single-task plan+execute (`cmd-task`), claim-loop execution (`cmd-execute`), and ad-hoc `cmd task` usage. Use when the user mentions cmd-plan, cmd-task, cmd-execute, cmd-tasks, Commander, cmd task list --status pending, claim-loop, or managing tasks through `cmd` instead of in-chat todos.
disable-model-invocation: false
---

# Commander `cmd` workflows (Pi)

## Pick a workflow

| User intent | Follow |
|-------------|--------|
| Decompose a feature into many cmd-managed tasks, wire wave deps with `cmd dep add`, optionally run parallel execution later | [cmd-plan.md](cmd-plan.md) |
| One task — scouts + planner, then implement on a single `cmd task` with comment trail | [cmd-task.md](cmd-task.md) |
| Run the claim-loop on **existing** tasks (`cmd task list --status pending`, `cmd task claim`, complete/fail) | [cmd-execute.md](cmd-execute.md) |
| Ad-hoc listing, comments, status, mailbox — no full scout/plan pipeline | [cmd-tasks.md](cmd-tasks.md) |

Treat **`/cmd-plan`**, **`/cmd-task`**, **`/cmd-execute`** as shorthand for “open the matching markdown and execute that protocol verbatim.” User text after the command is the plan/task description or filter (`$ARGUMENTS` in those docs).

## Canonical CLI primers (host install)

Run from a shell for the live, versioned contract:

- `cmd guide plan` — root vs child tasks, `--mission-brief`, `--runtime`, `--model`, decomposition rules
- `cmd guide implement` — `cmd context`, claim, comments, done
- `cmd guide overview` — full reference

## Preconditions (all workflows)

1. `cmd` on PATH (e.g. `~/.local/bin/cmd`)
2. `cmd` wrapper on PATH; backend access stays behind the wrapper
3. `cmd init` has been run for the project if needed
4. Prefer **`cmd dep add`** for real dependency edges; avoid relying on **`cmd dep add`** for backend persistence (see [cmd-tasks.md](cmd-tasks.md))

## Invocation note

The long-form playbooks live in the sibling files linked above — read the one that matches the workflow before spawning subagents or running bulk `cmd task add`.
