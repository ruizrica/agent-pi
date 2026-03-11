<div align="center">

<img src="agent-logo.png" alt="agent" width="240" />

<br/>

**An extension suite that turns [Pi](https://github.com/badlogic/pi-mono) into a multi-agent orchestration platform**

[Extensions](#extensions) · [Modes](#operational-modes) · [Orchestration](#multi-agent-orchestration) · [Full Docs](docs/index.html)

</div>

---

## What is this?

[Pi](https://github.com/badlogic/pi-mono) is a terminal-based AI coding agent by [@badlogic](https://github.com/badlogic). Out of the box it's a single-agent assistant with tool use, conversation memory, and a TUI.

**agent** is a set of **28 extensions** that transform Pi into something more:

- **6 operational modes** — NORMAL, PLAN, SPEC, PIPELINE, TEAM, CHAIN
- **Multi-agent orchestration** — dispatch teams, run sequential chains, or execute parallel pipelines
- **Security hardened** — pre-tool-hook guard blocks destructive commands, detects prompt injection, prevents data exfiltration
- **Browser-based viewers** — interactive plan review, completion reports with rollback, spec approval with inline comments
- **30+ model providers** — Anthropic, OpenAI, Google, Mercury, Synthetic, OpenRouter, and more
- **11 themes** — Catppuccin, Dracula, Nord, Synthwave, Tokyo Night, and more

Everything is configuration — no forks, no patches. Just extensions, agent definitions, and YAML.

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Pi Coding Agent](https://github.com/badlogic/pi-mono) installed globally

### Install

```bash
# Clone this repo
git clone https://github.com/ruizrica/pi-dev.git
cd pi-dev

# Install dependencies
npm install

# Run Pi with all extensions loaded
cd agent && pi
```

Pi reads `agent/settings.json` on startup, which loads all 28 extensions automatically.

### First Steps

1. **Type a task** — Pi operates in plan-first mode. It will ask you to define tasks before using tools.
2. **Shift+Tab** — Cycle through operational modes (NORMAL → PLAN → SPEC → PIPELINE → TEAM → CHAIN)
3. **Ctrl+T** — Cycle themes
4. **`/agents-team`** — Switch between agent teams
5. **`/chain`** — Switch between chain workflows
6. **`/security status`** — Check security posture

## Architecture

```
agent/
├── extensions/              28 TypeScript extensions
│   ├── lib/                 42 shared library modules
│   ├── __tests__/           Test suite
│   └── web-test-worker/     Cloudflare Worker for browser testing
├── .pi/
│   ├── agents/              Agent definitions + team/chain/pipeline YAML
│   ├── commands/            Toolkit slash commands
│   └── prompts/             Prompt templates
├── themes/                  11 custom terminal themes
├── skills/                  Skill packs (browser, image gen, iOS, bash)
├── settings.json            Extension loading + Pi configuration
├── models.json              30+ models across 4+ providers
└── keybindings.json         Custom shortcuts
```

## Extensions

### Core UI

| Extension | Description |
|-----------|-------------|
| **agent-banner** | ASCII art banner on startup, auto-hides on first input |
| **footer** | Status bar — model name, context %, working directory |
| **agent-nav** | F1-F4 navigation shared across agent widgets |
| **theme-cycler** | Ctrl+T to cycle through installed themes |
| **escape-cancel** | Double-ESC cancels all running operations |

### Task Management

| Extension | Description |
|-----------|-------------|
| **tasks** | Task discipline — define tasks before tools unlock; idle → inprogress → done lifecycle |
| **commander-mcp** | Bridge exposing Commander dashboard tools as native Pi tools |
| **commander-tracker** | Reconciles local tasks with Commander; retries failed sync |

### Operational Modes

| Extension | Description |
|-----------|-------------|
| **mode-cycler** | Shift+Tab cycles NORMAL / PLAN / SPEC / PIPELINE / TEAM / CHAIN |

Each mode injects a tailored system prompt. PLAN mode enforces plan-first workflow. SPEC mode drives spec-driven development. TEAM/CHAIN/PIPELINE modes activate their respective orchestration systems.

### Multi-Agent Orchestration

| Extension | Description |
|-----------|-------------|
| **agent-team** | Dispatch-only orchestrator — primary agent delegates to specialists via `dispatch_agent` |
| **agent-chain** | Sequential pipeline — each step's output feeds into the next via `$INPUT` |
| **pipeline-team** | 5-phase hybrid — UNDERSTAND → GATHER → PLAN → EXECUTE → REVIEW |
| **subagent-widget** | Background subagent management with live status widgets |
| **toolkit-commands** | Dynamic slash commands from `.pi/commands/` markdown files |

### Security

| Extension | Description |
|-----------|-------------|
| **security-guard** | Pre-tool-hook: blocks `rm -rf`, `sudo`, credential theft, prompt injection |
| **secure** | `/secure` — full AI security sweep + protection installer for any project |
| **message-integrity-guard** | Prevents session-bricking from orphaned tool_result messages |

### Viewers & Reports

| Extension | Description |
|-----------|-------------|
| **plan-viewer** | Browser GUI — plan approval with checkboxes, reordering, inline editing |
| **completion-report** | Browser GUI — work summary, unified diffs, per-file rollback |
| **spec-viewer** | Browser GUI — multi-page spec review with comments and visual gallery |
| **file-viewer** | Browser GUI — syntax-highlighted file viewer with optional editing |
| **reports-viewer** | Searchable `/reports` browser view for all persisted artifacts |

### Developer Tools

| Extension | Description |
|-----------|-------------|
| **debug-capture** | VHS-based terminal screenshots for visual TUI debugging |
| **web-test** | Cloudflare Browser Rendering — screenshots, content extraction, a11y audits |
| **tool-registry** | In-memory index of all tools with categories and search |
| **tool-search** | Meta-tool — discover and inspect tools at runtime |
| **tool-caller** | Meta-tool — invoke any tool programmatically (dynamic composition) |
| **lean-tools** | Toggle lean mode — agent uses `tool_search` + `call_tool` instead of all tools |

### Session & Context

| Extension | Description |
|-----------|-------------|
| **memory-cycle** | Memory-aware compaction — saves/restores context across compaction |
| **session-replay** | `/replay` — scrollable timeline of conversation history |
| **system-select** | `/system` — switch system prompt by picking agent definitions |

## Operational Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| **NORMAL** | Default | Standard coding assistant |
| **PLAN** | Shift+Tab | Plan-first workflow — analyze → plan → approve → implement → report |
| **SPEC** | Shift+Tab | Spec-driven — shape → requirements → tasks → implement |
| **TEAM** | Shift+Tab | Dispatcher mode — primary delegates, specialists execute |
| **CHAIN** | Shift+Tab | Sequential pipeline — step outputs chain into next step |
| **PIPELINE** | Shift+Tab | 5-phase hybrid with parallel dispatch |

## Multi-Agent Orchestration

### Teams

Teams are defined in `agent/.pi/agents/teams.yaml`. Each team is a list of agent names. Agent definitions live in `agent/.pi/agents/*.md` with YAML frontmatter.

```yaml
plan-build:
  - planner
  - builder
  - reviewer

quality:
  - reviewer
  - tester
  - red-team
```

### Chains

Chains are sequential pipelines defined in `agent/.pi/agents/agent-chain.yaml`. Each step specifies an agent and a prompt template with `$INPUT` (previous output) and `$ORIGINAL` (user's original prompt).

```yaml
plan-build-review:
  description: "Plan, implement, and review"
  steps:
    - agent: planner
      prompt: "Plan the implementation for: $INPUT"
    - agent: builder
      prompt: "Implement the following plan:\n\n$INPUT"
    - agent: reviewer
      prompt: "Review this implementation:\n\n$INPUT"
```

Pre-built chains include: `plan-build-review`, `audit`, `secure`, `performance`, `sentry-setup`, `sentry-logs`, and more.

### Pipelines

Pipelines are defined in `agent/.pi/agents/pipeline-team.yaml` and combine sequential phases with parallel agent dispatch:

```
UNDERSTAND (interactive) → PLAN (interactive) → BUILD (interactive) → REVIEW (interactive)
```

## Security

The security system operates at three layers:

1. **`tool_call` hook** — Pre-execution gate blocks dangerous commands before they run
2. **`context` hook** — Content scanner strips prompt injections from tool results
3. **`before_agent_start` hook** — System prompt hardening reminds the agent of security rules

Configurable via `.pi/security-policy.yaml`. View status with `/security status`.

The `/secure` command runs a comprehensive AI security sweep on any project and can install portable protections (input sanitizers, output filters, rate limiters, CI checks).

## Themes

11 themes included. Cycle with **Ctrl+T** or set in `settings.json`:

Catppuccin Mocha · Cyberpunk · Dracula · Everforest · Gruvbox · Midnight Ocean · Nord · Ocean Breeze · Rose Pine · Synthwave · Tokyo Night

## Configuration

### `agent/settings.json`

Controls extension loading, default model, theme, and UI preferences. See the file for all options.

### `agent/models.json`

Configure model providers. Supports any OpenAI-compatible API. See [docs/QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md) for examples.

### `agent/.pi/agents/`

Agent definitions (`.md`), team configs (`teams.yaml`), chain workflows (`agent-chain.yaml`), and pipeline configs (`pipeline-team.yaml`).

## Documentation

- **[Extension Reference](docs/EXTENSIONS.md)** — Detailed guide to all 28 extensions
- **[Full Documentation](docs/index.html)** — HTML docs with architecture, extension API, and how to extend
- **[Provider Quick Reference](docs/QUICK_REFERENCE.md)** — Model provider configuration examples
- **[Contributing](CONTRIBUTING.md)** — How to contribute
- **[Changelog](CHANGELOG.md)** — Release history

## Ecosystem

agent and [commander](https://github.com/ruizrica/commander) form a two-part system. Each works independently, but together they create a complete AI development workflow:

| | Role |
|---|------|
| **agent** | Execute, build, review — the hands in the terminal |
| **commander** | Plan, track, coordinate — the dashboard and brain |

**How they connect:** agent's `commander-mcp` extension spawns the MCP server and connects to Commander's WebSocket. Tasks sync bidirectionally — create a spec in Commander's wizard, execute it with agent's multi-agent orchestration, and watch live progress on the Kanban board.

Both work fully standalone. agent's 28 extensions, orchestration modes, and viewers need nothing else. Commander's dashboard, spec wizard, Jira integration, and personal assistant work without agent.

## Built on Pi

This project is a configuration and extension layer for [Pi Coding Agent](https://github.com/badlogic/pi-mono) by Mario Zechner ([@badlogic](https://github.com/badlogic)). Pi provides the core runtime, TUI framework, LLM integration, and extension API. Everything here builds on top of that foundation.

## License

[MIT](LICENSE)
