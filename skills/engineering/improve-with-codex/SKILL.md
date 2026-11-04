---
name: improve-with-codex
description: Hybrid of /improve-architecture and codex-worker delegation. Phase 1 follows the same exploration + candidate-proposal flow as improve-codebase-architecture; Phase 2 then executes the approved candidates autonomously by spawning a codex-worker subagent per improvement, with state tracked in cmd tasks and a YAML manifest at .improve-with-codex/plan.yaml so the loop is resumable. Use when the user wants an end-to-end architecture-improvement pass that runs without per-step hand-holding.
---

# Improve With Codex

A two-phase skill that braids the proposal discipline of [improve-codebase-architecture](../improve-codebase-architecture/SKILL.md) with autonomous execution via the [codex-worker](../../../agents/workers/codex-worker.md) subagent.

- **Phase 1 — Plan** (interactive). Same Explore → Present candidates → Grilling loop as `improve-codebase-architecture`. Outputs: a cmd root task + one subtask per approved improvement, a manifest at `.improve-with-codex/plan.yaml`, and a mermaid plan at `.context/todo.md`.
- **Phase 2 — Execute** (autonomous). Walk the manifest. For each pending improvement, claim the cmd subtask, spawn a `codex-worker` agent, verify diff + tests, commit, complete the cmd subtask, continue. Stop only when no item is `pending` or `in_progress`.

cmd tasks + manifest are the source of truth. Interrupting and re-invoking `execute` resumes from the first non-completed cmd subtask.

## Invocation

| Form | Behavior |
|---|---|
| `/improve-with-codex` | Phase 1 (plan). If a manifest already exists with pending items, ask whether to re-plan, append, or jump straight to execute. |
| `/improve-with-codex execute` | Phase 2 (autonomous loop). Errors if no manifest. |
| `/improve-with-codex status` | Read-only progress view (cmd + manifest). |

Optional `execute` flags: `--continue-on-failure`, `--from <cmd_task_id>`, `--only <id[,id...]>`, `--dry-run`.

## Phase 1 — Plan

Follow the exact process documented in [improve-codebase-architecture](../improve-codebase-architecture/SKILL.md):

1. **Explore.** Read `CONTEXT.md` and any ADRs first. Use `subagent_type=Explore` to walk the codebase. Apply the deletion test. Note friction.
2. **Present candidates.** Numbered list with Files / Problem / Solution / Benefits, in `CONTEXT.md` and `LANGUAGE.md` vocabulary. Mark ADR conflicts. Don't propose interfaces yet.
3. **Ask:** *"Which improvements would you like to queue up for autonomous execution? (e.g. `1, 3, 4` or `all`)"*
4. **Grilling loop — sharper than usual.** For each chosen candidate, drop into a brief grilling pass. The bar is higher than in the original skill: by the end, you need enough resolved detail that `codex-worker` can implement without coming back for clarification. Apply the original skill's inline side effects (update `CONTEXT.md` when naming a new concept; offer an ADR when a candidate is rejected for a load-bearing reason).
5. **Create cmd tasks.** Root with `--mission-brief` (REQUIRED per `CLAUDE.md`), one subtask per chosen improvement (no brief on children). See [REFERENCE.md — cmd task commands](REFERENCE.md#cmd-task-commands) for exact invocations.
6. **Write the manifest** at `.improve-with-codex/plan.yaml` — full schema in [REFERENCE.md — Manifest schema](REFERENCE.md#manifest-schema). One entry per chosen improvement; each entry carries the self-contained `codex_prompt` Phase 2 will dispatch.
7. **Write `.context/todo.md`** with the required `## Architecture` mermaid section — template in [REFERENCE.md — Plan template](REFERENCE.md#plan-template).
8. **Show the user the manifest path, cmd root task id, and plan path. Ask:**

   > Ready to kick off `/improve-with-codex execute`?

   **Do NOT auto-start.** The user kicks off explicitly.

## Phase 2 — Execute

When invoked with `execute`:

1. **Preflight.**
   - Read `.improve-with-codex/plan.yaml`. If absent → abort: `No manifest. Run /improve-with-codex first.`
   - `git status --porcelain` — if dirty, ask whether to stash or abort. Each codex-worker run must start from a known commit so per-improvement diffs are clean.
   - Items still `in_progress` from a prior interrupted run are flipped to `failed` (notes: `"Interrupted; not verified."`) and surfaced for retry/skip before the loop starts.
   - Resolve target list: items with `status: pending`, respecting `--from` / `--only`.

2. **Announce.** Print `Executing <N> improvements via codex-worker. Halt-on-failure: <yes|no>.` and the titles in order.

3. **Loop.** For each target improvement, in id order:

   a. **Claim cmd subtask, mark started.**
      ```bash
      cmd task claim <cmd_task> --runtime claude-code --model <model>
      cmd task comment <cmd_task> "Started via /improve-with-codex" --type progress --runtime claude-code --model <model>
      ```
      Edit manifest entry: `status: in_progress`, `started_at: <ISO8601>`.

   b. **Spawn codex-worker** via the `Agent` tool. The prompt MUST include a `## Working Context` section — codex-worker reads it first per its orientation contract. Use the [codex-worker prompt template](REFERENCE.md#codex-worker-prompt-template).

      ```
      Agent({
        subagent_type: "codex-worker",
        description: "Codex: <title>",
        prompt: <prompt built from template + manifest entry>
      })
      ```

      The `Agent` tool blocks until codex-worker returns; the outer loop is correctly serialized. No `--background` equivalent needed.

   c. **Verify.**
      - `git status --porcelain` + `git diff --stat HEAD`. No files changed → mark `failed`, notes `"codex-worker returned without modifying files."`.
      - Run `test_command` from the manifest. Non-zero exit → mark `failed`, capture tail of test output into `notes`.

   d. **Commit on success.** One commit per improvement — clean per-deepening diff for review, trivial `git revert` if a deepening turns out to be wrong, stable handle from `commit_sha` back to exactly what changed.
      ```bash
      git add -A
      git commit -m "improve: <title>

      Via /improve-with-codex (cmd #<cmd_task>, manifest id <id>)."
      ```
      Capture commit SHA. Manifest: `status: done`, `completed_at: <ISO8601>`, `commit_sha: <sha>`.

   e. **Close cmd subtask.**
      - On done: `cmd task update <cmd_task> --status completed --runtime claude-code --model <model>`
      - On failed: leave open. `cmd task comment <cmd_task> "Failed: <reason>" --type error --runtime claude-code --model <model>`

   f. **Progress line.** `[i/N] <title> — <done|failed> (<sha or reason>)`

   g. **Halt or continue.** `failed` + no `--continue-on-failure` → stop loop. Otherwise next.

4. **Session completion** (per `CLAUDE.md` Session Completion workflow):
   - Update `STATE.md` with current state (done/failed/skipped counts, manifest path, cmd root task id).
   - Append today's `journal/YYYY-MM-DD.md` with a one-paragraph summary.
   - **Do NOT push.** Push requires explicit user authorization per `CLAUDE.md` Git Operations policy.

5. **Summary.** Counts + titles per status, manifest path. If halted: `Halted at improvement #<id> (cmd #<cmd_task>). Inspect, fix manifest, re-run /improve-with-codex execute to resume.`

## Phase 3 — Status

`/improve-with-codex status` reads `.improve-with-codex/plan.yaml` plus cmd subtask state and prints a checklist with per-item cmd task ids. No state changes. Status glyphs: `[x]` done, `[~]` in_progress, `[ ]` pending, `[!]` failed, `[-]` skipped. Example output in [REFERENCE.md — Status output](REFERENCE.md#status-output).

## Safety properties

1. **Atomicity per improvement.** Either an improvement results in a clean commit + completed cmd subtask, or its `status` is `failed` with notes + an open cmd subtask. No half-done state survives the loop.
2. **Resumability.** Manifest + cmd subtasks fully describe remaining work. Killing the session and re-invoking `execute` picks up cleanly.
3. **No silent skips.** Failures surface as `failed` and either halt the loop or, with `--continue-on-failure`, remain visible in the summary and as open cmd subtasks. The loop never quietly moves past a broken improvement.
4. **Push-safe.** The skill never runs `git push`. Per-improvement commits are local; pushing is the user's call at session end, gated by `CLAUDE.md` Git Operations policy.

## See also

- [REFERENCE.md](REFERENCE.md) — templates (codex-worker prompt, mermaid plan, manifest), cmd command reference, failure recovery walkthrough.
- [../improve-codebase-architecture/SKILL.md](../improve-codebase-architecture/SKILL.md) — proposal discipline Phase 1 follows verbatim.
- [../../../agents/workers/codex-worker.md](../../../agents/workers/codex-worker.md) — subagent Phase 2 dispatches to.
