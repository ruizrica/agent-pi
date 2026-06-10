# FEATURES.md — Shipped Feature Inventory

Use this file to preserve a plain-English map of shipped capabilities and where they live.

## Feature Index

| Feature | Status / Date | Entry Points | Verification | Follow-ups |
|---|---|---|---|---|
| Project Memory Pack | Implemented 2026-05-18 | `CLAUDE.md`, `STATE.md`, `journal/`, `BACKLOG.md`, `FEATURES.md`, `commands/setup.md`, `commands/handoff.md`, `skills/pi/SKILL.md`, `scripts/project-memory-hook.sh` | `yarn check:cmd-guidance`, `git diff --check`, hook syntax/dry-run | Consider running `scripts/install-project-memory-hooks.sh` when ready to activate post-commit capture. |
| Pi ↔ Commander task-sync hardening | Shipped 2026-05-19 | `extensions/tasks.ts` (`new-list`/`update-list`/`add`/`toggle`/`update` actions), `extensions/lib/tasks-*.ts` helpers, `CLAUDE.md` validation-card section | 255 vitest tests across 16 task/sync/cmd files; manual smoke per `STATE.md` Next Step | Background reaper for `test-only` cards (deferred). |
| Toolkit skill consolidation (pi side) | Shipped 2026-06-10 | `~/.pi/agent/settings.json` packages entry for agent-toolkit; `skills/.migrated/`, `skills/.retired/` quarantines | `pi config` shows agent-toolkit (user) > Skills with `[x] diagnose`, `[x] a2a-link` etc. | Delete quarantine dirs once toolkit canon is proven in daily use. |
| /onboard doc-pack command | Shipped 2026-06-10 | `commands/onboard.md` (delegates to toolkit `onboard.sh`) | Scratch + brownfield runs: 4-doc pack, scan manifest, `--absorb` backups, hook install | Run on real repos as needed. |
| a2a-link v2 bridge (pi side) | Shipped 2026-06-10 | `extensions/claude-link.ts` (`claude_send` tool, session-start inbox check), `extensions/claudemode-toggle.ts` (honest toggle) | Mailbox round-trip (msg-297) + `pi -p` sync BRIDGE-OK; TS transpile clean | Inbox parsing tracks cmd CLI output format (no `--json` support yet). |
| Doc-freshness guard (pi layer) | Shipped 2026-06-10 | `extensions/project-docs-guard.ts` | Runs toolkit `doc-sync.sh check` at session boundaries in doc-pack projects | — |

## Project Memory Pack

- **Status:** Implemented 2026-05-18
- **User value:** Gives fresh agents a repo-checked continuity system so setup, checkpoints, handoffs, shipped features, and deferred work are preserved without re-briefing every session.
- **Entry points:** `CLAUDE.md`, `STATE.md`, `journal/`, `BACKLOG.md`, `FEATURES.md`, `/setup`, `/handoff`, `/cycle-context`, `/compact-min`, `/save`, `/commit`, and the project-memory hook scripts.
- **Key decisions:** `/handoff` remains standalone; `/cycle-context` owns Project Memory Pack checkpoint/update-docs behavior and optional native compaction. Routine commits create local raw change summaries only; explicit milestones create durable draft milestone notes under `journal/milestones/` eligible for Obsidian/wiki ingestion after review.
- **Verification:** `yarn check:cmd-guidance`, `git diff --check`, shell syntax checks, routine hook dry-run, and forced milestone dry-run.
- **Follow-ups:** Install/chain hooks with `scripts/install-project-memory-hooks.sh` when the user wants automatic post-commit capture active in the current hooks path.

## Pi ↔ Commander task-sync hardening

- **Status:** Shipped 2026-05-19 (commits `9f7d0f4` → `bc2430e`, 11 commits total)
- **User value:** The Pi `tasks` tool now keeps the Commander board honest end-to-end. Mission briefs must be real (≥60 chars), editable mid-flight, and reflected on the parent card. Child progress, label edits, and un-toggles propagate to the board so the dashboard stops lying about state. Validation/scaffold work is detectable and label-tagged for hygiene.
- **Entry points:**
  - `tasks new-list` — now requires a ≥60-char mission brief, soft-warns on validation-scaffold-looking briefs with >1 children, accepts `test_only=true` to tag scaffolds.
  - `tasks update-list` — new action; refines list title/description and syncs to parent's `title` + `description` + `mission_brief`.
  - `tasks toggle` — fires `M/N complete: <text>` comment on parent when child goes to done; reopens parent if a done child is un-toggled.
  - `tasks update <id>` — syncs new label as `--title` to the Commander child instead of drifting silently.
  - `commander_task update` (via `CmdTaskUpdateRequest.mission_brief`) — Pi can now push mission-brief edits through.
- **Key decisions:**
  - Every imperative change in `tasks.ts` is driven by a pure helper in `lib/` (validators, diffs, gate predicates) — TDD-friendly, unit-testable independent of the extension runtime.
  - Validation-card prevention uses **soft warning + label convention**, not hard-block on `>N` children. False-positive cost of hard-block was too high (real work like "Test framework refactor" would have been rejected).
  - Child task descriptions are CodeRabbit-form wrappers synthesized at create time; updates sync `--title` only, not description, to avoid re-synthesis without user-visible benefit.
  - The 2026-05-19 dummy-card audit (5 cards where 2 would do) is anchored as a regression test in `tasks-test-list-detector.test.ts`.
- **Verification:** `npx vitest run` against the 16 task/sync/cmd test files in `extensions/__tests__/` (255 tests green). Board state confirmed via `cmd task show` on the cancelled validation cards. Pre-existing unrelated suite failures (send-email, dream-scheduler, etc.) are unchanged.
- **Follow-ups:**
  - Background reaper for `test-only` cards (intentionally deferred per `.context/todo-prevent-task-overcreation.md`).
  - Manual smoke test by user before `git push pi-dev` (CLAUDE.md push policy).

## Entry Template

```markdown
## <Feature Name>

- **Status:** Shipped YYYY-MM-DD
- **User value:** <What this enables.>
- **Entry points:** <Commands, skills, files, routes, or scripts.>
- **Key decisions:** <Brief rationale and links to journal/ADR/commit.>
- **Verification:** <Commands or manual checks used.>
- **Follow-ups:** <Backlog/task links or none.>
```

## Lifecycle

- Add a feature entry when work ships as a user-visible or agent-visible capability.
- Keep active execution state in cmd, not here.
- Keep in-flight status in `STATE.md`, not here.
- Keep session chronology in `journal/YYYY-MM-DD.md`, not here.
- For large architecture/process milestones, link to `journal/milestones/` and Obsidian/wiki records when reviewed.

## Rules

- Add entries only for shipped user-visible or agent-visible capabilities.
- Keep implementation details high-signal; link to files rather than copying code.
- Do not include secrets, full diffs, or transcript excerpts.
