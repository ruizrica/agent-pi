---
name: handoff
description: Create or update a concise Pi handoff document; optionally prepare for native memory-cycle compaction when explicitly requested.
argument-hint: "What should the next session focus on?"
---

# Handoff Skill

Use this skill to summarize the current conversation into a short, pointer-based handoff that a fresh agent, another mode, or a future session can read quickly and continue from.

This skill is standalone by default. It writes or updates a handoff, prints the path plus a short preview, and stops. If the user explicitly asks to compact, cycle memory, or prepare for context compaction, write the handoff first and then use Pi's native memory-cycle path when available. Do not register or invoke a local skill named `compact`.

## Output location

Prefer a stable workspace-local path:

```text
.context/handoffs/handoff-<UTC timestamp>.md
```

Create `.context/handoffs/` if needed. If the workspace is read-only or the directory cannot be created, fall back to a temporary path from `mktemp -t pi-handoff-XXXXXX.md`.

If a recent handoff already exists for the same session, append an `## Update — <timestamp>` section instead of creating duplicate long summaries, unless the user asks for a clean restart or separate handoff.

## Handoff content model

Keep it high-signal and short enough for the next agent to resume in under 60 seconds.

```markdown
# Handoff — <YYYY-MM-DD HH:MM UTC>

## Focus for next session
<One paragraph derived from the user's arguments, or inferred from recent work.>

## Where we left off
<2-4 sentences describing what is done, what is mid-flight, and what is blocked.>

## Active artifacts
- Plan: <path or none>
- Active tasks: <IDs/titles if known>
- Branch/worktree: <branch and path if available>
- Modified files: <short status>
- Open PRs/issues: <links or IDs if known>

## Decisions made this session
- <Decision> — <one-line rationale>

## Open questions / blockers
- <Question or blocker> — <status>

## Suggested next steps
1. <Concrete next action>
2. <Concrete next action>

## Suggested skills / modes for next session
- <Pi mode or skill if one fits>
```

## What to gather

Collect only durable continuation context:

- Current repo/worktree path and branch if available.
- Short modified-file summary if available.
- Active plan/spec/task paths and IDs.
- Recent decisions and blockers.
- Next concrete actions.
- Skills or modes that would help the next session.

Do not duplicate full plans, PRDs, ADRs, issues, commits, diffs, logs, or transcripts. Reference them by path, ID, commit, branch, PR, or URL.

## Optional memory-aware behavior

Only use this path when the user explicitly asks for compaction or memory cycling.

1. Write or update the handoff first.
2. Optionally add one concise durable memory if the session produced a reusable workflow, verified root cause, durable decision, architecture boundary, user preference, or project-specific gotcha.
3. Trigger Pi's native memory-cycle compaction if available, with instructions that mention the handoff path and continuation focus.
4. If native memory cycling is unavailable, tell the user to use Pi's native compact/cycle action next.

Do not claim memory was compacted unless native compaction actually ran. Do not replace native compaction with a manual-only summary.

## Final response

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
Restore hint: read the handoff, then use Pi's native memory restore path if starting fresh.
```

## Guardrails

- Keep the handoff short and pointer-based.
- Do not include secrets, credentials, large diffs, noisy logs, or unverified hypotheses.
- Do not start new implementation work after a handoff request.
- Do not reintroduce a local command or skill named `compact`.
- No emojis.
