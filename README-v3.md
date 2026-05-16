# agent-pi

> **Turn [Pi](https://github.com/earendil-works/pi) into a multi-agent orchestration platform** — 7 operational modes, 50+ extensions, 26 skills, 11 themes. Installs as a single Pi package. No forks, no patches.

`agent-pi` is a configuration layer over the excellent [Pi coding agent](https://github.com/earendil-works/pi) by Earendil Works. If Pi is the engine, `agent-pi` is the chassis: orchestration primitives (teams / chains / pipelines), human-review surfaces (browser viewers), security hooks, a remote-access chat UI, and a curated set of worker wrappers for popular coding CLIs.

---

## The problem it solves

Stock Pi is a great single-agent loop, but real engineering work often needs more structure:

| Pain point | What `agent-pi` adds |
|---|---|
| "This task is too big for one agent" | **Teams** fan out up to 16 parallel specialists; **Chains** pipe output step-to-step; **Pipelines** combine both in 5 phases |
| "I want to approve the plan before code is written" | **PLAN mode** + browser-based **Plan Viewer** with checkbox approval, reordering, inline edits |
| "A subagent ran `rm -rf` / leaked my creds / followed a prompt-injection in a web page" | **`security-guard`** pre-tool hook blocks destructive ops and strips injections from tool results |
| "I want to drive Pi from my phone" | **`/chat`** — LAN or Cloudflare-tunnel web UI with PIN auth and mobile-first layout |
| "Long sessions die when context compacts" | **`memory-cycle`** snapshots and restores context across compaction events |
| "I want to delegate to Cursor / Codex / Gemini / Droid without leaving Pi" | **`*-worker` roles** wrap each CLI in headless mode and stream output into Pi's subagent widgets |
| "Zombie subagents pile up" | **Watchdog timeouts** per role (scout 10m, builder 30m, reviewer 15m) + `subagent_cleanup` tool |
| "I need human sign-off on specs, not just plans" | **SPEC mode** drives Kiro-style requirements → design → tasks with a browser **Spec Viewer** |

Everything is delivered as extensions, YAML, and markdown — nothing patches Pi itself. Uninstall the package and you get stock Pi back.

---

## Quick start (60 seconds)

```bash
# 1. Clone and install (also installs Pi if you don't have it)
git clone https://github.com/earendil-works/pi.git
cd pi
./install.sh

# 2. Launch
pi
```

Inside the TUI:

| Keys / command | What happens |
|---|---|
| *(just type a task)* | Pi starts in plan-first mode; it will ask you to scope tasks before any tools unlock |
| `Shift+Tab` | Cycle modes: `NORMAL → PLAN → INVESTIGATE → SPEC → TEAM → CHAIN → PIPELINE` |
| `/claude`   | Toggle the CLAUDE overlay — banner turns dark orange; Claude-family roles route through the Claude Code CLI |
| `Ctrl+X`    | Cycle themes |
| `ESC ESC`   | Cancel all running subagents and operations |
| `/chat`     | Start the web chat server (scan the QR to connect your phone) |
| `/pi`       | Unified entry point — dispatches into `plan` / `investigate` / `spec` / `team` / `chain` / `pipeline` workflows |
| `/secure`   | Run an AI-driven security sweep on the current project |
| `/replay`   | Scrollable timeline of the current conversation |

If you already have Pi installed, you can skip `install.sh`:

```bash
pi install git:github.com/earendil-works/pi
```

Pi auto-discovers every extension, skill, theme, and prompt from `package.json`.

---

## What's new (2.1.0 and later)

Keep this list short — it's the "read me first" delta for anyone who last looked at v1.

### Web Chat — drive Pi from your phone (2.1.0)

```bash
/chat            # LAN-only, shows a QR code + 6-digit PIN
/chat --remote   # Secure Cloudflare Quick Tunnel, no account required
/chat stop       # Shut down server + tunnel
```

- WebSocket streaming, real-time tool-call notifications, subagent visibility
- PIN auth, single-user lock, auto-shutdown after 2 min idle
- Recent additions: **Copy / Add-to-Board buttons** on assistant messages and an **inline board panel** for quick triage
- See [`docs/web-chat.md`](docs/web-chat.md) for the full spec

### Subagent lifecycle management

Role-based kill timers stop zombie widgets from stacking up:

| Role | Default timeout |
|---|---|
| `scout` | 10 min |
| `reviewer` | 15 min |
| *(default)* | 20 min |
| `builder` | 30 min |

- Widgets show "Xs left" at 80% of the limit, "TIMING OUT" at 95%
- `subagent_cleanup` tool explicitly removes done / errored / stale agents
- `subagent_create_batch` auto-cleans leftovers and refuses to spawn while a prior batch is still running (override with `force: true`)

### Other recent additions

- **`/pi` skill** — unified entry point to every operational mode, configurable write scope and agent count
- **`/sounds`** — browser UI to browse and assign soundcn.xyz sounds to Pi lifecycle events (plus a local image cache)
- **Board Viewer** — browser Kanban board polling Commander CLI-backed tools; works local-first when Commander is offline
- **Dream system** (`dream-scheduler`) — global-first memory consolidation with freshness tracking in `~/.pi/dream/`
- **`/learn`** — delta-aware codebase snapshots written to Obsidian as `raw/` + `wiki/` artifacts
- **Security extensions** — `vuln-scanner`, `security-news`, `security-report`, `safe-port-scan`, `network-inspect`
- **Toolkit worker wrappers** — `cursor-worker`, `codex-worker`, `droid-worker`, `gemini-worker`, `opencode-worker`, `claude-worker` / `claude-advisor`
- **OpenRouter routing fix** — variant context-window reporting is now correct
- **Tool-result hardening** — tool / extension outputs can no longer be misclassified as user input (`ce50d3a`)

---

## How it fits together

Three orthogonal primitives compose freely:

```
┌─────────────────────────────────────────────────────────┐
│  MODE   — behavioral overlay (complexity-aware, plan-   │
│            first, spec-first, dispatcher, chain, hybrid)│
├─────────────────────────────────────────────────────────┤
│  TEAM          CHAIN             PIPELINE               │
│  parallel      sequential        5-phase hybrid         │
│  fan-out       $INPUT / $ORIGINAL UNDERSTAND → GATHER → │
│  (up to 16)    piping            PLAN → EXECUTE → REVIEW│
├─────────────────────────────────────────────────────────┤
│  WORKERS — Pi native + claude / cursor / codex /        │
│            droid / gemini / opencode headless wrappers  │
└─────────────────────────────────────────────────────────┘
```

**Complexity-aware advisor orchestration** (used by `NORMAL`, `PLAN`, `SPEC`):

1. Simple and routine medium tasks run directly without `claude_advisor`.
2. `claude_advisor` is reserved for complex problems: architectural decisions, security/compliance impact, critical paths, broad refactors, unclear requirements, or when stuck after a reasonable attempt.
3. `grok-4.1-fast` is the **preferred non-advisor worker** (fast, capable, cheap). Falls back to `claude-haiku-4-5` if unavailable.
4. For complex parallelizable work, the agent may fan out **up to 16 non-advisor agents** in parallel.
5. For high-impact or ambiguous complex tasks, optionally request a **cross-provider second opinion** (e.g., `red-team` / `gpt-5.4`).

**Security** — three Pi-native hook layers:

| Hook | Extension | Purpose |
|---|---|---|
| `tool_call` | `security-guard` | Block destructive commands, credential exfiltration, suspicious network calls *before* execution |
| `context`   | `security-guard` | Strip prompt-injection payloads from tool results before they reach the model |
| `before_agent_start` | `security-guard` | Inject security reminders into the system prompt |

Run `/secure` on any project to get a full AI security sweep plus a portable protection installer.

---

## Repository layout

```
agent-pi/
├── package.json              Pi package manifest (peer-deps on pi-agent-core)
├── install.sh                Bootstrap installer (installs Pi + registers the package)
├── pi-doctor.sh              Health check for Pi + agent-pi configuration
├── CHANGELOG.md              Release notes — start here for what changed when
│
├── extensions/               55+ first-party TypeScript extensions
│   ├── lib/                  Shared helpers (toolkit-cli, viewer-server, widget runtime)
│   ├── pi-doom/              Bundled third-party extension (DOOM in the terminal, GPL-2.0)
│   ├── security-guard.ts     Pre-tool hook — destructive-op + injection guard
│   ├── mode-cycler.ts        Shift+Tab mode cycling + /claude overlay
│   ├── agent-team.ts         Dispatch-only team orchestrator
│   ├── agent-chain.ts        Sequential chain runner
│   ├── pipeline-team.ts      5-phase hybrid pipeline
│   ├── web-chat.ts           LAN / tunnel chat server
│   ├── board-viewer.ts       Kanban board (Commander-backed, local-first)
│   ├── plan-viewer.ts        Browser plan approval
│   ├── spec-viewer.ts        Browser spec review (Kiro-style)
│   ├── completion-report.ts  Unified diffs + per-file rollback
│   ├── subagent-widget.ts    Live subagent status + watchdog timers
│   ├── dream-scheduler.ts    Global memory-consolidation freshness tracker
│   ├── memory-cycle.ts       Compaction-aware snapshot/restore
│   ├── tool-search.ts        Dynamic tool discovery
│   ├── tool-caller.ts        Programmatic tool invocation
│   ├── lean-tools.ts         Swap full roster for a search-based meta-toolset
│   └── __tests__/            Vitest unit tests + fixtures
│
├── agents/                   Agent defs + orchestration YAML
│   ├── teams.yaml            Team composition
│   ├── agent-chain.yaml      Chain definitions ($INPUT / $ORIGINAL templating)
│   ├── pipeline-team.yaml    Pipeline phases
│   ├── models.json           Model routing + preferences
│   ├── toolkit-models.json   Worker-CLI model mappings
│   ├── workers/  builders/  tester/  dream/  team/  examples/
│   └── claude-advisor.md     Opus-backed advisor definition
│
├── skills/                   26 skill packs (pi-agent-orchestrator, qa-automation, …)
├── commands/                 Toolkit slash commands (markdown-driven)
├── prompts/                  Prompt templates (incl. Commander CLI-backed workflows)
├── themes/                   11 theme JSONs
├── scripts/                  pi-agent-orchestrator.mjs bridge + utilities
├── tex/                      Standalone "Text Tools" browser app
└── tests/                    Playwright + integration tests
```

---

## Installation and prerequisites

### Requirements

| | |
|---|---|
| OS | macOS or Linux |
| Node | ≥ 18 |
| Terminal | Truecolor + Unicode (iTerm2, Kitty, WezTerm, Alacritty, Ghostty) |

Optional external CLIs — install whichever worker roles you want to use:

`claude` (Claude Code CLI) · `cursor-agent` · `codex` · `droid` · `gemini` · `opencode`

### Install paths

| Situation | Command |
|---|---|
| Don't have Pi yet | `git clone https://github.com/earendil-works/pi.git && cd pi && ./install.sh` |
| Already have Pi  | `pi install git:github.com/earendil-works/pi` |

### Environment

```bash
cp .env.example .env   # then fill in the keys you'll actually use
```

Commonly-needed keys:

| Variable | Used by |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` / `PI_CLAUDE_OAUTH_TOKEN` / `ANTHROPIC_OAUTH_TOKEN` | `oauth-provider` → `claude-worker`, `claude-advisor`, Cloud Code skill |
| `OPENROUTER_API_KEY` | `openrouter-routing` extension |
| `AGENTMAIL_API_KEY`  | `send-email` skill |
| `JIRA_API_TOKEN`     | Optional Jira integration |

---

## Usage recipes

### Dispatch a worker

```text
dispatch_agent {
  agent: "claude-worker",
  task:  "Implement the approved refactor plan"
}
```

The `subagent-widget` renders a live console preview with status, token counts, watchdog countdown, and cancel controls. Third-party CLI workers (`cursor-worker`, `codex-worker`, `droid-worker`, `gemini-worker`, `opencode-worker`) share the same surface.

### Ask the Opus advisor (read-only)

```text
claude_advisor {
  question:     "Should we split the service into read/write paths?",
  task_context: "Monolith handler under load; p99 latency regressing",
  files:        ["api/server.ts", "api/routes/index.ts"]
}
```

The advisor returns guidance, risks, alternatives, and next actions. It never mutates files.

### Define a team (YAML)

`agents/teams.yaml`:

```yaml
plan-build:
  - planner
  - builder
  - reviewer
```

Each name resolves to `agents/<role>/<name>.md` with YAML frontmatter describing model, tools, and prompt.

### Define a chain

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

### Drive Pi from Claude Code via the orchestrator bridge

```bash
# See what's exposed
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

Or, inside Claude Code:

```text
/plugin marketplace add .
/plugin install pi-agent-orchestrator@agent-pi-marketplace
```

---

## Extensions by capability

Browse `extensions/*.ts` for the full list; grouped here for discoverability.

**UI & chrome** — `agent-banner`, `footer`, `agent-nav`, `theme-cycler`, `escape-cancel`, `summary-mode`, `summary-runtime-patch`

**Modes & orchestration** — `mode-cycler`, `agent-team`, `agent-chain`, `pipeline-team`, `subagent-widget`, `claude-advisor`, `toolkit-commands`, `complex-problem-loop`

**Tasks & coordination** — `tasks`, CLI-backed `commander-mcp`, `commander-tracker`, `board-viewer`, `user-question`

**Security** — `security-guard`, `secure`, `message-integrity-guard`, `vuln-scanner`, `security-news`, `security-report`, `safe-port-scan`, `network-inspect`

**Browser viewers** — `plan-viewer`, `spec-viewer`, `completion-report`, `file-viewer`, `reports-viewer`, `research-viewer`, `test-viewer`, `cleanup-viewer`

**Memory & continuity** — `memory-cycle`, `session-replay`, `session-recap`, `system-select`, `dream-scheduler`, `obsidian-memory`, `learn`

**Remote access & notifications** — `web-chat`, `sounds`, `send-email`

**Dev ergonomics** — `debug-capture`, `web-test`, `tool-registry`, `tool-search`, `tool-caller`, `lean-tools`, `openrouter-routing`, `tool-response-attribution`

**Auth** — `oauth-provider`

**Bundled third-party** — `pi-doom/` (DOOM in the terminal by Mario Zechner, GPL-2.0; independent `package.json`)

---

## Dependencies

### Peer (provided by Pi)

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

`typescript-eslint` + `@eslint/js` (lint) · `vitest` (unit) · `playwright` (E2E, see `playwright.config.ts`) · `mako` (`npm run security:scan`)

---

## Scripts

```bash
npm run lint            # ESLint over the whole package
npm run lint:fix        # ESLint autofix
npm run security:scan   # mako security scan
./pi-doctor.sh          # Diagnose Pi + agent-pi install health
./install.sh            # Bootstrap Pi + register the package
```

---

## Contributing

1. **Fork + clone** your copy of the repo.
2. **Install Pi** — follow upstream [Pi](https://github.com/earendil-works/pi) instructions, or run `./install.sh` for a one-shot bootstrap.
3. **Install dev deps** — `npm install` at the project root.
4. **Run locally** — `pi` from the project root; the package's `pi` manifest auto-loads everything under `extensions/`, `skills/`, `themes/`, and `prompts/commander/`.
5. **TDD first** — write a failing test in `extensions/__tests__/`, watch it fail, then implement. Run with `npx vitest`.
6. **House style**
   - Every source file opens with a two-line `// ABOUTME:` header.
   - Match the existing style of the file you're editing.
   - Keep PRs focused — one concern per PR.
   - No temporal words in comments ("recently", "new", "moved").
7. **Do not push private content** — `skills/private/`, `extensions/private/`, `commands/private/` must never leave the private remote. A local pre-push hook (`.githooks/`) enforces this.

> ⚠️ The older [`CONTRIBUTING.md`](./CONTRIBUTING.md) references a legacy nested `agent/` layout and a root `settings.json` that no longer exist — the flat layout described above is the current structure (see `CHANGELOG.md` 2.0.0).

Issues, discussions, and feature ideas are welcome on GitHub.

---

## License

[MIT](./LICENSE) — Copyright © 2025 Ricardo Ruiz.

The bundled `extensions/pi-doom/` is **GPL-2.0** (Mario Zechner). Pi itself is a separate project with its own license; see upstream [`pi`](https://github.com/earendil-works/pi).

---

## Pointers

- Runtime this package extends — [Pi](https://github.com/earendil-works/pi)
- Release history — [CHANGELOG.md](./CHANGELOG.md)
- Agent-facing repo rules — [CLAUDE.md](./CLAUDE.md)
- Web Chat deep-dive — [docs/web-chat.md](./docs/web-chat.md)
- Screenshots and supplementary docs — [`docs/`](./docs/)
