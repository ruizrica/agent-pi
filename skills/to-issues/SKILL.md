---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable cmd tasks using tracer-bullet vertical slices. Use when user wants to convert a plan into tasks, create implementation tickets, or break down work into tasks.
---

> Imported from mattpocock/skills@main · hand-ported to use `cmd` (Commander v2) instead of a generic issue tracker.

# To Tasks

Break a plan into independently-grabbable `cmd` tasks using vertical slices (tracer bullets).

This skill assumes the project uses `cmd` (Commander v2). Triage label vocabulary is defined in the `triage` skill — see `skills/triage/SKILL.md` for the canonical role list (`bug`/`enhancement` × `triage:needs-triage`/`triage:ready-for-agent` etc.).

> 🛑 **`cmd task add` requirements** (do NOT skip — see also `CLAUDE.md` → "MANDATORY Pre-flight Checklist"):
> - Always pass `--runtime claude-code --model <name>` on every write.
> - **Root task** (no `--parent`) → `--mission-brief "1-3 sentence what & why"` is **REQUIRED**. If the plan you're breaking down does not yet have a parent `cmd` task, the FIRST task you create is the root and MUST carry a `--mission-brief`. All sibling slices then go under it as `--parent <root-id>` subtasks.
> - **Subtask** (`--parent <id>`) → brief is inherited from the parent. Do NOT repeat the brief on subtasks.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a task reference (a `cmd` task id like `agent-pi-eb3m` or a path), fetch it with `cmd context <id>` and read its full description and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Task titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** tasks. Each task is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK (will become a cmd label: `hitl` or `afk`)
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the tasks to `cmd`

For each approved slice, create a new `cmd` task. Use the task body template below. These tasks are considered ready for AFK agents, so publish them with the `triage:ready-for-agent` label (and `afk` or `hitl` to mark the slice type) unless instructed otherwise.

Publish tasks in dependency order (blockers first) so you can reference real `cmd` task ids in the "Blocked by" field via `cmd dep add`.

```bash
RUNTIME="--runtime claude-code --model claude-opus-4-7"

# Create a task (use --parent <root> if there's a parent task)
cmd task add "Title of the slice" \
  --parent <parent-id> \
  --labels afk,triage:ready-for-agent \
  --description "$(cat <<'EOF'
## What to build
...

## Acceptance criteria
- [ ] Criterion 1

## Blocked by
- agent-pi-abcd
EOF
)" \
  $RUNTIME

# Wire up dependencies after creating downstream tasks
cmd dep add <downstream-id> <upstream-id>
```

<task-template>
## Parent

A reference to the parent `cmd` task (if the source was an existing task, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking `cmd` task id (if any)

Or "None - can start immediately" if no blockers.

</task-template>

Do NOT close or modify any parent task.
