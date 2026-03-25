# Changelog

All notable changes to agent-pi will be documented in this file.

## [2.1.0] — 2026-03-25

### Web Chat — Remote Access from Any Device

New extension that lets you interact with your Pi session from your phone, tablet, or any device. Messages are relayed directly into the running session — same conversation, same tools, same subagents.

- **`/chat`** — Opens a LAN-accessible chat UI with 6-digit PIN authentication
- **`/chat --remote`** — Secure Cloudflare Quick Tunnel for access from anywhere (no account needed)
- **`/chat stop`** — Shuts down the server and tunnel
- **WebSocket streaming** — Real-time token delivery, tool call notifications, subagent visibility
- **Mobile-first UI** — Dark blue theme, markdown rendering, slash command menu, terminal activity tab
- **Security** — PIN auth, single-user lock, token-based sessions, auto-shutdown after 2 min idle
- **QR code display** — Scan from terminal to connect instantly from your phone
- See [docs/web-chat.md](docs/web-chat.md) for full documentation

### Subagent Lifecycle Management

Fixed a critical issue where subagents (especially scouts in PLAN mode) could run indefinitely, stacking zombie widgets that never cleaned up.

- **Watchdog timeouts** — Role-based kill timers: scout=10min, builder=30min, reviewer=15min, default=20min
- **`subagent_cleanup` tool** — Explicitly remove done/error/stale agents with configurable max age
- **Auto-cleanup before batch spawns** — `subagent_create_batch` removes leftover agents before spawning new ones
- **Duplicate batch guard** — Blocks spawning a new batch while agents are still running (override with `force: true`)
- **Timeout warnings in widget** — Shows "Xs left" at 80% of max duration, "TIMING OUT" at 95%
- **PLAN prompt lifecycle guidance** — Teaches agents about scout timeouts, auto-dismiss, and cleanup rules

### QA Automation Skill

New skill package for generic QA testing with agent-device and agent-browser integration.

- **qa-test-flows** — CDP-based test flow execution with helpers
- **qa-web** — Web testing with browser automation helpers
- **qa-scroll** — Scroll testing with gesture simulation
- **qa-state-persistence** — State management testing across app sessions
- **qa-device-management** — Device coordinate mapping and management
- **qa-setup** — Environment setup and configuration

### Task Board Improvements

- Local-first board viewer — always shows local tasks even when Commander is offline
- Full-height columns, removed max-width cap
- Polished task cards with colored borders, shadows, and status tints
- Removed emoji icons from empty states

### Bug Fixes

- **web-chat:** Fixed message echo (user messages being relayed back as assistant messages)
- **web-chat:** Fixed SSE flush through cloudflared tunnels (migrated to WebSocket)
- **web-chat:** Fixed stuck thinking indicator — restored done signal in message_end
- **web-chat:** Fixed terminal tab layout (was display:block in a flex parent)
- **web-chat:** Cleaned QR code display — no distortion, proper padding

## [2.0.0] — 2026-03-20

### ⚡ Restructured as Pi Package

**Breaking change:** The entire repo has been restructured from a nested `agent/` layout to a flat Pi package. Install with one command:

```bash
pi install git:github.com/ruizrica/agent-pi
```

- **Flat layout** — `extensions/`, `themes/`, `skills/`, `agents/` at repo root
- **Pi package manifest** — `package.json` with `pi` key for auto-discovery
- **No more manual setup** — no installer scripts, no symlinks, no manual config
- **Agent path resolution** — extensions now check both `.pi/agents/` and `agents/` for backward compatibility
- Removed: `install.sh`, `pi-doctor.sh`, `agent/` nesting, `docs/`, `disk-cleanup/`, `context-os/`

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
