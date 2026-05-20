# STATE.md — Current In-Flight State

Keep this file short and current. It is the fastest human-readable restore point for a fresh agent, not a transcript or history log.

## Current Focus

- **Task:** None in-flight. Two coupled slices shipped this session:
  1. **Parent ↔ children link strengthening** — 6 small slices closing seams identified in a tasks.ts audit (brief quality, brief edits, mid-progress visibility, child-edit drift, parent reopen).
  2. **Validation-card over-creation prevention** — 5 small slices (1 cleanup + 4 code/docs) preventing the failure mode that produced 5 dummy validation cards on the live board on 2026-05-19.
- **Status:** 11 local commits on `main` (`9f7d0f4` → `bc2430e`). 255 tests green across 16 task/sync/cmd test files. Pre-existing repo-wide failures (send-email, dream-scheduler, learn, interfaze demos, etc.) are unchanged and unrelated.
- **Branch/worktree:** main (clean working tree; nothing pushed).
- **Active plans:** None. Both plans completed:
  - Original audit findings → captured inline in this conversation, now shipped as commits `9f7d0f4`–`1b17210` + `c0d371d` chore.
  - `.context/todo-prevent-task-overcreation.md` → all 5 slices A-E shipped (`39993f8`, `4936b16`, `8a1f972`, `bc2430e`; slice A was board ops only).
- **Active task IDs:** None claimed in cmd. Five dummy validation cards (`agent-pi-iv989` + children `agent-pi-wyax7`, `agent-pi-psgww`, `agent-pi-ii16p`, `agent-pi-lozbj`) were cancelled with audit comments.

## Last Completed Step

- **Slice E (CLAUDE.md docs)** — codified the 4-part validation-card convention (count discipline, `test-only` label, cancel-not-complete, soft-warning UX) in the cmd workflow section. Final commit `bc2430e`.

## What's now in place that wasn't before

- `tasks new-list` requires a real ≥60-char mission brief and rejects label-grade descriptions with a contract-aware error.
- `tasks update-list` action lets agents refine list title / brief mid-flight; syncs to the Commander parent's `title` + `description` + `mission_brief`.
- Child task → done transitions post a `M/N complete: <text>` comment on the Commander parent so the dashboard's mission card has mid-progress signal.
- Child text edits (`tasks update`) now sync `--title` to the Commander child instead of drifting silently.
- Un-toggling a done child after mission-complete reopens the Commander parent.
- `tasks new-list ... test_only=true` (and `add ... test_only=true`) tags every resulting card with the `test-only` label as an audit hook for `cmd task list --label test-only`.
- Soft warning fires on `new-list` when the brief reads like a validation scaffold AND >1 children are being created AND `test_only` was NOT set.
- `cmd-bridge.ts`'s `CmdTaskUpdateRequest` carries `mission_brief?: string` and the client pipes it through to `cmd task update --mission-brief`.

## Next Step

- **User manual smoke test** — restart Pi; try `tasks new-list "Refactor" "short"` (expect error), then with a real brief (expect warning if it looks test-y), then `update-list` to refine the brief, toggle children, watch parent comments appear, un-toggle to confirm parent reopens.
- **Optional**: push the 11 commits to `pi-dev` once verified (CLAUDE.md policy: never push without explicit "push" / "push it" from user).
- **Deferred**: background reaper for `test-only` cards (intentionally out of scope per `.context/todo-prevent-task-overcreation.md`).

## Blockers / Open Questions

- None active. Pre-existing 16 broader-suite test failures (send-email, dream-scheduler, etc.) are unrelated to the task-sync surface and were untouched this session.

## Key Files

- `extensions/tasks.ts` (new-list/update-list/add/toggle/update wirings)
- `extensions/lib/tasks-brief-validator.ts` (≥60-char brief gate)
- `extensions/lib/tasks-list-metadata.ts` (parent-metadata diff helper)
- `extensions/lib/tasks-progress-comment.ts` (parent progress + reopen gates)
- `extensions/lib/tasks-test-list-detector.ts` (validation-card heuristic)
- `extensions/lib/commander/commander-sync.ts` (`buildGroupCreatePayload` now accepts labels)
- `extensions/lib/commander/cmd-bridge.ts` (`mission_brief` on update)
- `extensions/lib/commander/commander-cli-client.ts` (`--mission-brief` passthrough on update + `labels` on child create)
- `CLAUDE.md` (validation-card convention section)
- `.context/todo-prevent-task-overcreation.md` (the plan that drove slices A-E — gitignored, working doc only)

## Update Rules

- Replace stale state instead of appending history.
- Link to journal entries, plans, tasks, commits, or handoffs for historical detail.
- Do not include secrets, full diffs, noisy logs, or transcripts.
