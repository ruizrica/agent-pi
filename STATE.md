# STATE.md — Current In-Flight State

Keep this file short and current. It is the fastest human-readable restore point for a fresh agent, not a transcript or history log.

## Current Focus

- **Task:** Commander lifecycle consolidation + cmd-contract owner (Option 3) + 8 BACKLOG follow-ups — pivoted from Option 2 after forensic investigation revealed cross-repo unpaired-change rot was the structural root, not lifecycle-trio duplication.
- **Status:** All phases + all 8 BACKLOG items addressed in a single shippable slice. Full vitest suite green within the refactor blast radius (**2004 passing / 16 unrelated baseline failures / 0 blast-radius regressions**).
- **Branch/worktree:** main (uncommitted; awaiting user-approved commit/push)
- **Active plan:** `.context/todo.md` (Option 2 plan; superseded by Option 3 mid-flight — see journal/2026-05-19.md)
- **Active task IDs:** cmd `agent-pi-f8s9i` (consolidation root); status `working`, will be moved to `needs_review` after journal entry.

## BACKLOG Sweep (6 parallel agents, completed)

- **Latency triage (Y1)**: `runCommand` in `commander-cli-client.ts:411-423` now sets `CMD_SKIP_DUPLICATE_PREFLIGHT=1` via execFile env (opt-out via `PI_CMD_KEEP_PREFLIGHT`). Expected ~2.8s preflight overhead → ~0s on single-child group:create. 3 new tests.
- **Fix 3 expansion (Y2)**: typed wrappers for `task update` (which routes claim/complete/fail/cancel) in `cmd-bridge.ts` — `VALID_STATUSES`, `CmdTaskStatus`, `CmdTaskUpdateRequest`/`Response`, `validateStatus`, `isUpdateNoop`. Wired into `commander-cli-client.ts:208-220`. 8 new test groups (23 tests in cmd-bridge.test.ts).
- **Project-pointer drift + cross-repo contract (Y3)**: new `project-pointer-sync.ts` aligns dashboard's `currentProjectId` to Pi's cwd via `cmd project switch` on session_start; wired into `commander-lifecycle-guard.ts:222-241`. ADR at `docs/adr/0001-cmd-contract.md`. Integration test at `__tests__/cmd-contract-integration.test.ts`. 11 new tests.
- **`.commander/` rotation (Y4)**: new `rotate-sidecars.ts` + `scripts/rotate-commander-artifacts.mjs`. `.gitignore` confirmed covering. NOT auto-wired (deliberate BACKLOG-eligible decision). 11 new tests.
- **Source-text-pinning test cleanup (Y5)**: 32 tests audited across 4 files. 1 converted to behavior (`SyncState` round-trip); 30 kept as structural with 1-line documentation explaining that the asserted code lives inside the default-exported closure and isn't independently importable. No tests deleted.
- **Dead code in tasks.ts (Y6)**: removed `saveSharedStateIfNeeded` + `hydrateFromSharedStateIfAvailable` stubs (and 7 call sites); removed unused imports `DynamicBorder`, `Container`, `parseCommanderTaskId`, `addMapping`. -30 LOC.
- **Orphan cleanup (direct)**: `agent-pi-ejz3b`, `agent-pi-gfz8m`, `agent-pi-9ucwr`, `agent-pi-di9hk` all cancelled/closed.

## Last Completed Step

- **Fix 1.1 — `lastSyncedStatus` lie correction (CRITICAL).** First post-deployment user repro proved Fix 1 alone wasn't enough: `executeGroupCreate SUCCESS` fired but no `CATCH_UP` followed. Root cause: `applyGroupCreateResult` was writing `lastSyncedStatus: pending.desiredStatus`, and `addPendingCreate` in toggle (tasks.ts:953) had already updated `desiredStatus` to the new status during the user's in-flight toggle. So the mapping optimistically claimed "we synced 'done'" when cmd had actually only created with `status: "pending"`. Drift detector then saw `current === lastSyncedStatus` → no drift → no catch-up. **Fix**: `applyGroupCreateResult` now always sets `lastSyncedStatus: "idle"` (the truthful actual-create status), regardless of pending's `desiredStatus`. The "records desired pending status" test that pinned the buggy behavior was rewritten to assert the new correct behavior. Added regression test exercising the user-toggled-during-inflight scenario end-to-end.
- **Fix 3 (typed cmd-contract owner).** Created `extensions/lib/commander/cmd-bridge.ts` mirroring commander-v2's `task-registration/validate.ts` (CodeRabbit regex + ## Steps/## Tests/## References body sections). Wired into `commander-cli-client.ts:callTask` create path so child tasks fail-fast with typed `CmdContractError` before the subprocess instead of silent `task_registration_rejected` afterwards. 7 new contract tests; 35 tests across the four new/touched files green.
- **Fix 1 (status drift catch-up).** `executeGroupCreate` now accepts `getCurrentStatuses` and after `applyGroupCreateResult` populates mappings, fires `cmd task update <commanderId> --status <current>` for any newly mapped task whose status drifted from `lastSyncedStatus` during the ~8s in-flight window. 5 new tests + wired into both `tasks.ts` group:create call sites. Addresses the race where the user toggles during in-flight, sees "Commander sync pending", and is left with an orphaned child on the board.
- **Phase 3.0.1 (diagnostic).** Un-swallowed `syncToCommander.catch` and added file-based ENTER/SUCCESS/PARSE_FAILURE/THROW logging to `.commander/logs/pi-sync-debug.log`.
- **Phase 3.0 (atomicity).** `createTaskGroup` now throws when parent or any child create returns without `id`/`task_id` — converts silent partial success into loud failure with the actual cmd response in the error.
- **Phase 2 (constant unification).** Exported `MAX_INTENT_ATTEMPTS` from `lifecycle-intents.ts`; `commander-lifecycle-guard.ts` uses it; `commander-lifecycle.ts` renamed local `MAX_ATTEMPTS` → `IN_PROCESS_RETRY_LIMIT`.
- **Phase 1 (helper extraction).** `executeGroupCreate` extracted into `commander-sync.ts`; both duplicated tasks.ts lambdas reduced to one call each.

## Next Step

- **User verification (manual smoke test):** restart Pi; `tasks clear`; `tasks new-list "X" "Y"`; toggle task #1 twice; observe whether child task on board updates to "completed" (Fix 1 should make this work via the catch-up status-update path after the ~8s in-flight resolves). Check `.commander/logs/pi-sync-debug.log` for `executeGroupCreate CATCH_UP` lines.
- **If verified:** commit the slice and move `agent-pi-f8s9i` to `completed`. Move on to Fix 3b (expand cmd-bridge to cover `task update / claim / complete / fail / cancel` typed wrappers).
- **If not verified:** the diagnostic log will pinpoint whether the issue is upstream (race-condition timing different than modeled), downstream (`closeCommanderParentIfAllLocalTasksDone` fires before catch-up fires for the child), or commander-v2-side (project-pointer drift from `fd6ce08`).

## Blockers / Open Questions

- Out-of-scope by design (deferred to BACKLOG.md): N+1 latency in `createTaskGroup` (the 8.2s in-flight window — would require a real `cmd task add-group` op in commander-v2); `.commander/claims.json` rotation (1.2MB); project-pointer drift fix for `cmd` ↔ dashboard.

## Key Files

- `extensions/lib/commander/cmd-bridge.ts` (NEW — typed contract owner)
- `extensions/lib/commander/commander-cli-client.ts` (atomicity guard + cmd-bridge validator wiring)
- `extensions/lib/commander/commander-sync.ts` (`executeGroupCreate` + Fix 1 catch-up + diagnostic logging)
- `extensions/lib/commander/commander-lifecycle.ts` (`IN_PROCESS_RETRY_LIMIT` rename)
- `extensions/lib/commander/lifecycle-intents.ts` (`MAX_INTENT_ATTEMPTS` export)
- `extensions/commander-lifecycle-guard.ts` (imports shared constant)
- `extensions/tasks.ts` (`executeGroupCreate` call sites + un-swallowed catch)
- `extensions/__tests__/commander-sync-execute-group-create.test.ts` (4 helper-contract tests)
- `extensions/__tests__/commander-cli-client-atomicity.test.ts` (4 atomicity tests)
- `extensions/__tests__/commander-sync-status-catchup.test.ts` (5 Fix 1 tests)
- `extensions/__tests__/cmd-bridge.test.ts` (7 contract-owner tests)
- `extensions/__tests__/commander-lifecycle-unified-attempts.test.ts` (4 Phase 2 tests)
- `.commander/logs/pi-sync-debug.log` (runtime diagnostic file)

## Update Rules

- Replace stale state instead of appending history.
- Link to journal entries, plans, tasks, commits, or handoffs for historical detail.
- Do not include secrets, full diffs, noisy logs, or transcripts.
