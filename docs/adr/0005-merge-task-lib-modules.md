# Merge Prematurely Extracted Task Lib Modules into tasks.ts

Seven files in extensions/lib/ (tasks-brief-validator.ts 34 lines, tasks-confirm.ts 17 lines, tasks-list-metadata.ts 41 lines, tasks-progress-comment.ts 60 lines, tasks-test-list-detector.ts 48 lines, task-list-render.ts 205 lines, task-modal-render.ts 50 lines) are imported exclusively by tasks.ts. No other caller, no second adapter, no independent test surface. By the principle "one adapter = hypothetical seam; two adapters = real seam," these are hypothetical seams extracted before any real variation demanded it. Understanding the task lifecycle requires bouncing between 8 files. Several are trivially small (17 lines, 34 lines).

Inline tasks-brief-validator, tasks-confirm, tasks-list-metadata, tasks-progress-comment, tasks-test-list-detector, and task-modal-render back into tasks.ts. Keep task-list-render.ts separate only because it has independent importers (debug-capture.ts, agent-team.ts, pacifico.ts).

The seam should be earned, not assumed. These files were extracted for organizational neatness, not because anything varies across them. Merging eliminates navigation friction (read one file, not eight) with no loss of testability — tests already go through tasks.ts.

## Considered Options

1. **Keep separate for future flexibility** — Rejected because YAGNI; extract when the second caller appears.
2. **Merge all 7 including task-list-render** — Rejected because task-list-render already has 3 independent callers, earning its seam.

## Consequences

tasks.ts grows but becomes self-contained for task lifecycle logic. If a second caller emerges for any merged function, that's the moment to extract it again.
