# agent-pi

> A drop-in extension suite that transforms [Pi](https://github.com/earendil-works/pi) from a single-agent terminal coding assistant into a full multi-agent orchestration platform — 6 operational modes, 43 extensions, 11 themes, and 20+ skills, delivered entirely as configuration.

---

## Why this project exists

[Pi](https://github.com/earendil-works/pi) by Earendil Works is an excellent terminal-based AI coding agent: tool-use, conversation memory, a fast TUI, and a clean extension API. Out of the box, however, it's a **single agent working alone**.

Real engineering work rarely fits that shape. Planning wants structured review before code is written. Large refactors benefit from parallel exploration. Security-sensitive operations demand pre-flight guards. Spec-driven features need human approval gates.

`agent-pi` fills that gap **without forking Pi**. Every feature is an extension, a skill, a theme, or a YAML file loaded through Pi's package manifest. If you uninstall the package, you get stock Pi back — nothing is patched, nothing is monkeyed with.

The design goals are:

1. **Composable orchestration** — teams, chains, and pipelines as orthogonal primitives
2. **Security by default** — hook-level guards that apply to *every* tool call
3. **Human-in-the-loop where it matters** — browser viewers for plan/spec/completion review
4. **Zero-fork delivery** — everything ships as a Pi package

---

## Key features

### Orchestration
- **6 operational modes** — `NORMAL`, `PLAN`, `SPEC`, `TEAM`, `CHAIN`, `PIPELINE`, cycled with `Shift+Tab`
- **Teams** — advisor dispatches up to 16 parallel specialist agents (`agents/teams.yaml`)
- **Chains** — sequential pipelines with `$INPUT` / `$ORIGINAL` prompt templating (`agents/agent-chain.yaml`)
- **Pipelines** — 5-phase hybrid flow: `UNDERSTAND → GATHER → PLAN → EXECUTE → REVIEW`
- **CLAUDE overlay** — `/claude` routes Claude-family roles through the Claude Code CLI while preserving the active mode
- **Local overlays** — `/gemma` and `/qwen` route builder-style roles through LM Studio's OpenAI-compatible local server

### Multi-provider worker roles
- `claude-worker` / `claude-advisor` — Claude Code CLI executor + Opus advisor
- `cursor-worker`, `codex-worker`, `droid-worker`, `gemini-worker`, `opencode-worker` — headless wrappers for third-party coding CLIs
- Legacy `*-agent` aliases preserved for backward compatibility

### Security
- **`security-guard`** — pre-tool hook blocking destructive commands, credential exfiltration, and prompt-injection payloads
- **`message-integrity-guard`** — protects sessions from orphaned `tool_result` bricking
- **`/secure`** — full AI-driven security sweep + portable protection installer for any project

### Human review surfaces (browser-based)
- **Plan Viewer** — approve/edit/reorder planned steps
- **Spec Viewer** — multi-page spec review with inline comments
- **Completion Report** — unified diffs with per-file rollback
- **File Viewer**, **Reports Viewer**, **Board Viewer**

### Developer ergonomics
- 11 curated themes (Catppuccin, Dracula, Nord, Tokyo Night, Synthwave, …) cycled with `Ctrl+X`
- `tool-search` / `tool-caller` — dynamic tool discovery + programmatic invocation
- `lean-tools` — swap the full tool roster for a search-based meta-toolset to save context
- `memory-cycle`, `session-replay`, `system-select` — session continuity utilities

### Cloud Code plugin
- Ships a Claude Code plugin manifest (`.claude-plugin/plugin.json`) + marketplace metadata
- Exposes a `pi-agent-orchestrator` skill so Cloud Code can drive Pi as an orchestration backend
- Node-based bridge CLI (`scripts/pi-agent-orchestrator.mjs`) supports `inspect`, `plan`, `dispatch`, `chain`

---

## Project structure

```
agent-pi/
├── package.json              Pi package manifest (peer-deps on pi-agent-core)
├── install.sh                One-line installer (handles Pi install + registration)
├── pi-doctor.sh              Health check for Pi + agent-pi configuration
│
├── extensions/               43 TypeScript extensions (hook into Pi's extension API)
│   ├── lib/                  Shared helpers (toolkit-cli, widget runtime, etc.)
│   ├── security-guard.ts     Pre-tool hook — blocks dangerous ops
│   ├── mode-cycler.ts        Shift+Tab mode switching
│   ├── agent-team.ts         Dispatch-only team orchestrator
│   ├── agent-chain.ts        Sequential chain runner
│   ├── pipeline-team.ts      5-phase hybrid pipeline
│   ├── plan-viewer.ts        Browser GUI — plan approval
│   ├── completion-report.ts  Browser GUI — diffs + rollback
│   └── __tests__/            Vitest suites + fixtures
│
├── agents/                   Agent definitions + orchestration YAML
│   ├── teams.yaml            Team composition
│   ├── agent-chain.yaml      Chain definitions ($INPUT / $ORIGINAL templating)
│   ├── pipeline-team.yaml    Pipeline phases
│   ├── models.json           Model routing
│   ├── workers/              Worker-role agent defs (*.md with frontmatter)
│   ├── builders/             Builder-role agent defs
│   └── tester/               QA / reviewer agents
│
├── skills/                   20+ reusable skill packs
│   ├── pi-agent-orchestrator/  Cloud Code skill exposing Pi as backend
│   ├── frontend-design/, qa-automation/, codebase-to-course/, …
│
├── commands/                 Toolkit slash commands (markdown-driven)
├── prompts/                  Prompt templates (incl. Commander CLI-backed workflows)
├── themes/                   11 theme JSONs
├── scripts/                  pi-agent-orchestrator.mjs bridge + utilities
├── tex/                      Standalone "Text Tools" browser app
├── docs/                     Screenshots + supplementary docs
└── tests/                    Playwright + integration tests
```

---

## Installation

### Prerequisites

- **Node.js** ≥ 18 (Pi runtime requirement)
- **macOS or Linux** (Pi's primary supported platforms)
- A terminal with truecolor + Unicode support (iTerm2, Kitty, WezTerm, Alacritty, Ghostty)
- Optional: `claude`, `cursor-agent`, `codex`, `droid`, `gemini`, `opencode` CLIs if you want the corresponding worker roles
- Optional for local overlays: **LM Studio** with local server enabled on `http://127.0.0.1:1234/v1`

### One-line install (recommended — handles everything)

```bash
git clone https://github.com/earendil-works/pi.git \
  && cd pi \
  && ./install.sh
```

### LM Studio local model setup

To use the `/gemma` and `/qwen` overlays with local models:

1. Start LM Studio's local server.
2. Confirm the OpenAI-compatible endpoint is live at `http://127.0.0.1:1234/v1`.
3. Ensure the model list includes:
   - `google/gemma-4-26b-a4b`
   - `qwen/qwen3.6-27b`
4. Add an `lmstudio` provider in `~/.pi/agent/models.json` with those model IDs.
5. In Pi, use `/gemma` or `/qwen` to route eligible builder/worker roles to the selected local model.

The installer bootstraps Pi itself if not present, then registers `agent-pi` as a Pi package.

### Existing Pi install

```bash
pi install git:github.com/earendil-works/pi
```

Pi's package loader auto-discovers every extension, theme, skill, and prompt listed in `package.json`:

```json
"pi": {
  "extensions": ["./extensions"],
  "skills":     ["./skills"],
  "themes":     ["./themes"],
  "prompts":    ["./prompts/commander"]
}
```

### Environment configuration

Copy `.env.example` to `.env` and fill in values you intend to use:

```bash
cp .env.example .env
```

Keys of note:

| Variable | Purpose |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` / `PI_CLAUDE_OAUTH_TOKEN` / `ANTHROPIC_OAUTH_TOKEN` | Reused by `extensions/oauth-provider.ts` — Cloud Code skill and `claude-worker` rely on these |
| `OPENROUTER_API_KEY` | Enables the `openrouter-routing` extension |
| `AGENTMAIL_API_KEY` | Needed for the email-sending skill |
| `JIRA_API_TOKEN` | Optional — Jira integration |

---

## Usage examples

### Daily flow

```bash
pi                          # Launch Pi with agent-pi loaded
```

Inside the TUI:

| Shortcut | Action |
|---|---|
| `Shift+Tab` | Cycle `NORMAL → PLAN → SPEC → TEAM → CHAIN → PIPELINE` |
| `/claude`   | Toggle the CLAUDE overlay (banner turns dark-orange) |
| `Ctrl+X`    | Cycle themes |
| `ESC ESC`   | Cancel all running operations |
| `/agents-team` | Switch between agent teams |
| `/chain`    | Switch between chain workflows |
| `/system`   | Swap system prompt by picking an agent definition |
| `/replay`   | Scrollable timeline of the conversation |
| `/secure`   | Run a full AI security sweep on the project |
| `/tex`      | Open the Text Tools browser app |

### Dispatching a team agent

Inside Pi, any advisor or chain step can dispatch a worker by name:

```text
dispatch_agent {
  agent: "claude-worker",
  task: "Implement the approved refactor plan"
}
```

The `subagent-widget` renders a live console preview with status, token counts, and cancel controls.

### Asking the Claude advisor

```text
claude_advisor {
  question: "Should we split the service into read/write paths?",
  files:    ["api/server.ts", "api/routes/index.ts"],
  task_context: "Monolith handler under load; latency p99 regressing"
}
```

The advisor is read-only — it returns guidance, risks, alternatives, and next actions; it never mutates files.

### Defining a team (YAML)

`agents/teams.yaml`:

```yaml
plan-build:
  - planner
  - builder
  - reviewer
```

Each name resolves to `agents/<name>.md` (or a role-subdir variant) with YAML frontmatter describing model, tools, and prompt.

### Defining a chain

`agents/agent-chain.yaml`:

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

`$INPUT` is the previous step's output; `$ORIGINAL` is the user's initial prompt.

### Driving Pi from Claude Code via the orchestrator bridge

```bash
# Inspect what's exposed
node scripts/pi-agent-orchestrator.mjs inspect

# Plan first — the skill enforces plan approval; advisor is reserved for complex work
node scripts/pi-agent-orchestrator.mjs plan \
  --mode auto --agent-count 1 --write-scope narrow

# Dispatch a single agent
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent scout \
  --task "Map the current auth flow and list the key files." \
  --execute

# Run an approved chain
node scripts/pi-agent-orchestrator.mjs chain \
  --chain plan-build-review \
  --task "Implement the approved feature end to end." \
  --approved true \
  --execute
```

Inside Claude Code, install the plugin scaffold directly:

```text
/plugin marketplace add .
/plugin install pi-agent-orchestrator@agent-pi-marketplace
```

---

## Architecture

### Three orthogonal orchestration primitives

```
┌─────────────────────────────────────────────────────────┐
│  MODE  (behavioral overlay — complexity-aware, plan-first, │
│         spec-first, dispatcher, chain, hybrid pipeline)   │
├─────────────────────────────────────────────────────────┤
│  TEAM           CHAIN             PIPELINE              │
│  parallel       sequential        phased parallel       │
│  fan-out        $INPUT piping     UNDERSTAND→…→REVIEW   │
├─────────────────────────────────────────────────────────┤
│  WORKERS  (claude / cursor / codex / droid / gemini /   │
│            opencode — headless CLI wrappers)            │
└─────────────────────────────────────────────────────────┘
```

A mode sets the *behavior*. A team, chain, or pipeline sets the *shape* of coordination. A worker role is the *executor*. The three axes compose freely.

### Complexity-aware advisor pattern (NORMAL / PLAN / SPEC)

1. Simple and routine medium tasks run directly without `claude_advisor`.
2. `claude_advisor` is reserved for complex problems: architectural decisions, security/compliance impact, critical paths, broad refactors, unclear requirements, or when stuck after a reasonable attempt.
3. `grok-4.1-fast` is the preferred non-advisor worker (with `claude-haiku-4-5` fallback).
4. For complex, parallelizable work, the agent may fan out up to **16 non-advisor agents** in parallel.
5. For high-impact or ambiguous complex work, a **cross-provider second opinion** (e.g., `red-team` via `gpt-5.4`) is optionally requested.

Skip the advisor for single-file fixes and contained medium work. Use PLAN for structured plan approval. Use SPEC when a full requirements → design → task breakdown → approval loop is warranted.

### Security: three hook layers

| Hook | Purpose |
|---|---|
| `tool_call` | `security-guard` blocks destructive commands, credential-exfil patterns, suspicious network calls *before* the tool runs |
| `context`   | Scans tool results, strips prompt-injection payloads before they reach the model |
| `before_agent_start` | Injects security reminders into the system prompt |

These hooks are Pi-native — they apply to every extension and every tool the agent can call, without any per-tool wiring.

### Session continuity

- **`memory-cycle`** — compaction-aware snapshot/restore so long sessions survive context compaction
- **`session-replay`** — `/replay` renders a scrollable conversation timeline
- **`system-select`** — `/system` hot-swaps the system prompt by selecting a different agent definition

---

## Dependencies

### Peer (provided by Pi itself)

```json
"peerDependencies": {
  "@earendil-works/pi-agent-core":   "*",
  "@earendil-works/pi-coding-agent": "*",
  "@earendil-works/pi-tui":          "*",
  "@sinclair/typebox":             "*"
}
```

### Runtime

```json
"dependencies": {
  "qrcode-terminal": "^0.12.0",
  "ws":              "^8.18.0",
  "yaml":            "^2.8.2"
}
```

### Dev

- `typescript-eslint` + `@eslint/js` (lint)
- `vitest` (extension unit tests under `extensions/__tests__/`)
- `playwright` (E2E, see `playwright.config.ts`)
- `mako` (security scan — `npm run security:scan`)

### Optional external CLIs

Install any of these to enable the matching `*-worker` role:

- `claude` (Claude Code CLI)
- `cursor-agent`
- `codex`
- `droid`
- `gemini`
- `opencode`

---

## Scripts

```bash
npm run lint            # ESLint over the whole package
npm run lint:fix        # ESLint autofix
npm run security:scan   # mako security scan
./pi-doctor.sh          # Diagnose Pi + agent-pi installation health
./install.sh            # Bootstrap Pi + register the package
```

---

## Contributing

Full details live in [CONTRIBUTING.md](./CONTRIBUTING.md). The high points:

1. **Fork + clone** your copy of the repo.
2. **Install Pi** — follow the upstream [Pi](https://github.com/earendil-works/pi) instructions.
3. **Install deps** — `npm install` at the project root.
4. **Run locally** — `pi` from the project root picks up `settings.json` and auto-loads all extensions.
5. **Follow TDD** — write a failing test first (`extensions/__tests__/`), then the implementation.
6. **Keep PRs focused** — one concern per PR; match the existing style inside each file; every new file begins with a two-line `ABOUTME:` header comment.
7. **Do not push private content** — `skills/private/`, `extensions/private/`, and `commands/private/` must never leave the private remote.

Issue reports and feature ideas are welcome via GitHub Issues.

---

## License

[MIT](./LICENSE) — Copyright © 2025 Ricardo Ruiz.

Pi itself (the underlying runtime) is a separate project by [Earendil Works; see its own license for terms.

---

## Related links

- [Pi](https://github.com/earendil-works/pi) — the runtime this package extends
- [CHANGELOG](./CHANGELOG.md) — release notes
- [CLAUDE.md](./CLAUDE.md) — agent-facing rules & policies for this repo
- [docs/](./docs/) — screenshots and supplementary documentation
