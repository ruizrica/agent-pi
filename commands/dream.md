---
name: dream
description: "Context consolidation and memory compaction — clean up stale files, extract insights, create skills"
argument-hint: "[--dry-run] [--deep]"
allowed-tools: '["run_chain", "read", "write", "bash", "obsidian_memory", "tasks", "show_report"]'
context: inline
---

# /dream — Context Consolidation Cycle

You are initiating a **dream cycle** — a multi-agent workflow that consolidates memory, extracts insights, and cleans up stale context.

## What /dream Does

1. **Scans** all context locations (`.context/`, `.kiro/specs/`, `skills/`, Obsidian vault)
2. **Analyzes** each artifact — categorizes as keep, consolidate, archive, or delete
3. **Extracts** insights from stale artifacts — creates skills, ingests to Obsidian
4. **Verifies** the cleanup plan — multi-agent verification ensures nothing important is missed
5. **Cleans** — archives old files, removes stale content, resets session state
6. **Reports** — summary of what was learned, created, and removed

## Arguments

- `--dry-run` — Preview what would be cleaned without making changes
- `--deep` — Include full Obsidian health check and orphan resolution

## Execution

$ARGUMENTS

First, check if this is a dry run or has special flags:

```
Arguments: $ARGUMENTS
Dry run mode: [parse if --dry-run is present]
Deep mode: [parse if --deep is present]
```

### If --dry-run

Run only the scanner agent to produce the manifest, then display what would happen:

1. Use `run_chain` with the dream chain but instruct scanner-only behavior
2. Display the categorized artifacts
3. Show what would be archived, deleted, and created
4. Do NOT execute any cleanup

### Normal Execution

Activate the dream chain:

```
run_chain { task: "Execute dream consolidation cycle. $ARGUMENTS" }
```

The chain will run sequentially:
1. **dream-scanner** → inventories all artifacts, produces JSON manifest
2. **dream-compiler** → extracts insights, creates skills, ingests to Obsidian
3. **dream-verifier** → verifies nothing important is missed
4. **dream-cleaner** → executes cleanup, produces final report

### Post-Dream

After the chain completes:

1. Read `.context/dream-state.json` to confirm the dream was recorded
2. Display a summary to the user:
   - Files scanned, archived, deleted
   - Skills created
   - Obsidian content added
   - Space reclaimed
   - Next recommended dream time

3. Optionally show completion report via `show_report`

## Dream State Tracking

The dream cycle maintains state in `.context/dream-state.json`:

```json
{
  "lastDream": "2025-01-15T10:15:00Z",
  "intervalHours": 24,
  "enabled": true,
  "lastSummary": {
    "filesArchived": 7,
    "filesDeleted": 5,
    "skillsCreated": 2,
    "obsidianIngests": 5
  }
}
```

This allows scheduling reminders when it's been too long since the last dream.

## Safety Notes

- The verifier agent independently checks all delete operations
- Files are archived (not deleted) when there's any doubt
- Nothing outside `.context/` is ever deleted
- Obsidian content is additive — wiki articles are created, not removed
- The dream report shows exactly what changed

## Example Output

```
🌙 Dream Cycle Complete

Summary:
├── Files scanned: 25
├── Files archived: 7 → .context/archive/2025-01-15/
├── Files deleted: 5
├── Skills created: 2
│   ├── viewer-factory-pattern
│   └── config-validation-pattern
├── Obsidian ingests: 5
├── Wiki articles: 1
└── Space reclaimed: 45 KB

Next dream recommended: Tomorrow at 10:15 AM

Run /dream --dry-run anytime to preview what would be cleaned.
```
