# BACKLOG.md — Deferred Work

This file captures future work and ideas that are not yet active cmd tasks. Once work is materialized into cmd, use cmd as the executable source of truth and link the task here if useful.

## Now / Next

| Priority | Item | Why | Links |
|---|---|---|---|
| P1 | _Add item_ | _Reason_ | _Plan/task/file_ |

## Later

| Priority | Item | Why | Links |
|---|---|---|---|
| P2 | commander-v2 sidecar self-rotation | `claims.json.audit` + `comments.json.byBead[*]` grow unbounded (1.2 MB / 1035 audit rows on agent-pi as of 2026-05-19). `cmd-writer.log` already self-rotates in `commander-v2/cli/cmd/src/bridge/diag.ts:49` — sidecars should follow the same pattern (10 MB rotation, retain last N rows, atomic write). Pi-side rotation works as a stopgap but Pi shouldn't know commander-v2's sidecar schema long-term. | commander-v2 `host/modules/tasks/adapter.bd/claims.ts`, `comments.ts`; pattern: `commander-v2/cli/cmd/src/bridge/diag.ts` |

## Parking Lot

- _Ideas that need shaping before they become tasks._
- **Audit archival before trim**: when commander-v2 (or the Pi stopgap) discards old `claims.json.audit` rows, write them to `.commander/archive/claims-audit-YYYY-MM-DD.json` first so forensic history survives rotation. Only build if a real forensic need surfaces.
- **Wire `scripts/rotate-commander-artifacts.mjs` into `commander-lifecycle-guard.ts` session_start**: currently manual-only at a 5 MB threshold. Auto-rotation silently discards audit rows, which is a behavior change vs. commander-v2's current "never delete" semantics — confirm acceptable cadence first.

## Lifecycle

- Capture ideas and deferred follow-ups here only while they are not active executable work.
- When an item becomes executable, create/claim a cmd task and link or remove the backlog entry.
- cmd remains the source of truth for active status, ownership, and completion.
- When a completed item ships as a capability, move the durable description to `FEATURES.md`.
- When a completed item is a large architecture/process milestone, create or review a `journal/milestones/` note for possible Obsidian ingestion.

## Rules

- Do not duplicate active cmd task details here.
- Keep entries short and decision-oriented.
- Move shipped or completed capabilities to `FEATURES.md` when appropriate.
