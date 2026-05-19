---
name: handoff
description: "Create or update a concise standalone Pi handoff document."
argument-hint: "[focus for the next session]"
allowed-tools: '["bash", "read", "write", "show_report"]'
context: inline
---

# /handoff — Pi Session Handoff

Write a short, pointer-based handoff so a fresh agent, another mode, or a future session can continue the work without re-reading the full transcript.

By default and by design, `/handoff` is **standalone**: it writes or updates a handoff document, prints the path plus a brief preview, and stops. It does not update the Project Memory Pack and does not trigger Pi's native memory-cycle compaction.

Use `/cycle-context` when the user asks for a checkpoint, update-docs pass, memory-pack preservation, or native context/memory cycling.

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
- Active fp/cmd issues: <IDs if any>
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
2. Gather only high-signal inputs:
   - `git status --short` and `git log --oneline -5` when in a git repo.
   - Active task state if available (`cmd task list --status working --json` or the current task UI); skip silently if unavailable.
   - The current plan path if `.context/todo.md` exists.
   - Relevant branch/worktree and PR/issue links if already known.
3. Compose the handoff using the structure above.
4. Write to `$HANDOFF_PATH`, or append an `## Update — <timestamp>` section to the latest recent handoff when appropriate.
5. Print the absolute handoff path and a 2-3 line preview.

## Output

```text
Handoff written: <path>
Memory pack update: not requested; use /cycle-context for checkpoint/update-docs
Memory compaction: not requested; use /cycle-context with explicit compaction wording
Restore hint: read the handoff, then continue from Suggested next steps.
```

## Conventions and guardrails

- Keep the handoff short and pointer-based; do not paste large diffs.
- Do not start new implementation work after a handoff request.
- Do not update `STATE.md`, `journal/`, `BACKLOG.md`, or `FEATURES.md` from `/handoff`; use `/cycle-context` for that workflow.
- Do not trigger native `cycle_memory` from `/handoff`; use `/cycle-context` with explicit compaction wording.
- Use durable memory only for searchable durable facts and code-navigation hints at save/checkpoint boundaries, not for full handoffs.
- No emojis.
- No "what I would do if I had more time"; list concrete next steps only.
- If there is an active parent task in `cmd`, leave a final progress comment when possible:

```bash
cmd task comment "$TASK_ID" "Handoff written: $HANDOFF_PATH" --type progress
```
