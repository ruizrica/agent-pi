---
name: cycle-context
description: "Checkpoint Project Memory Pack state, write a pointer-based handoff, and optionally trigger native memory-cycle compaction."
argument-hint: "[focus / checkpoint notes / --compact]"
allowed-tools: ["bash", "read", "write", "show_report", "cycle_memory", "obsidian_memory"]
context: inline
---

# /cycle-context — Project Memory Checkpoint and Optional Native Compaction

Use `/cycle-context` when the user asks to checkpoint, update docs, preserve state for the next session, prepare a context cycle, or run native memory-cycle compaction.

This command keeps `/handoff` standalone while reusing the same high-signal, pointer-based continuation method. `/cycle-context` owns the richer memory-system behavior: Project Memory Pack updates, handoff creation, milestone/wiki readiness checks, and optional Pi native `cycle_memory`.

## Input

Focus / checkpoint notes: `$ARGUMENTS`

If the arguments include explicit compaction wording such as `--compact`, `compact`, `cycle memory`, `memory cycle`, or `native compaction`, trigger Pi native `cycle_memory` after writing the checkpoint artifacts. Otherwise, do **not** compact.

## Memory ownership model

| Memory kind | Canonical owner | `/cycle-context` behavior |
|---|---|---|
| Current in-flight state | `STATE.md` | Replace stale state with current focus, branch/worktree, active plan/tasks, last completed step, next step, blockers, and key files. |
| Session history | `journal/YYYY-MM-DD.md` | Append concise decisions, attempts, verification, and next steps. |
| Standalone continuation | `.context/handoffs/` | Write/update a pointer-based handoff using `/handoff`'s content model. |
| Deferred ideas | `BACKLOG.md` | Add only deferred work not already represented as cmd tasks. |
| Shipped capabilities | `FEATURES.md` | Update only for shipped user-visible or agent-visible capabilities. |
| Operational restore | `.context/session-state.json`, native memory state | Let native `cycle_memory` own this when explicitly requested. |
| Indexed retrieval | `agent-memory` | Add at most one concise durable fact if a reusable decision/root cause/workflow emerged. |
| Wiki/Obsidian knowledge | `journal/milestones/` → Obsidian | Ingest only reviewed, ready milestone notes; never ingest routine `.context/project-memory/changes/`. |

## Workflow

1. Resolve the focus from `$ARGUMENTS` or recent work.
2. Inspect high-signal local context only:
   - `git status --short` and `git log --oneline -5` when in a git repo.
   - Active plan/spec path, especially `.context/todo.md`.
   - Active task IDs from cmd/task UI if available.
   - Recent changed files and verification results if already known.
3. Update `STATE.md` as the fast resume file. Keep it short and current; replace stale status rather than appending history.
4. Append a concise entry to today's `journal/YYYY-MM-DD.md` with:
   - shipped/changed work
   - decisions and rationale
   - failed attempts worth preserving
   - verification performed
   - concrete next step
5. Write or update a pointer-based handoff under `.context/handoffs/` using the `/handoff` template. Reference plans, tasks, commits, and files instead of copying diffs or transcripts.
6. Update `BACKLOG.md` only for deferred work that is not already a cmd task.
7. Update `FEATURES.md` only when a shipped capability should be discoverable by future agents.
8. Review `journal/milestones/`:
   - draft notes are not wiki-ready
   - only notes marked ready should be ingested into Obsidian
   - record any ingestion path/link back in the note or journal when done
9. Optionally add one concise `agent-memory` entry if the session produced a durable decision, verified root cause, reusable workflow, architecture boundary, or user preference.
10. If native compaction was explicitly requested, call `cycle_memory` with instructions that mention:
    - the handoff path
    - updated memory-pack files
    - current focus
    - next step
11. Print artifact paths, checkpoint status, and compaction status.

## Milestone → Obsidian workflow

Only ingest reviewed milestone notes, never routine hook summaries.

A milestone note is eligible when its frontmatter or status block says it is ready, for example:

```yaml
status: ready
ready_for_wiki: true
wiki_ingested: false
```

Then ingest with the Obsidian memory tool using the milestone file as source:

```text
obsidian_memory {
  operation: "ingest",
  title: "<Milestone title>",
  content: "<reviewed milestone note content>",
  source: "journal/milestones/<file>.md",
  tags: "project-memory,milestone"
}
```

After successful ingestion, update the milestone note or journal entry with the Obsidian raw path/link and mark `wiki_ingested: true` when practical. Compile into a wiki article only after curation.

## Output

```text
Context checkpoint complete.
STATE.md: updated
Journal: journal/YYYY-MM-DD.md updated
Handoff: .context/handoffs/<file>.md
Backlog/features: <updated | no changes needed>
Milestones/Obsidian: <none | draft notes skipped | ingested ready notes>
Native memory compaction: <not requested | triggered | unavailable>
Next: <concrete next step>
```

## Guardrails

- Do not use `/cycle-context` as a replacement for focused `/handoff` when the user only wants a standalone handoff.
- Do not paste full transcripts, full diffs, secrets, credentials, noisy logs, or unverified hypotheses into memory files.
- Do not ingest `.context/project-memory/changes/` into Obsidian.
- Do not ingest milestone notes that still contain TODO placeholders or are marked draft.
- Do not claim native compaction happened unless `cycle_memory` actually ran.
- Do not start new implementation work after a checkpoint/compaction request.
