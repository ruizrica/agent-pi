---
name: handoff
description: "Compact the current Pi session into a handoff document so a fresh agent (or a different mode) can pick up the work cleanly."
argument-hint: "[focus for the next session]"
allowed-tools: '["bash", "read", "write", "show_report"]'
context: inline
---

# /handoff — Pi Session Handoff

Write a handoff document summarising the current Pi session so a fresh agent can continue the work without re-reading the full transcript.

If the user passed arguments, treat them as the **focus for the next session** and tailor the doc accordingly. If no arguments, infer the focus from the most recent activity.

## Where to write

Save the document to a stable, session-scoped location so the next agent can find it:

```bash
HANDOFF_DIR="${PI_HANDOFF_DIR:-.context/handoffs}"
mkdir -p "$HANDOFF_DIR"
HANDOFF_PATH="$HANDOFF_DIR/handoff-$(date -u +%Y%m%d-%H%M%S).md"
```

Fall back to `mktemp -t pi-handoff-XXXXXX.md` if `.context/handoffs/` is not writable (e.g. read-only worktree).

Read the file path before writing if it already exists (it shouldn't, given the timestamp), then write the new content.

## What to include

Keep it short and high-signal. The next agent should be able to resume in **under 60 seconds of reading**.

```markdown
# Handoff — <YYYY-MM-DD HH:MM UTC>

## Focus for next session
<One paragraph derived from the user's arguments, or inferred from the last task.>

## Where we left off
<Current state in 2-4 sentences: what's done, what's mid-flight, what's blocked.>

## Active artifacts
- Plan: `.context/todo.md` (or link to spec / brainstorm)
- Active `cmd` tasks: <IDs and titles — run `cmd task list --status working` to populate>
- Active fp/bd issues: <IDs if any>
- Open branches / PRs: <names + URLs>
- Modified but uncommitted files: <output of `git status --short`>

## Decisions made this session
- <Decision> — <one-line rationale>
- <Decision> — <one-line rationale>

## Open questions / blockers
- <Question or blocker> — <what we tried, what's still unknown>

## Suggested next steps
1. <Concrete next action>
2. <Concrete next action>

## Suggested skills / modes for next session
- `/pi <mode>` if a specific mode fits
- Skill names that map to the open work (e.g. `cmd-task-tracking`, `diagnose`, `triage`)
```

## What NOT to duplicate

Do not copy content already captured elsewhere — **reference it by path or URL** instead.

- Plans → reference `.context/todo.md` (or wherever the active plan lives)
- Specs → reference the `.context/specs/<slug>/` folder
- Decisions already in ADRs → link the ADR file
- Code changes → reference commits / branches / PRs, not full diffs
- `cmd` task state → reference task IDs and let the next agent run `cmd context <id>`

If the same fact is already a `cmd task comment` or a commit message, leave it there. Handoffs should be **pointers + delta**, not snapshots.

## Execution

Arguments: $ARGUMENTS

1. Resolve the focus (use `$ARGUMENTS` if present; otherwise infer from the most recent work).
2. Gather the inputs:
   - `git status --short` and `git log --oneline -5` for repo state
   - `cmd task list --status working --json` if `cmd` is available (skip silently otherwise)
   - The current plan path if `.context/todo.md` exists
3. Compose the handoff using the structure above.
4. Write it to `$HANDOFF_PATH`.
5. Print the absolute path to the user and a 2-3 line preview so they can verify before handing off.

## Conventions

- **One handoff per session.** If a recent handoff already exists in `$HANDOFF_DIR`, append a `## Update — <timestamp>` section to the most recent file instead of creating a new one — *unless* the user passed arguments that signal a clean restart.
- **No emojis.** Pi house style.
- **No "what I would do if I had more time"** — the handoff is for the next agent, not for catharsis. List concrete next steps only.
- **Cross-link with `cmd`.** If this session has an active parent task in `cmd`, leave a final comment:
  ```bash
  cmd task comment "$TASK_ID" "Handoff written: $HANDOFF_PATH" --type progress
  ```
