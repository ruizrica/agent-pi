# Extension Reference

Complete reference for all 28 agent extensions. Each extension is a TypeScript file in `agent/extensions/` that exports a default function receiving the Pi `ExtensionAPI`.

Extensions are loaded via the `packages` array in `agent/settings.json`.

---

## Table of Contents

- [Core UI](#core-ui)
  - [agent-banner](#agent-banner)
  - [footer](#footer)
  - [agent-nav](#agent-nav)
  - [theme-cycler](#theme-cycler)
  - [escape-cancel](#escape-cancel)
- [Task Management](#task-management)
  - [tasks](#tasks)
  - [commander-mcp](#commander-mcp)
  - [commander-tracker](#commander-tracker)
- [Operational Modes](#operational-modes)
  - [mode-cycler](#mode-cycler)
- [Multi-Agent Orchestration](#multi-agent-orchestration)
  - [agent-team](#agent-team)
  - [agent-chain](#agent-chain)
  - [pipeline-team](#pipeline-team)
  - [subagent-widget](#subagent-widget)
  - [toolkit-commands](#toolkit-commands)
- [Security](#security)
  - [security-guard](#security-guard)
  - [secure](#secure)
  - [message-integrity-guard](#message-integrity-guard)
- [Viewers & Reports](#viewers--reports)
  - [plan-viewer](#plan-viewer)
  - [completion-report](#completion-report)
  - [spec-viewer](#spec-viewer)
  - [file-viewer](#file-viewer)
  - [reports-viewer](#reports-viewer)
- [Developer Tools](#developer-tools)
  - [debug-capture](#debug-capture)
  - [web-test](#web-test)
  - [tool-registry](#tool-registry)
  - [tool-search](#tool-search)
  - [tool-caller](#tool-caller)
  - [lean-tools](#lean-tools)
- [Session & Context](#session--context)
  - [memory-cycle](#memory-cycle)
  - [session-replay](#session-replay)
  - [system-select](#system-select)
  - [user-question](#user-question)

---

## Core UI

### agent-banner

ASCII art banner displayed above the editor on session start. Auto-hides on first user input.

| Property | Value |
|----------|-------|
| **File** | `agent-banner.ts` (90 lines) |
| **Tools** | — |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | `session_switch` |
| **Depends on** | `lib/themeMap.ts` |

**Behavior:** Reads art from `~/Desktop/agent.txt` or uses an embedded default. Re-displays on `/new` (session switch). Theme-aware coloring via `applyExtensionDefaults`.

---

### footer

Status bar showing model name, context usage percentage, and working directory.

| Property | Value |
|----------|-------|
| **File** | `footer.ts` (88 lines) |
| **Tools** | — |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/themeMap.ts`, `lib/context-gate.ts` |

**Behavior:** Displays a compact footer widget. Shows context usage warnings at high percentages. The model name is abbreviated (e.g., "Claude 4 Opus" → "opus 4"). Context compaction is handled by Pi's core framework.

---

### agent-nav

Shared F-key navigation for agent widgets (chain, team, pipeline).

| Property | Value |
|----------|-------|
| **File** | `agent-nav.ts` (28 lines) |
| **Tools** | — |
| **Commands** | — |
| **Shortcuts** | F1 (prev), F2 (next), F3 (detail), F4 (exit) |
| **Hooks** | — |
| **Depends on** | — |

**Behavior:** Dispatches F1-F4 to the first active `NavProvider` registered on `globalThis.__piNavProviders`. Used by agent-team, agent-chain, and pipeline-team to enable keyboard navigation of their grid/list widgets.

---

### theme-cycler

Cycles through installed themes with Ctrl+T.

| Property | Value |
|----------|-------|
| **File** | `theme-cycler.ts` (187 lines) |
| **Tools** | — |
| **Commands** | `/theme [name]` |
| **Shortcuts** | Ctrl+T (next), Ctrl+Shift+T (prev) |
| **Hooks** | — |
| **Depends on** | `lib/themeMap.ts`, `lib/persist-theme.ts` |

**Behavior:** Scans `agent/themes/` for JSON theme files. Ctrl+T cycles forward, Ctrl+Shift+T cycles backward. `/theme <name>` jumps to a specific theme. Selection persists to `settings.json`.

---

### escape-cancel

Double-tap ESC cancels all running operations.

| Property | Value |
|----------|-------|
| **File** | `escape-cancel.ts` (146 lines) |
| **Tools** | — |
| **Commands** | — |
| **Shortcuts** | ESC ESC (within 400ms) |
| **Hooks** | `session_switch` |
| **Depends on** | — |

**Behavior:** Detects two ESC presses within 400ms. Cancels: main agent stream, all subagents, running chain processes, pipeline processes, and team agent processes. Uses `globalThis` functions exposed by other extensions.

---

## Task Management

### tasks

Task discipline system that gates agent tools until tasks are defined.

| Property | Value |
|----------|-------|
| **File** | `tasks.ts` (872 lines) |
| **Tools** | `tasks` (actions: new-list, add, toggle, remove, update, list, clear) |
| **Commands** | `/tasks` |
| **Shortcuts** | — |
| **Hooks** | `tool_call`, `session_switch` |
| **Depends on** | `lib/commander-sync.ts`, `lib/tasks-confirm.ts`, `lib/task-list-render.ts`, `lib/commander-ready.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Behavior:** The agent MUST call `tasks add` before any other tools work. Three-state lifecycle: idle → inprogress → done. Provides a prominent widget showing the current task. The `tool_call` hook blocks non-task tools until tasks exist. Syncs with Commander when available.

**Operations:**
- `new-list` — Start a fresh task list with title and description
- `add` — Add one or multiple tasks (supports `text` or `texts[]`)
- `toggle` — Cycle task state: idle → inprogress → done
- `remove` — Remove a task by ID
- `update` — Update task text by ID
- `list` — Show all tasks
- `clear` — Wipe all tasks (with confirmation)

---

### commander-mcp

Bridge that exposes Commander MCP tools as native Pi tools.

| Property | Value |
|----------|-------|
| **File** | `commander-mcp.ts` (377 lines) |
| **Tools** | `commander_task`, `commander_session`, `commander_workflow`, `commander_spec`, `commander_jira`, `commander_mailbox`, `commander_orchestration`, `commander_dependency` (8 tools, dynamically registered) |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | `context` |
| **Depends on** | `lib/mcp-client.ts`, `lib/commander-ready.ts` |

**Behavior:** Spawns a Commander MCP server as a subprocess and proxies JSON-RPC calls over stdio. Exposes task management, session management, workflow docs, spec management, Jira integration, inter-agent messaging, agent orchestration, and dependency graph tools.

---

### commander-tracker

Reconciles local task state with Commander and retries failed sync operations.

| Property | Value |
|----------|-------|
| **File** | `commander-tracker.ts` (138 lines) |
| **Tools** | — |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/commander-tracker.ts`, `lib/commander-sync.ts` |

**Behavior:** Activates when Commander becomes available. Runs reconciliation every 15 seconds and heartbeat every 30 seconds. Retries any failed Commander sync operations from the tasks extension.

---

## Operational Modes

### mode-cycler

Cycles operational modes via Shift+Tab and injects mode-specific system prompts.

| Property | Value |
|----------|-------|
| **File** | `mode-cycler.ts` (225 lines) |
| **Tools** | `set_mode` |
| **Commands** | `/mode [name]` |
| **Shortcuts** | Shift+Tab |
| **Hooks** | `before_agent_start`, `session_switch` |
| **Depends on** | `lib/mode-cycler-logic.ts`, `lib/mode-prompts.ts`, `agent-banner.ts` |

**Modes:**
- **NORMAL** — Standard coding assistant, no additional constraints
- **PLAN** — Plan-first workflow: analyze → plan → show_plan → approve → implement → show_report
- **SPEC** — Spec-driven development: shape → requirements → tasks
- **TEAM** — Dispatcher mode, primary agent delegates via `dispatch_agent`
- **CHAIN** — Sequential pipeline via `run_chain`
- **PIPELINE** — 5-phase hybrid with `advance_phase` and `dispatch_agents`

The `before_agent_start` hook injects the appropriate system prompt. The `set_mode` tool allows the LLM to programmatically switch modes.

---

## Multi-Agent Orchestration

### agent-team

Dispatcher-only orchestrator with specialist agents and grid dashboard.

| Property | Value |
|----------|-------|
| **File** | `agent-team.ts` (1,411 lines) |
| **Tools** | `dispatch_agent` |
| **Commands** | `/agents-team`, `/agents-list`, `/agents-grid N`, `/agents-clear` |
| **Shortcuts** | Alt+G (toggle compact/expanded) |
| **Hooks** | `before_agent_start`, `session_switch` |
| **Depends on** | `lib/agent-defs.ts`, `lib/toolkit-cli.ts`, `lib/ui-helpers.ts`, `lib/context-budget.ts`, `lib/commander-prompt.ts`, `lib/commander-lifecycle.ts`, `lib/task-list-render.ts`, `lib/subagent-render.ts`, `lib/pipeline-render.ts`, `lib/themeMap.ts` |

**Behavior:** The primary Pi agent has NO codebase tools — it can ONLY delegate work to specialist agents via the `dispatch_agent` tool. Each specialist maintains its own Pi session for cross-invocation memory. Teams are defined in `.pi/agents/teams.yaml`. On boot, a select dialog lets you pick which team to work with.

**Grid Dashboard:** Live TUI widget showing agent status cards in a configurable grid layout. Each card shows: agent name, status (idle/running/done/error), task description, and output preview.

---

### agent-chain

Sequential pipeline orchestrator that chains agent steps with prompt templates.

| Property | Value |
|----------|-------|
| **File** | `agent-chain.ts` (1,202 lines) |
| **Tools** | `run_chain` |
| **Commands** | `/chain`, `/chain-list`, `/chain-clear` |
| **Shortcuts** | — |
| **Hooks** | `before_agent_start` |
| **Depends on** | `lib/parse-chain-yaml.ts`, `lib/agent-defs.ts`, `lib/toolkit-cli.ts`, `lib/pipeline-render.ts`, `lib/defaults.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Behavior:** Chains are defined in `.pi/agents/agent-chain.yaml`. Each chain is a sequence of steps with agent + prompt template. The user's prompt flows into step 1, its output becomes `$INPUT` for step 2's template, and so on. `$ORIGINAL` always refers to the user's original prompt.

Agents maintain session context — re-running the chain lets each agent resume where it left off.

**Pre-built chains:** plan-build-review, plan-build, full-pipeline, investigate-fix, plan-review-plan, test-fix, audit, secure, performance, sentry-setup, sentry-logs.

---

### pipeline-team

Hybrid sequential + parallel pipeline with 5 phases.

| Property | Value |
|----------|-------|
| **File** | `pipeline-team.ts` (1,212 lines) |
| **Tools** | `advance_phase`, `dispatch_agents`, `pipeline_status` |
| **Commands** | `/pipeline`, `/pipeline-status`, `/pipeline-reset`, `/pipeline-clear`, `/pipeline-off` |
| **Shortcuts** | Alt+P (overlay), Alt+S (status) |
| **Hooks** | `before_agent_start` |
| **Depends on** | `lib/parse-pipeline-yaml.ts`, `lib/agent-defs.ts`, `lib/toolkit-cli.ts`, `lib/pipeline-render.ts`, `lib/defaults.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Phases:**
1. **UNDERSTAND** — Interactive: primary agent converses with user to clarify the task
2. **GATHER** — Parallel scouts explore the codebase concurrently
3. **PLAN** — Sequential planner creates an implementation plan
4. **EXECUTE** — Parallel builders implement the plan
5. **REVIEW** — Agent-driven review loop with approve/re-dispatch

Pipelines are defined in `.pi/agents/pipeline-team.yaml`.

---

### subagent-widget

Spawns and manages background subagent processes with live status widgets.

| Property | Value |
|----------|-------|
| **File** | `subagent-widget.ts` (886 lines) |
| **Tools** | `subagent_create`, `subagent_create_batch`, `subagent_continue`, `subagent_remove`, `subagent_list` |
| **Commands** | `/sub`, `/subcont`, `/subrm`, `/subclear` |
| **Shortcuts** | — |
| **Hooks** | `session_switch` |
| **Depends on** | `lib/agent-defs.ts`, `lib/toolkit-cli.ts`, `lib/subagent-render.ts`, `lib/subagent-cleanup.ts`, `lib/commander-prompt.ts`, `lib/commander-lifecycle.ts`, `lib/commander-sync.ts`, `lib/defaults.ts`, `lib/themeMap.ts` |

**Behavior:** Each `/sub` spawns a background Pi subagent with its own persistent session. Agents can be named to match agent definitions (scout, builder, etc.) which auto-applies model, tools, and system prompt. `/subcont` continues a subagent's conversation. Live widgets show status, output preview, and elapsed time.

---

### toolkit-commands

Registers toolkit `.md` files as dynamic Pi slash commands.

| Property | Value |
|----------|-------|
| **File** | `toolkit-commands.ts` (266 lines) |
| **Tools** | — |
| **Commands** | Dynamic (from `.pi/commands/*.md`) |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/defaults.ts`, `lib/toolkit-cli.ts`, `lib/themeMap.ts` |

**Behavior:** Scans `~/.pi/agent/.pi/commands/` for `.md` files with frontmatter. Two execution modes:
- **Inline** — Injects body as user message with `$ARGUMENTS` replaced
- **Fork** (`context: fork`) — Spawns a Pi subprocess with the command body as system prompt

---

## Security

### security-guard

Multi-layer agent defense system with pre-tool-hook gating.

| Property | Value |
|----------|-------|
| **File** | `security-guard.ts` (819 lines) |
| **Tools** | — |
| **Commands** | `/security [status|log|policy|reload]` |
| **Shortcuts** | — |
| **Hooks** | `tool_call`, `context`, `before_agent_start`, `session_switch` |
| **Depends on** | `lib/security-engine.ts` |

**Three layers:**
1. **`tool_call` hook** — Pre-execution gate: blocks `rm -rf`, `sudo`, credential theft, exfiltration attempts
2. **`context` hook** — Content scanner: strips prompt injections from tool results
3. **`before_agent_start` hook** — System prompt hardening: reminds the agent of security rules

**Configurable via** `.pi/security-policy.yaml` with tunable severity levels (block, warn, log) per pattern.

**Audit logging** to `.pi/security-audit.log` with rotation.

---

### secure

Comprehensive AI security sweep and protection installer.

| Property | Value |
|----------|-------|
| **File** | `secure.ts` (383 lines) |
| **Tools** | — |
| **Commands** | `/secure [sweep|install|status|report]` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/secure-engine.ts`, `lib/secure-installer.ts` |

**Subcommands:**
- `/secure` or `/secure sweep` — Scans project for AI vulnerabilities (prompt injection, credentials, missing protections)
- `/secure install` — Generates portable AI security guard, policy YAML, middleware, CI checks
- `/secure status` — Quick security posture check
- `/secure report` — View last security report

---

### message-integrity-guard

Prevents session-bricking from orphaned tool_result messages.

| Property | Value |
|----------|-------|
| **File** | `message-integrity-guard.ts` (428 lines) |
| **Tools** | — |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | `context`, `session_before_compact`, `session_switch` |
| **Depends on** | — |

**Behavior:** Guards against the bug where orphaned `tool_result` messages (without matching `tool_use` in the preceding assistant message) cause unrecoverable 400 errors from the Anthropic API. Validates and repairs message ordering on every LLM call, compaction, and session restore.

---

## Viewers & Reports

### plan-viewer

Interactive browser GUI for markdown plan review and question answering.

| Property | Value |
|----------|-------|
| **File** | `plan-viewer.ts` (518 lines) + `lib/plan-viewer-html.ts` (1,183 lines) |
| **Tools** | `show_plan` |
| **Commands** | `/plan` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/plan-viewer-html.ts`, `lib/plan-viewer-render.ts`, `lib/plan-viewer-editor.ts`, `lib/viewer-standalone-export.ts`, `lib/viewer-session.ts`, `lib/report-index.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Two modes:**
- **Plan mode** — Renders markdown with checkboxes, inline editing, drag-to-reorder. User approves or declines.
- **Questions mode** — Renders questions (lines ending with `?` or containing `Default:`). User answers inline.

Opens a local HTTP server and launches the browser. Results are returned to the agent.

---

### completion-report

Browser GUI showing work summary, file diffs, and per-file rollback.

| Property | Value |
|----------|-------|
| **File** | `completion-report.ts` (693 lines) + `lib/completion-report-html.ts` (1,270 lines) |
| **Tools** | `show_report` |
| **Commands** | `/report` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/completion-report-html.ts`, `lib/viewer-standalone-export.ts`, `lib/viewer-session.ts`, `lib/report-index.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Behavior:** Auto-gathers git diff data from the working directory. Shows: markdown summary, files changed count, unified diffs with syntax highlighting, per-file rollback buttons, and a "rollback all" option. Includes task completion data from `.context/todo.md` if available.

---

### spec-viewer

Multi-page browser GUI for spec review with inline comments and visual gallery.

| Property | Value |
|----------|-------|
| **File** | `spec-viewer.ts` (708 lines) + `lib/spec-viewer-html.ts` (1,351 lines) |
| **Tools** | `show_spec` |
| **Commands** | `/spec` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/spec-viewer-html.ts`, `lib/viewer-standalone-export.ts`, `lib/viewer-session.ts`, `lib/report-index.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Behavior:** Takes a spec folder path and auto-discovers documents (spec.md, requirements, tasks, visuals). Wizard-style navigation between documents. Features: inline comment threads (Google Docs-style), raw markdown editing, visual asset gallery, approve/request changes actions.

---

### file-viewer

Lightweight local file viewer and editor in the browser.

| Property | Value |
|----------|-------|
| **File** | `file-viewer.ts` (370 lines) + `lib/file-viewer-html.ts` (790 lines) |
| **Tools** | `show_file`, `close_viewer` |
| **Commands** | `/view <path>`, `/edit <path>`, `/close-viewer` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/file-viewer-html.ts`, `lib/viewer-session.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Behavior:** Opens a file in a browser window with syntax highlighting, line numbers, and keyboard shortcuts. Supports read-only and editable modes. Optional line range display. Includes editor launch buttons for VS Code, Cursor, and Zed.

---

### reports-viewer

Searchable browser view for persisted plans, questions, specs, and completion reports.

| Property | Value |
|----------|-------|
| **File** | `reports-viewer.ts` (201 lines) + `lib/reports-viewer-html.ts` (575 lines) |
| **Tools** | `show_reports` |
| **Commands** | `/reports` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/reports-viewer-html.ts`, `lib/report-index.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Behavior:** Opens a browser with a searchable index of all persisted reports. Organized by category (plans, questions, specs, completion reports). Each entry links to its standalone HTML export.

---

## Developer Tools

### debug-capture

VHS-based terminal screenshot tool for visual TUI debugging.

| Property | Value |
|----------|-------|
| **File** | `debug-capture.ts` (619 lines) |
| **Tools** | `debug_capture` |
| **Commands** | `/debug-capture <scenario>` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | — |

**Scenarios:**
- `tasks` — Task list widget with sample data
- `modes` — Each operational mode banner
- `footer` — Footer status bar
- `theme <name>` — Terminal with a specific theme
- `custom <cmds>` — Arbitrary shell commands
- `pi <prompt>` — Run Pi non-interactively and capture output

**Prerequisites:** `vhs`, `ttyd`, `ffmpeg` on PATH.

---

### web-test

Cloudflare Browser Rendering for headless browser testing.

| Property | Value |
|----------|-------|
| **File** | `web-test.ts` (696 lines) + `web-test-worker/` |
| **Tools** | `web_test` |
| **Commands** | `/web-test <action> <url>` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | — |

**Actions:**
- `screenshot` — Capture PNG at custom viewport sizes
- `content` — Extract page text/HTML (with optional CSS selector)
- `a11y` — Run axe-core accessibility audit
- `responsive` — Capture at mobile (375px), tablet (768px), desktop (1440px)

**Prerequisites:** Cloudflare Worker deployed, wrangler CLI authenticated.

---

### tool-registry

In-memory index of all available tools with categorization and search.

| Property | Value |
|----------|-------|
| **File** | `tool-registry.ts` (254 lines) |
| **Tools** | — |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | `context` |
| **Depends on** | — |

**Behavior:** Builds a searchable index of all registered tools on first access. Auto-categorizes tools into: filesystem, shell, commander, testing, ui, agents, workflow, meta, security. Provides the foundation for `tool-search` and `tool-caller`.

---

### tool-search

Meta-tool for discovering and inspecting available tools at runtime.

| Property | Value |
|----------|-------|
| **File** | `tool-search.ts` (246 lines) |
| **Tools** | `tool_search` |
| **Commands** | `/tools [query]` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `tool-registry.ts`, `lib/themeMap.ts` |

**Operations:**
- `search` — Find tools by query (matches names, descriptions, tags, categories)
- `list` — List all tools or filter by category
- `inspect` — Get full details and parameter schema for a specific tool

---

### tool-caller

Meta-tool for invoking any tool programmatically by name.

| Property | Value |
|----------|-------|
| **File** | `tool-caller.ts` (309 lines) |
| **Tools** | `call_tool` |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `tool-registry.ts`, `lib/themeMap.ts` |

**Behavior:** Enables dynamic tool composition — the agent can discover tools with `tool_search` and invoke them with `call_tool`. Self-reference prevented: cannot call `call_tool` or `tool_search` recursively. Security guard restrictions still apply.

---

### lean-tools

Reduces system prompt bloat by deactivating non-essential tools.

| Property | Value |
|----------|-------|
| **File** | `lean-tools.ts` (91 lines) |
| **Tools** | — |
| **Commands** | `/lean-tools` |
| **Shortcuts** | — |
| **Hooks** | `before_agent_start` |
| **Depends on** | `lib/themeMap.ts` |

**Behavior:** Toggles lean mode. When active, only core tools remain: `tool_search`, `call_tool`, `read`, `bash`, `write`, `edit`, `tasks`. The agent uses `tool_search` to discover other tools and `call_tool` to invoke them, keeping the system prompt compact.

---

## Session & Context

### memory-cycle

Memory-aware compaction that saves and restores context across compaction cycles.

| Property | Value |
|----------|-------|
| **File** | `memory-cycle.ts` (541 lines) |
| **Tools** | `cycle_memory` |
| **Commands** | `/cycle [instructions]` |
| **Shortcuts** | — |
| **Hooks** | `before_agent_start`, `session_before_compact` |
| **Depends on** | `lib/memory-cycle-helpers.ts`, `lib/context-gate.ts` |

**Behavior:**
- **Before compact:** Extracts session insights (daily log, session state, stable facts)
- **After compact:** Injects restored memory context so the agent continues seamlessly

Also provides manual `/cycle` command and `cycle_memory` tool to trigger compact → new session → restore.

---

### session-replay

Scrollable timeline replay of conversation history.

| Property | Value |
|----------|-------|
| **File** | `session-replay.ts` (148 lines) |
| **Tools** | — |
| **Commands** | `/replay` |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/session-replay-helpers.ts`, `lib/themeMap.ts` |

**Behavior:** Opens a full-screen overlay showing the conversation timeline. Messages are formatted by type (user/assistant/tool) with timestamps. Navigate with arrow keys, expand/collapse with Enter.

---

### system-select

Switch system prompts by selecting agent definitions.

| Property | Value |
|----------|-------|
| **File** | `system-select.ts` (153 lines) |
| **Tools** | — |
| **Commands** | `/system` |
| **Shortcuts** | — |
| **Hooks** | `before_agent_start` |
| **Depends on** | `lib/themeMap.ts` |

**Behavior:** Scans `.pi/agents/`, `.claude/agents/`, `.gemini/agents/`, `.codex/agents/` (both project-local and global) for agent definition `.md` files with frontmatter. `/system` opens a select dialog. The selected agent's body is prepended to Pi's default instructions. Tools are restricted to the agent's declared tool set.

---

### user-question

Interactive UI tool for agent-to-user communication.

| Property | Value |
|----------|-------|
| **File** | `user-question.ts` (153 lines) |
| **Tools** | `ask_user` |
| **Commands** | — |
| **Shortcuts** | — |
| **Hooks** | — |
| **Depends on** | `lib/ask-user-details.ts`, `lib/output-box.ts`, `lib/themeMap.ts` |

**Three modes:**
- **select** — Inline picker with labeled options and optional markdown previews
- **input** — Free-text entry with placeholder
- **confirm** — Yes/no question with optional detail text

---

## Shared Library Modules

The `lib/` directory contains 42 shared modules used across extensions:

| Module | Purpose |
|--------|---------|
| `agent-defs.ts` | Agent definition scanning and model resolution |
| `ask-user-details.ts` | Structured details for ask_user tool |
| `commander-lifecycle.ts` | Commander task lifecycle (claim/complete/fail) |
| `commander-prompt.ts` | Commander system prompt builder |
| `commander-ready.ts` | Commander availability gate |
| `commander-sync.ts` | Local ↔ Commander task synchronization |
| `commander-tracker.ts` | Tracker state management |
| `completion-report-html.ts` | HTML template for completion report viewer |
| `context-budget.ts` | Context window budget estimation |
| `context-gate.ts` | Context usage warnings and compaction triggers |
| `defaults.ts` | Shared default constants |
| `file-viewer-html.ts` | HTML template for file viewer |
| `marked.min.js` | Bundled markdown parser |
| `mcp-client.ts` | MCP JSON-RPC client over stdio |
| `memory-cycle-helpers.ts` | Memory extraction and restoration helpers |
| `mode-cycler-logic.ts` | Mode cycling state machine |
| `mode-prompts.ts` | System prompts for each operational mode |
| `output-box.ts` | TUI output panel helpers |
| `panel-backdrop.ts` | Full-screen panel backdrop |
| `parse-chain-yaml.ts` | Chain YAML parser |
| `parse-pipeline-yaml.ts` | Pipeline YAML parser |
| `persist-theme.ts` | Theme persistence to settings.json |
| `pipeline-render.ts` | Pipeline TUI rendering |
| `plan-viewer-editor.ts` | Plan viewer inline editor |
| `plan-viewer-html.ts` | HTML template for plan viewer |
| `plan-viewer-render.ts` | Plan viewer TUI rendering |
| `report-index.ts` | Persisted report index management |
| `reports-viewer-html.ts` | HTML template for reports browser |
| `secure-engine.ts` | Security sweep engine |
| `secure-installer.ts` | Security protection installer |
| `security-engine.ts` | Security guard pattern matching engine |
| `session-replay-helpers.ts` | Session history extraction |
| `spec-viewer-html.ts` | HTML template for spec viewer |
| `subagent-cleanup.ts` | Subagent session file cleanup |
| `subagent-render.ts` | Subagent widget TUI rendering |
| `task-list-render.ts` | Task list TUI rendering |
| `tasks-confirm.ts` | Task list confirmation prompts |
| `themeMap.ts` | Theme color mapping for extensions |
| `toolkit-cli.ts` | Toolkit CLI worker spawning |
| `ui-helpers.ts` | TUI utility functions (pad, wrap, sideBySide) |
| `viewer-session.ts` | Active viewer session management |
| `viewer-standalone-export.ts` | Standalone HTML export for viewers |
