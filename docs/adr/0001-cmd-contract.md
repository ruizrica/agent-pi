# ADR 0001 — Pi ↔ commander-v2 (cmd CLI) Contract

- **Status:** Accepted
- **Date:** 2026-05-19
- **Owners:** Ricardo Ruiz (agent-pi + commander-v2)
- **Mirrored in:** `commander-v2` should reference this ADR from its own `docs/` and update when the contract drifts.

## Context

agent-pi spawns the `cmd` CLI (commander-v2) as a subprocess from several extension code paths (task creation, lifecycle reconcile, housekeep, mailbox). The two repos ship and evolve independently. There is no shared package, no schema registry, and no CI that exercises both together. Two unpaired commander-v2 changes broke Pi in the last 72 hours:

1. **Commit `18122e8` (2026-05-16) — CodeRabbit-style child-task validator.** commander-v2 began rejecting `cmd task add --parent <id>` calls whose `--description` did not match `/^In <path> around lines N-N, ...; ...$/i` and whose `--body` did not contain `## Steps`, `## Tests`, `## References`. Pi's `commander-sync.ts` was emitting plain prose descriptions. The reject path returned `{ error: "task_registration_rejected" }` with an empty `task_ids` array. Pi's success-path code-read `id` from the JSON, found `undefined`, and silently dropped the mapping. Net effect: tasks vanished from the dashboard for **62 hours** before the symptom was attributed to a contract change.

2. **Commit `fd6ce08` (2026-05-17) — CLI project resolution made `projectAware: false`.** Previously the CLI honored the dashboard's `state.currentProjectId` and routed bd calls there. After fd6ce08, `cli/cmd/src/bridge/tasks.ts:46` passes `{ store, projectAware: false }` to `tasksAdapterSelector`, so the CLI walks up from `process.cwd()` to find `.beads/` and writes there. The dashboard renderer continues to read `state.currentProjectId` from `~/.commander/mock-state.json`. When the two diverge (Pi runs in `agent-pi`'s cwd, dashboard last-switched to `commander-v2`), tasks land in bd but the dashboard board stays empty. **Cost Ricardo a full day on 2026-05-19.**

Neither failure was caught at compile time, in tests, or in CI. Both manifested as silent data loss from the user's perspective.

## Decision

Maintain a checked-in **contract surface** in this repo that:

1. Names every cmd operation Pi depends on, with file:line references in both repos.
2. Documents the request and response shapes Pi assumes.
3. Names the failure mode when each shape drifts.
4. Is referenced by an integration test (see `extensions/__tests__/cmd-contract-integration.test.ts`) and by Pi's typed bridge (`extensions/lib/commander/cmd-bridge.ts`).

When commander-v2 changes a contract surface, the change is paired with:

- Updating the **commander-v2 side** of this ADR's reference table.
- Updating Pi's typed bridge if the shape changed.
- Updating the integration test if a new operation is introduced.
- Running the integration test against the local `cmd` binary before merging either side.

## Contract Surface

### Operation: `cmd task add` (root task)

| Side | Location |
|---|---|
| commander-v2 (CLI command) | `cli/cmd/src/commands/task.add.ts` |
| commander-v2 (validator) | `cli/cmd/src/task-registration/validate.ts` |
| agent-pi (caller) | `extensions/lib/commander/commander-cli-client.ts:160` (`callTask` → `create`) |
| agent-pi (typed bridge) | `extensions/lib/commander/cmd-bridge.ts` |

**Success JSON shape (commander-v2 → Pi):**

```json
{
  "id": 1234,
  "bead_id": "cmd-abc123",
  "description": "...",
  "title": "...",
  "primary_file": "...",
  "lifecycle_owner": "self",
  "status": "pending",
  "priority": 2,
  "identity": { "...": "..." },
  "synced": "..."
}
```

Pi reads `id` and `bead_id`. Loss of either → silent task-mapping drop.

**Rejection JSON shape (commander-v2 → Pi):**

```json
{
  "error": "task_registration_rejected" | "wrapper_task_blocked",
  "task_registration_required": true,
  "errors": [ "<violation>", ... ],
  "suggested_mailbox": "...",
  "suggested_comment": "..."
}
```

Pi distinguishes success vs rejection by presence of `error`. Loss of the `error` field on rejection → Pi treats a failure as success.

### Operation: `cmd task add --parent <id>` (child task) — validator surface

| Side | Location |
|---|---|
| commander-v2 (regex) | `cli/cmd/src/task-registration/validate.ts:11` (`CODERABBIT_DESCRIPTION_RE`) |
| commander-v2 (body sections) | `cli/cmd/src/task-registration/validate.ts:50-90` |
| agent-pi (mirrored regex) | `extensions/lib/commander/cmd-bridge.ts:19` (`CODERABBIT_DESCRIPTION_RE`) |
| agent-pi (mirrored sections) | `extensions/lib/commander/cmd-bridge.ts:25` (`REQUIRED_BODY_SECTIONS`) |

**Failure mode:** commander-v2 tightens the regex or adds a required body section without Pi updating its mirror. Pi sends invalid payloads, gets `task_registration_rejected`, drops mappings silently. **This is the 2026-05-16 incident.** Detection: Pi's `validateChildTaskPayload` runs locally first and throws `CmdContractError` before the subprocess — but only if Pi's mirror is current.

### Operation: cwd-resolved project pointer

| Side | Location |
|---|---|
| commander-v2 (CLI resolves cwd) | `cli/cmd/src/bridge/tasks.ts:46` (`projectAware: false`) |
| commander-v2 (selector) | `host/modules/tasks/select.ts:40` |
| commander-v2 (dashboard reads pointer) | `host/storage/mockState.ts` (`state.currentProjectId` field) |
| agent-pi (reconcile helper) | `extensions/lib/commander/project-pointer-sync.ts` |
| agent-pi (wired into session_start) | `extensions/commander-lifecycle-guard.ts:230` |

**Failure mode:** commander-v2 toggles between cwd-resolution and dashboard-pointer-resolution without Pi calling `cmd project switch` to align them. Tasks land in bd but the dashboard board stays empty. **This is the 2026-05-17 incident.** Detection: Pi's `alignPointerOnSessionStart` runs on every session_start, reads `~/.commander/mock-state.json:currentProjectId`, compares against `cmd whoami --json` `project.id`, and issues `cmd project switch <id>` when they differ.

### Operation: `cmd whoami --json`

| Side | Location |
|---|---|
| commander-v2 (CLI command) | `cli/cmd/src/commands/whoami.ts` |
| agent-pi (caller) | `extensions/lib/commander/project-pointer-sync.ts` |

**Success JSON shape:**

```json
{
  "agent": "...",
  "directory": "/abs/path",
  "project": { "id": 809, "name": "agent-pi" },
  "git": { "branch": "...", "commit": "..." }
}
```

Pi reads `project.id` and `project.name`. Loss of `project.id` → pointer sync silently skips (treated as "cwd has no resolvable project").

### Operation: `cmd project switch <id>`

| Side | Location |
|---|---|
| commander-v2 (adapter) | `host/modules/projects/adapter.json.ts:120` |
| commander-v2 (writes mock-state) | `host/modules/projects/adapter.json.ts:127` (`state.currentProjectId = req.id`) |
| agent-pi (caller) | `extensions/lib/commander/project-pointer-sync.ts` |

**Success shape:** `{ "id": <int>, "status": "switched", "name": "...", "workingDirectory": "..." }` or `{ "id": <int>, "status": "not_found" }`.

### Operation: identity flags on every CLI call

| Side | Location |
|---|---|
| commander-v2 (guide) | `cmd guide agent` (every write requires `--runtime <name> --model <name>`) |
| agent-pi (injection) | `extensions/lib/commander/commander-cli-client.ts:104` (`identity flags inserted at position 2`) |

**Failure mode:** commander-v2 changes identity flag names or position. Pi's writes show as "unknown" on the dashboard. Detection: covered by `extensions/__tests__/commander-cli-client.test.ts:38` (probe argv assertion).

## Failure-mode summary

| Drift kind | Symptom | Detection |
|---|---|---|
| CodeRabbit regex tightens | `task_registration_rejected`, empty `id`, lost mappings | Pi mirror must be re-synced; `validateChildTaskPayload` throws `CmdContractError` locally |
| Required body section added | same as above | same as above |
| Success JSON drops `id` | Pi reads `undefined`, drops mapping silently | Integration test asserts `id` is a number |
| Rejection JSON drops `error` | Pi treats failure as success | Integration test asserts `error` is present on a forced-fail payload |
| CLI flips `projectAware` | Tasks land in wrong project | `alignPointerOnSessionStart` reconciles on every session_start |
| Identity flag rename | Writes show "unknown" assignee | Probe argv assertion fails |

## Incident log

| Date | commander-v2 commit | Symptom | Repaired by |
|---|---|---|---|
| 2026-05-16 | `18122e8` | Child-task descriptions rejected; mappings silently dropped for 62h | `extensions/lib/commander/cmd-bridge.ts` (typed contract owner) |
| 2026-05-17 | `fd6ce08` | Tasks vanish from dashboard board; cost a full day on 2026-05-19 | `extensions/lib/commander/project-pointer-sync.ts` (this ADR) |

## Review cadence

- Each commander-v2 release: re-run `extensions/__tests__/cmd-contract-integration.test.ts` against the local `cmd` binary.
- Each Pi release: same.
- When opening a commander-v2 PR that touches `cli/cmd/src/commands/task.*`, `cli/cmd/src/task-registration/*`, or `host/modules/projects/*`: explicitly check whether this ADR's surface table needs to follow.
