---
name: handoff
description: "Create/update a concise Pi handoff document; optionally trigger native memory-cycle compaction when explicitly requested."
argument-hint: "[focus for the next session]"
allowed-tools: '["bash", "read", "write", "show_report", "cycle_memory"]'
context: inline
---

# /handoff — Pi Session Handoff

Write a short, pointer-based handoff so a fresh agent, another mode, or a future session can continue the work without re-reading the full transcript.

By default, `/handoff` is **standalone**: it writes or updates a handoff document, prints the path plus a brief preview, and stops. Only trigger Pi's native memory-cycle compaction when the user explicitly asks for memory-aware compaction, for example: "handoff and compact", "cycle memory after handoff", or "prepare for context compaction".

## Input

Focus: `$ARGUMENTS`

If arguments are provided, treat them as the **focus for the next session** and tailor the document accordingly. If no focus is provided, infer it from the most recent work.

## Where to write

Prefer a stable, session-scoped location:

```bash
HANDOFF_DIR="${PI_HANDOFF_DIR:-.context/handoffs}"
mkdir -p "$HANDOFF_DIR"
HANDOFF_PATH="$HANDOFF_DIR/handoff-$(date -u +%Y%m%d-%H%M%S).md"
```

Fall back to `mktemp -t pi-handoff-XXXXXX.md` if `.context/handoffs/` is not writable, such as in a read-only worktree.

If a recent handoff already exists in `$HANDOFF_DIR`, append an `## Update — <timestamp>` section to the most recent file instead of creating duplicate long summaries, unless the user passed arguments that clearly indicate a clean restart or a separate handoff.

Read the target path before writing if it already exists.

## What to include

Keep the handoff high-signal. The next agent should be able to resume in under 60 seconds of reading.

```markdown
# Handoff — <YYYY-MM-DD HH:MM UTC>

## Focus for next session
<One paragraph derived from the user's arguments, or inferred from the last task.>

## Where we left off
<Current state in 2-4 sentences: what's done, what's mid-flight, what's blocked.>

## Active artifacts
- Plan: `.context/todo.md` (or link to spec / brainstorm, or `none`)
- Active tasks: <IDs and titles if known>
- Active fp/bd/cmd issues: <IDs if any>
- Branch/worktree: <branch and path if available>
- Open branches / PRs: <names + URLs>
- Modified but uncommitted files: <short status>

## Decisions made this session
- <Decision> — <one-line rationale>
- <Decision> — <one-line rationale>

## Open questions / blockers
- <Question or blocker> — <what we tried, what's still unknown>

## Suggested next steps
1. <Concrete next action>
2. <Concrete next action>

## Suggested skills / modes for next session
- <Pi mode or skill if a specific one fits>
```

## What NOT to duplicate

Do not copy content already captured elsewhere. Reference it by path, issue ID, commit, branch, PR, or URL instead.

- Plans → reference `.context/todo.md` or the active plan/spec path.
- Specs → reference the `.context/specs/<slug>/` or `.kiro/specs/<slug>/` folder.
- Decisions already in ADRs → link the ADR file.
- Code changes → reference commits, branches, PRs, or changed-file summary, not full diffs.
- Task state → reference IDs and let the next agent inspect the task system.

The handoff should be **pointers + delta**, not a transcript snapshot.

## Execution

Arguments: `$ARGUMENTS`

1. Resolve the focus from `$ARGUMENTS` or recent work.
2. Determine whether this is standalone or memory-aware:
   - **Standalone default:** write/update the handoff only.
   - **Memory-aware optional path:** if the user explicitly requested compaction/memory cycling, write/update the handoff first, then trigger native memory cycling if available.
3. Gather only high-signal inputs:
   - `git status --short` and `git log --oneline -5` when in a git repo.
   - Active task state if available (`cmd task list --status working --json` or the current task UI); skip silently if unavailable.
   - The current plan path if `.context/todo.md` exists.
   - Relevant branch/worktree and PR/issue links if already known.
4. Compose the handoff using the structure above.
5. Write to `$HANDOFF_PATH`, or append an `## Update — <timestamp>` section to the latest recent handoff when appropriate.
6. Optionally extract one durable memory if the session produced a lasting decision, reusable workflow, verified root cause, architecture boundary, or project-specific gotcha.
   - Add only a concise durable fact when a memory tool is available.
   - Do not add the full handoff, transcript, diffs, noisy logs, secrets, or unverified hypotheses.
   - If memory add fails or no memory tool is available, continue; the handoff remains the source of truth.
7. If memory-aware compaction was explicitly requested:
   - If `cycle_memory` is available, call it with instructions that mention the handoff path, focus, and any durable memory already added.
   - If `cycle_memory` is unavailable, tell the user to use Pi's native compact/cycle action next.
   - Do not claim memory was compacted unless the native compaction path was actually triggered.
8. Print the absolute handoff path, a 2-3 line preview, and memory-compaction status.

## Output

Standalone default:

```text
Handoff written: <path>
Memory compaction: not requested
Restore hint: read the handoff, then continue from Suggested next steps.
```

Memory-aware optional path:

```text
Handoff written: <path>
Memory compaction: <triggered | manual native compact needed>
Restore hint: read the handoff, then use /restore or Pi's native memory restore path if starting fresh.
```

## Conventions and guardrails

- Keep the handoff short and pointer-based; do not paste large diffs.
- Do not start new implementation work after a handoff/compact request.
- Do not replace Pi's native memory-cycle compaction with a manual-only summary.
- Native memory-cycle extension owns daily logs and `.context/session-state.json` during compaction.
- Use durable memory only for searchable durable facts and code-navigation hints.
- No emojis.
- No "what I would do if I had more time"; list concrete next steps only.
- If there is an active parent task in `cmd`, leave a final progress comment when possible:

```bash
cmd task comment "$TASK_ID" "Handoff written: $HANDOFF_PATH" --type progress
```
