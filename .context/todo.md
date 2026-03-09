# Implementation Plan

- [x] Review current `/reports` persistence, where entries are written, and current size limits/constraints.
- [x] Introduce a SQLite-backed report index service behind the existing report-index API so `/reports` keeps one durable store instead of a growing JSON file.
- [x] Add retention controls: prune entries older than a configurable cutoff and cap total rows, with pruning applied on write/load.
- [x] Update report producers/viewers (`show_plan`, `show_report`, `show_spec`, `/reports`) to read/write through the shared storage layer without changing the UI behavior.
- [x] Verify by creating/loading sample entries, confirming `/reports` still renders, and checking old entries are pruned as expected.
- [x] Ensure this is integreated in every report going forward.

## Notes
- Prefer SQLite over raw filesystem JSON because it gives a single source of truth, predictable querying/sorting, and cleaner future filtering/search.
- Keep the current JSON index only as a migration source/fallback if needed; goal is minimal UI churn.
- Retention should be date-based first, with an additional hard cap as a safety valve.
