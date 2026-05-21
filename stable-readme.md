# Stable Checkpoint Documentation

## Checkpoint Information

- **Tag:** `stable-20260520-212244`
- **Branch:** `checkpoint/stable-20260520-212244`
- **Commit:** `db759233522330ca841ba0664970c4295fcf1250`
- **Short SHA:** `db75923`
- **Timestamp:** 2026-05-20 21:22:44 UTC
- **Created from branch:** `main`
- **Total files:** 752
- **Previous stable:** `stable-20260404-195135` (~6 weeks prior)

This checkpoint marks the end of the 2026-05-20 session — a 17-commit slice covering Pi ↔ Commander task-sync hardening, validation-card prevention, lifecycle-guard cleanup, and the MCP-tool-surface migration off the agent-facing prompts.

## How to Restore This Checkpoint

### View the checkpoint state (detached HEAD)
```bash
git checkout stable-20260520-212244
```

### Start a new feature branch from the checkpoint
```bash
git checkout -b feature/from-stable stable-20260520-212244
```

### Restore and continue development on the checkpoint branch
```bash
git checkout checkpoint/stable-20260520-212244
```

### Compare current main against the checkpoint
```bash
git diff stable-20260520-212244..main
```

### See what changed in the checkpoint's most recent commit
```bash
git show stable-20260520-212244
```

### Merge the checkpoint into another branch
```bash
git checkout target-branch
git merge stable-20260520-212244
```

## Project State at Checkpoint

### Recent commit history (this session — 17 commits)

```
db75923 refactor(prompts): migrate agent-facing surface off removed MCP commander_* tools
d9f355c refactor(lifecycle-guard): remove observability surface, keep silent recovery
7572703 fix(lifecycle-guard): stop auto-switching the dashboard's project pointer
2bc5cf4 chore(board-viewer): remove deprecated viewer surface
90fbaf7 docs(memory-pack): refresh STATE/journal/FEATURES for 2026-05-19 task-sync slice
bc2430e docs(claude): document the validation-card convention (slice E)
8a1f972 feat(tasks): test_only mode stamps cards with cleanup-candidate label (slice D)
4936b16 feat(tasks): soft warning when new-list looks like over-created validation (slice C)
39993f8 feat(tasks): pure heuristic for validation-style task lists (slice B)
c0d371d chore: clear pre-existing working-tree noise
1b17210 feat(tasks): reopen Commander parent when a done child gets un-toggled (slice #5)
aad1de8 feat(tasks): sync child text edits to Commander on tasks update (slice #3)
860e674 feat(tasks): add update-list action to edit list title/brief mid-flight (slice #2)
3c2e6db feat(tasks): post mid-progress comment to Commander parent on child→done (slice #4)
8a3aa0b feat(tasks): raise mission brief minimum to 60 chars (slice #6)
9f7d0f4 feat(tasks): require mission brief on new-list (slice #1)
4a8850c fix(commander-sync): end-to-end remediation of toggle→board sync + cross-repo contract owner
```

### Capabilities established by this checkpoint

| Capability | Surface | Why it matters |
|---|---|---|
| ≥60-char mission brief gate | `tasks new-list` | Stops thin briefs from polluting the Commander parent card |
| `tasks update-list` action | `tasks` tool + cmd-bridge `mission_brief` on update | Edit list title/brief mid-flight; syncs to parent card |
| Parent mid-progress comments | `tasks toggle` → `cmd task comment` | Dashboard's mission card gets visible M/N progress |
| Child text edit sync | `tasks update` → `cmd task update --title` | Labels stop drifting silently |
| Parent reopen on un-toggle | `tasks toggle` (done → idle/inprogress) | Mission-complete close is now reversible |
| `test_only=true` mode | `tasks new-list`, `tasks add` | Stamps validation scaffolds with `test-only` label as audit hook |
| Validation-card soft warning | `tasks new-list` (when brief looks test-y + >1 children) | Nudges agents away from over-creating dummy cards |
| Silent lifecycle recovery | `commander-lifecycle-guard` | Reconciler + reaper still run; noisy notifications removed |
| Agent-facing MCP surface | mode-prompts, agent-team, agent-chain, tool-caller | Migrated off removed `commander_*` MCP tools to `tasks` + bash + cmd CLI |

### Remote repositories

```
origin       https://github.com/ruizrica/agent-pi.git    (public)
pi-dev       https://github.com/ruizrica/pi-dev.git      (private — see CLAUDE.md push policy)
```

### Diff against previous stable (`stable-20260404-195135`, ~6 weeks)

```
626 files changed, 94,885 insertions(+), 19,175 deletions(-)
```

This is a substantial delta covering the Commander lifecycle consolidation, the cmd-bridge contract owner work, the parent ↔ children link strengthening, and the validation-card prevention. See `journal/2026-04-*` through `journal/2026-05-20.md` for the full chronology.

### Test surface at checkpoint

- 16 task/sync/cmd test files, 255+ tests green
- Pre-existing unrelated baseline failures (send-email, dream-scheduler, learn, interfaze demos, chrome-devtools, etc.) — untouched and unchanged from prior baseline

### Repo layout

```
extensions/                — Pi extension TypeScript sources
extensions/__tests__/      — vitest test suite
extensions/lib/            — pure helpers (validators, diff helpers, sync state)
extensions/lib/commander/  — cmd CLI adapter + sync state + lifecycle intents
journal/                   — dated session logs
journal/milestones/        — durable wiki-eligible raw notes
docs/adr/                  — Architecture Decision Records
.context/                  — gitignored working docs (todo.md, handoffs, plans)
scripts/                   — guard wrappers (e.g. scripts/cmd)
agents/                    — agent configurations
prompts/                   — custom prompt templates
skills/                    — agent skills
```

### Environment

No tracked `.env` file. `.env.example` is not present at the repo root. Environment configuration is managed per-extension in their own subfolders (see `.gitignore` for the per-folder `.pacifico.env` etc.).

### Dependencies

`package.json` at the repo root is minimal (no dependencies block). The main TypeScript work lives in `extensions/package.json` and similar per-extension manifests.

## Working with This Checkpoint

### Compare with current state
```bash
git diff stable-20260520-212244..HEAD
```

### Inspect the tag itself
```bash
git show stable-20260520-212244
```

### List all stable checkpoints
```bash
git tag -l "stable-*" | sort -V
```

## Push to Remote (REQUIRES EXPLICIT USER AUTHORIZATION)

Per `CLAUDE.md` Git Operations policy, **DO NOT push without explicit user confirmation**. When authorized:

```bash
# To the PRIVATE remote (pi-dev — full content allowed)
git push pi-dev stable-20260520-212244
git push pi-dev checkpoint/stable-20260520-212244

# DO NOT push to origin (public) without a visibility check first:
#   gh api repos/ruizrica/agent-pi --jq '.visibility'
# and verifying no private content (skills/private/, extensions/private/, commands/private/) is included.
```

## Recovery Scenarios

### "I broke main, restore me to stable"

```bash
git checkout checkpoint/stable-20260520-212244
git checkout -b recovery/$(date +%Y%m%d)
# verify state, then either rename to main or merge selectively
```

### "I need to see the exact code as of this checkpoint"

```bash
git checkout stable-20260520-212244   # detached HEAD — read-only
# inspect, run tests, etc.
git checkout main                      # return to main
```

### "I want to start a new feature from this stable point"

```bash
git checkout -b feature/new-thing stable-20260520-212244
```

## Summary

This stable checkpoint captures a tested, working state at the end of the 2026-05-20 session. The 17 commits in this session strengthened the Pi ↔ Commander task-sync surface, added validation-card prevention, and cleaned up the lifecycle-guard noise. All 255+ relevant tests pass; the working tree is clean; no remote pushes have happened from this session.

The companion handoff docs on the desktop (`2026-05-20-handoff-commander-cross-project-dashboard.md` + `2026-05-20-plan-commander-centralization.md`) describe the next-up work (centralize bd at `~/.commander/beads.db` + ship cross-project default for the dashboard), which lives in the `commander-v2` repo, not this one.

---
*Stable checkpoint created via `/toolkit:stable` on 2026-05-20.*
