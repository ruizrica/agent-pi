# Changelog

All notable changes to agent will be documented in this file.

## [1.0.0] — 2025-03-11

### 🎉 Initial Public Release

The first public release of agent — a comprehensive extension suite that transforms [Pi Coding Agent](https://github.com/badlogic/pi-mono) into a multi-agent orchestration platform.

### Extensions (28 total)

#### Core UI
- **agent-banner** — ASCII art startup banner with theme-aware coloring
- **footer** — Status bar with model name, context percentage, and working directory
- **agent-nav** — F-key navigation shared across agent widgets (chain, team, pipeline)

#### Task Management
- **tasks** — Task discipline system gating tools until tasks are defined; three-state lifecycle (idle → inprogress → done) with live widget
- **commander-mcp** — Bridge exposing Commander MCP tools as native Pi tools
- **commander-tracker** — Reconciles local tasks with Commander and retries failed sync

#### Operational Modes
- **mode-cycler** — Cycles through NORMAL / PLAN / SPEC / PIPELINE / TEAM / CHAIN modes via Shift+Tab

#### Multi-Agent Orchestration
- **agent-team** — Dispatcher-only orchestrator with specialist agents and grid dashboard
- **agent-chain** — Sequential pipeline orchestrator chaining agent steps with prompt templates
- **pipeline-team** — Hybrid sequential + parallel pipeline (UNDERSTAND → GATHER → PLAN → EXECUTE → REVIEW)
- **subagent-widget** — Background subagent process management with live status widgets
- **toolkit-commands** — Dynamic slash commands from `.pi/commands/` markdown files

#### Security
- **security-guard** — Pre-tool-hook defense system blocking destructive commands, detecting prompt injection, preventing exfiltration
- **secure** — `/secure` command for AI security sweeps and protection installation
- **message-integrity-guard** — Prevents session-bricking from orphaned tool_result messages

#### Viewers & Reports
- **plan-viewer** — Interactive browser GUI for markdown plan review (approve/edit/reorder) and question answering
- **completion-report** — Browser GUI showing work summary, file diffs, and per-file rollback
- **spec-viewer** — Multi-page browser GUI for spec review with inline comments and visual gallery
- **file-viewer** — Lightweight local file viewer/editor in the browser
- **reports-viewer** — Searchable `/reports` browser view for persisted plans, specs, and reports

#### Developer Tools
- **debug-capture** — VHS-based terminal screenshot tool for visual TUI debugging
- **web-test** — Cloudflare Browser Rendering for screenshots, content extraction, and accessibility audits
- **tool-registry** — In-memory index of all available tools with categorization and search
- **tool-search** — Meta-tool for discovering and inspecting available tools at runtime
- **tool-caller** — Meta-tool for invoking tools programmatically by name (dynamic composition)
- **lean-tools** — Reduces system prompt bloat by deactivating non-essential tools

#### Session & Context
- **memory-cycle** — Memory-aware compaction saving/restoring context across compaction cycles
- **session-replay** — Scrollable timeline replay of conversation history via `/replay`
- **escape-cancel** — Double-ESC cancels all running operations (agent, subagents, chains, pipelines)
- **system-select** — Switch system prompts by selecting agent definitions via `/system`

### Agent Definitions
- **scout** — Read-only codebase exploration and recon
- **planner** — Implementation planning and architecture
- **builder** — Code implementation following existing patterns
- **reviewer** — Code review for bugs, style, and correctness
- **tester** — Test writing and execution
- **red-team** — Security vulnerability analysis

### Teams & Pipelines
- 8 pre-configured teams (all, toolkit, full, plan-build, investigate, quality, refactor, docs)
- 9 chain workflows (plan-build-review, audit, secure, performance, sentry-setup, and more)
- 2 pipeline configurations (plan-build-review, plan-build)

### Themes
- 11 custom themes: Catppuccin Mocha, Cyberpunk, Dracula, Everforest, Gruvbox, Midnight Ocean, Nord, Ocean Breeze, Rose Pine, Synthwave, Tokyo Night

### Skills
- agent-browser — Browser testing skill pack
- nano-banana — Image generation skill
- just-bash — Shell-only skill


### Model Providers
- Mercury (4 models)
- Synthetic (16 models including GLM, Qwen, Kimi, MiniMax)
- OpenRouter (9 models)
- MiniMax Coding (1 model)
