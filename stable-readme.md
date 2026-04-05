# Stable Checkpoint Documentation

## Checkpoint Information
- **Tag:** `stable-20260404-195135`
- **Branch:** `checkpoint/stable-20260404-195135`
- **Commit:** `fb5fae0`
- **Timestamp:** 2026-04-04 19:51:35
- **Created from branch:** main
- **Total files:** 368

## What This Checkpoint Contains

This checkpoint represents a stable state after a major redundancy reduction and architecture improvement effort:

### 1. Shared Viewer Server Factory
- Created `extensions/lib/viewer-server.ts` (197 lines)
- Refactored all 11 viewer extensions to use shared `createViewerServer()` factory
- Eliminated ~486 lines of duplicated HTTP server boilerplate
- Full refactors: board-viewer, reports-viewer, security-report, plan-viewer, completion-report, file-viewer, research-viewer, cleanup-viewer, spec-viewer
- Partial refactors (openBrowser only): sounds, web-chat

### 2. Builder Agent Consolidation
- All 9 builder variant models added to `agents/models.json`
- Dynamic `builder-*` resolution in `extensions/lib/agent-defs.ts`
- 9 builder-*.md files marked deprecated (kept for backward compat)

### 3. Security File Rename
- `secure.*` renamed to `vuln-scanner.*` for clarity
- Old files converted to backward-compatible re-export stubs
- Distinguishing comments added to runtime security files

### 4. Mermaid Diagram Support
- Added mermaid.js rendering to plan-viewer, spec-viewer, completion-report, standalone-export
- Dark theme with readable text (`theme: 'dark'` + custom themeVariables)
- Interactive toolbar: zoom, fullscreen, SVG download

## Recent Commit History

```
fb5fae0 fix: use mermaid dark theme properly instead of CSS/JS hacks
9b8b7dc fix: patch mermaid internal SVG <style> for outline nodes + light text
f1586ed fix: force outline-only mermaid nodes via JS post-render DOM mutation
4e31a1d fix: mermaid diagrams use outline-only nodes with light text on dark bg
ba37641 fix: force dark text in mermaid nodes with CSS !important overrides
0b6948f fix: make mermaid diagram text dark and readable on light blue nodes
7eb9d6d fix: re-export default factory from deprecated secure.ts stub
ca69bd4 fix: add mermaid diagram rendering to completion report viewer
307bc4a chore: add Claude settings
fdcd11b feat: add mermaid diagram support to plan and spec viewers
76ece04 refactor: rename secure.* to vuln-scanner.* for clarity
2727268 refactor: consolidate 9 builder variants with dynamic resolution
fa53f31 refactor: migrate 11 viewers to shared viewer-server.ts factory
31e47a7 feat: add shared viewer server factory (viewer-server.ts)
ed11207 chore: remove dead code — plan-viewer libs and disabled agent-memory skill
```

## How to Restore This Checkpoint

### To view this checkpoint:
```bash
git checkout stable-20260404-195135
```

### To create a new branch from this checkpoint:
```bash
git checkout -b feature/new-branch stable-20260404-195135
```

### To restore and continue development:
```bash
git checkout checkpoint/stable-20260404-195135
```

## Project Structure

### Top-Level
```
agents/          — Agent definition .md files + models.json
extensions/      — Pi extension modules (viewers, tools, commands)
extensions/lib/  — Shared libraries (HTML generators, engines, utilities)
extensions/__tests__/ — Test files
assets/          — Static assets (logo, icons)
.context/        — Session context and plans
```

### Key Extension Files
```
extensions/
  board-viewer.ts          — Task board Kanban viewer
  cleanup-viewer.ts        — Disk cleanup viewer
  completion-report.ts     — Git diff completion report viewer
  file-viewer.ts           — File viewer/editor
  plan-viewer.ts           — Markdown plan viewer with approval workflow
  reports-viewer.ts        — Report browser
  research-viewer.ts       — Research session viewer
  security-guard.ts        — Runtime tool-call protection
  security-report.ts       — Security scan report viewer
  sounds.ts                — Sound browser and config
  spec-viewer.ts           — Multi-page spec viewer
  vuln-scanner.ts          — AI project vulnerability scanner
  web-chat.ts              — LAN-accessible web chat interface
  subagent-widget.ts       — Subagent spawn and management

extensions/lib/
  viewer-server.ts         — Shared HTTP server factory (NEW)
  agent-defs.ts            — Agent definition loader + dynamic builder resolution
  vuln-scanner-engine.ts   — Vulnerability detection engine (RENAMED)
  vuln-scanner-installer.ts — Protection file generator (RENAMED)
  security-engine.ts       — Runtime security patterns
  security-history.ts      — Threat history tracking
  plan-viewer-html.ts      — Plan viewer HTML template (with mermaid)
  spec-viewer-html.ts      — Spec viewer HTML template (with mermaid)
  completion-report-html.ts — Completion report HTML template (with mermaid)
  viewer-standalone-export.ts — Standalone HTML export (with mermaid)
```

## Working with This Checkpoint

### To compare with current state:
```bash
git diff stable-20260404-195135..HEAD
```

### To see what changed in this checkpoint:
```bash
git show stable-20260404-195135
```

### To merge this checkpoint into another branch:
```bash
git checkout target-branch
git merge stable-20260404-195135
```

## Future Work Identified

- Extract `lib/subagent-spawn.ts` (shared spawn logic — ~500 line savings)
- Break up monster functions (`tasks.ts:execute` ~600 lines, `subagent-widget.ts:spawnAgent` ~400 lines)
- Phase 4: shared HTML base across 11 `*-html.ts` templates
- Scout/Ranger agent merger
- YAML config dedup (`pipeline-team.yaml` subset of `agent-chain.yaml`)
- Delete deprecated `builder-*.md` files after verification period
- Delete `sr-dev.md.bak` and `test-review-target/`

## Push to Remote

If you have a remote repository configured:

```bash
# Push the tag
git push origin stable-20260404-195135

# Push the checkpoint branch
git push origin checkpoint/stable-20260404-195135
```

---
*Stable checkpoint created 2026-04-04 at 19:51:35 from commit fb5fae0 on branch main.*
