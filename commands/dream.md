---
name: dream
description: "Global-first Pi memory consolidation and nightly self-improvement"
argument-hint: "[--global] [--workspace <path>] [--dry-run] [--deep]"
allowed-tools: '["run_chain", "read", "write", "bash", "obsidian_memory", "tasks", "show_report"]'
context: inline
---

# /dream — Global Pi Memory Consolidation

You are initiating Pi's **dream cycle** — a global-first memory consolidation and nightly self-improvement workflow.

`/dream` is not a session checkpoint command. Use `/handoff` for a standalone continuation note, and use `/cycle-context` for Project Memory Pack checkpoint/update-docs behavior or explicit native compaction. `/dream` may read those artifacts as inputs, but it should not replace the normal per-session checkpoint flow.

## What `/dream` Does Now

1. **Scans memory sources** across Pi's global memory system, current workspace memory, Project Memory Pack files, project context artifacts, skills, `agent-memory`, and Obsidian
2. **Classifies memory** into raw evidence, durable memory, superseded memory, archival material, and active workspace context
3. **Consolidates learnings** into durable summaries that Pi can reuse across projects
4. **Verifies retention safety** so valuable information is not lost during compaction or superseding
5. **Records nightly recommendations** for how Pi should improve itself
6. **Produces outputs Commander can consume through Pi** without moving dream logic into Commander

## Relationship to /handoff and /cycle-context

| Command | Scope | Owns |
|---|---|---|
| `/handoff` | Current session continuation | `.context/handoffs/` pointer-based note only |
| `/cycle-context` | Current workspace checkpoint | `STATE.md`, `journal/`, optional `BACKLOG.md`/`FEATURES.md`, handoff, optional native `cycle_memory` |
| `/dream` | Global/periodic consolidation | Cross-workspace memory classification, durable promotion, superseding/archiving recommendations, self-improvement report |

Do not use `/dream` as a substitute for updating `STATE.md` or writing a session handoff. Run `/cycle-context` first when the current workspace state needs to be preserved.

## Arguments

- `--global` — Force a global-first dream pass (default)
- `--workspace <path>` — Include a specific workspace as a source during the dream pass
- `--dry-run` — Preview classification and consolidation actions without writing outputs
- `--deep` — Include deeper review of Obsidian and cross-workspace memory patterns

## Workspace sources

When a workspace is in scope, classify these as workspace memory inputs:

- Project Memory Pack: `CLAUDE.md`, `STATE.md`, `journal/YYYY-MM-DD.md`, `BACKLOG.md`, `FEATURES.md`
- Milestone raw candidates: `journal/milestones/` ready/reviewed notes
- Operational context: `.context/todo.md`, specs, `.context/handoffs/`, `.context/session-state.json`
- Hook telemetry: `.context/project-memory/changes/` as raw local evidence only
- Indexed retrieval: `agent-memory` memories and code index metadata, when available
- Knowledge base: Obsidian raw/wiki content, when `--deep` or explicitly relevant

Routine `.context/project-memory/changes/` entries should not be promoted directly to Obsidian/wiki. Treat them as evidence that may point to a reviewed milestone or durable summary.

## Core Model

`/dream` is **not primarily a cleanup command anymore**.

It is a **global memory system command** built around:

- **Raw evidence** — reports, notes, session traces, transient project artifacts
- **Workspace memory** — current project-specific context and Project Memory Pack files
- **Durable Pi memory** — reusable learnings and long-lived summaries
- **Superseded memory** — older items retained for traceability but no longer primary
- **Self-improvement recommendations** — what Pi should change or strengthen next

Deletion is no longer the main outcome. Prefer:

1. consolidate
2. supersede
3. archive
4. delete only when clearly safe and low-value

## Execution

Arguments: $ARGUMENTS

First determine:

- Scope mode: global-first unless a narrower workspace scan is explicitly requested
- Dry-run mode: whether writes should be avoided
- Deep mode: whether broader cross-memory synthesis should be performed
- Whether `/cycle-context` should be recommended first because current workspace state is stale or uncheckpointed

### If `--dry-run`

Run the dream chain in preview mode and produce:

- source inventory
- durable memory candidates
- supersede/archive candidates
- self-improvement recommendations
- global state changes that would be written

Do **not** execute destructive or persistent changes.

### Normal Execution

Activate the dream chain:

```text
run_chain { task: "Execute global-first dream consolidation cycle for Pi. $ARGUMENTS" }
```

The chain runs sequentially:

1. **dream-scanner** → inventory global/workspace memory sources and classify them
2. **dream-compiler** → promote durable memory, create structured summaries, write global outputs
3. **dream-verifier** → verify nothing important is lost or incorrectly superseded
4. **dream-cleaner** → finalize state, archive/supersede low-priority items, emit final dream report

## Post-Dream

After completion:

1. Read the global dream state from `~/.pi/dream/dream-state.json`
2. Summarize:
   - workspaces scanned
   - sources consolidated
   - durable memories promoted
   - items superseded or archived
   - recommendations generated
3. Show the final report if useful

## Global State Tracking

Dream state is global-first and stored under Pi's home data, not only the current workspace:

```json
{
  "lastDream": "2025-01-15T10:15:00Z",
  "intervalHours": 24,
  "enabled": true,
  "globalRoot": "~/.pi/dream",
  "lastScope": "global",
  "lastSummary": {
    "workspacesScanned": 3,
    "sourcesConsolidated": 18,
    "durableMemoriesPromoted": 6,
    "supersededItems": 5,
    "recommendationsGenerated": 4
  }
}
```

## Safety Notes

- Dream logic lives in Agent Pi, not Commander
- Commander may consume outputs, but does not own the dream implementation
- Prefer superseding and archiving over deletion
- Preserve traceability for important memory transitions
- Do not update current session state in place of `/cycle-context`
- Do not ingest draft milestone notes or routine hook summaries into Obsidian/wiki
- The dream report should clearly separate:
  - what was observed
  - what was promoted to durable memory
  - what was superseded
  - what Pi should improve next
