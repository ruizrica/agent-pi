<div align="center">

<img src="agent-logo.png" alt="agent" width="240" />

<br/>

**An extension suite that turns [Pi](https://github.com/badlogic/pi-mono) into a multi-agent orchestration platform**

[Install](#install) · [Extensions](#extensions) · [Modes](#operational-modes) · [Skills](#skills-library) · [Task Tracking](#task-tracking-with-cmd) · [Orchestration](#multi-agent-orchestration)

</div>

---

## What is this?

[Pi](https://github.com/badlogic/pi-mono) is a terminal-based AI coding agent by [@badlogic](https://github.com/badlogic). Out of the box it's a single-agent assistant with tool use, conversation memory, and a TUI.

**agent** is a Pi package — **43 extensions, 11 themes, and 30+ skills** that transform Pi into something more:

- **6 operational modes** — NORMAL, PLAN, SPEC, PIPELINE, TEAM, CHAIN
- **Multi-agent orchestration** — dispatch teams, run sequential chains, or execute parallel pipelines
- **`cmd` task tracking with a mission-brief guard** — `scripts/cmd` wrapper refuses root tasks without a clear "what & why"
- **Curated skill library** — diagnostics, planning, refactoring, code review, triage, writing
- **Security hardened** — pre-tool-hook guard blocks destructive commands, detects prompt injection, prevents data exfiltration
- **Browser-based viewers** — interactive plan review, completion reports with rollback, spec approval with inline comments
- **11 themes** — Catppuccin, Dracula, Nord, Synthwave, Tokyo Night, and more

Everything is configuration — no forks, no patches. Just extensions, agent definitions, and YAML.

<!-- TODO: add a hero screenshot here — e.g. a full TUI capture showing the agent banner, mode bar, and the cmd footer. Place at docs/screenshots/hero.png -->

## Install

### One-line installer (recommended)

Don't have Pi installed? No problem. The installer handles everything — installs Pi, registers the package, and configures settings in one go:

```bash
git clone https://github.com/ruizrica/agent-pi.git && cd agent-pi && ./install.sh
```

### Already have Pi?

```bash
pi install git:github.com/ruizrica/agent-pi
```

Pi discovers all extensions, themes, and skills automatically.

### First Steps

1. **Type a task** — Pi operates in plan-first mode. It will ask you to define tasks before using tools.
2. **Shift+Tab** — Cycle through operational modes (NORMAL → PLAN → SPEC → PIPELINE → TEAM → CHAIN)
3. **Ctrl+X** — Cycle themes
4. **`/agents-team`** — Switch between agent teams
5. **`/chain`** — Switch between chain workflows
6. **`/tex`** — Open Text Tools in the browser

## Package Structure

```
├── package.json         Pi package manifest
├── extensions/          43 TypeScript extensions + lib/
├── themes/              11 custom terminal themes
├── skills/              30+ skill packs (incl. mattpocock/skills import)
├── scripts/             cmd wrapper + tests (mission-brief guard)
├── agents/              Agent definitions + chain/pipeline/team YAML
├── commands/            Toolkit slash commands
├── prompts/             Prompt templates
└── tex/                 Text Tools — standalone text manipulation app
```

## Extensions

### Core UI

| Extension | Description |
|-----------|-------------|
| **agent-banner** | ASCII art banner on startup, auto-hides on first input |
| **footer** | Status bar — model name, context %, working directory |
| **agent-nav** | F1-F4 navigation shared across agent widgets |
| **theme-cycler** | Ctrl+X to cycle through installed themes |
| **escape-cancel** | Double-ESC cancels all running operations |

### Task Management

| Extension | Description |
|-----------|-------------|
| **tasks** | Task discipline — define tasks before tools unlock; idle → inprogress → done lifecycle |
| **commander-mcp** | Bridge exposing Commander v2 (`cmd`) dashboard tools as native Pi tools |
| **commander-tracker** | Reconciles local tasks with Commander; retries failed sync |

See [Task Tracking with cmd](#task-tracking-with-cmd) for the full task-tracking workflow including the mission-brief enforcement wrapper.

### Operational Modes

| Extension | Description |
|-----------|-------------|
| **mode-cycler** | Shift+Tab cycles NORMAL / PLAN / SPEC / PIPELINE / TEAM / CHAIN |

Each mode injects a tailored system prompt. PLAN mode enforces plan-first workflow. SPEC mode drives spec-driven development. TEAM/CHAIN/PIPELINE modes activate their respective orchestration systems. The skills shipped in this release (especially `diagnose` and `grill-with-docs`) pair naturally with PLAN and any future diagnostics-oriented mode.

### Multi-Agent Orchestration

| Extension | Description |
|-----------|-------------|
| **agent-team** | Dispatch-only orchestrator — primary agent delegates to specialists via `dispatch_agent` |
| **agent-chain** | Sequential pipeline — each step's output feeds into the next via `$INPUT` |
| **pipeline-team** | 5-phase hybrid — UNDERSTAND → GATHER → PLAN → EXECUTE → REVIEW |
| **subagent-widget** | Background subagent management with live status widgets |
| **toolkit-commands** | Dynamic slash commands from markdown files |

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

<div align="center">
<img src="docs/screenshots/plan-viewer.png" alt="Plan Viewer — structured plan approval with phases, context, and file action badges" width="720" />
<br/><em>Plan Viewer — structured plan with approval controls, phase blocks, and inline code references</em>
</div>

<div align="center">
<img src="docs/screenshots/completion-report.png" alt="Completion Report — file change stats, summary, and unified diffs with rollback" width="720" />
<br/><em>Completion Report — file change stats, work summary, and per-file rollback</em>
</div>

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

## Skills Library

agent-pi ships with **30+ skills** covering planning, diagnostics, code review, refactoring, and writing. Skills are discoverable by Pi automatically and can be invoked via slash commands.

### Skills imported from mattpocock/skills (new in this release)

The following 13 skills were imported from [mattpocock/skills@main](https://github.com/mattpocock/skills) and adopted as project defaults. Three of them (`triage`, `to-issues`, `to-prd`) were hand-ported to use the local `cmd` CLI instead of generic issue trackers.

| Skill | Slash | Purpose |
|-------|-------|---------|
| **diagnose** | `/diagnose` | Disciplined bug-resolution loop: reproduce → minimise → hypothesise → instrument → fix → regression-test |
| **grill-me** | `/grill-me` | Intensive self-critique of a plan or design |
| **grill-with-docs** | `/grill-with-docs` | Plan validation against `CONTEXT.md` and `docs/adr/` — catches domain-language drift and ADR conflicts |
| **prototype** | `/prototype` | Build a throwaway prototype before committing to a design |
| **improve-codebase-architecture** | `/improve-architecture` | Find deepening / refactoring opportunities using ADR + CONTEXT |
| **tdd** | `/tdd` | Red-green-refactor test-driven development workflow |
| **triage** | `/triage` | Issue state machine via `cmd` labels (`bug`/`enhancement` × `triage:*`) |
| **to-issues** | `/to-issues` | Break a plan into vertical-slice `cmd` tasks (AFK/HITL marked) |
| **to-prd** | `/to-prd` | Synthesize a PRD from current context, file as a `cmd` root task |
| **zoom-out** | `/zoom-out` | Request higher-level context when navigating unfamiliar code |
| **handoff** | `/handoff` | Condense conversation into a handoff document for the next agent |
| **caveman** | `/caveman` | Ultra-compressed communication mode (~75% token reduction) |
| **write-a-skill** | `/write-a-skill` | Framework for authoring new skills with proper structure |

### Existing skill catalog

Pre-existing skills continue to ship: `agent-browser`, `agent-memory`, `autoresearch`, `qa-automation`, `just-bash`, `nano-banana`, `slack-web`, `building-native-ui`, `native-data-fetching`, `use-dom`, the `expo-*` family, and more.

<!-- TODO: add a screenshot of /diagnose or /triage in action, showing the slash command flow. Place at docs/screenshots/skills-in-action.png -->

## Task Tracking with `cmd`

agent-pi uses **[Commander v2](https://github.com/ruizrica/cmd) (`cmd`)** as the canonical task tracker. The `commander-mcp` and `commander-tracker` extensions expose `cmd` to Pi as native tools.

### Agent contract

Run `cmd guide agent` to print the 8-rule agent contract — identity flags, claim semantics, mission-brief requirements, comment types, and status transitions. Most agent runners are configured to print this on session start.

Common commands:

```bash
cmd task list                                                                  # All tasks
cmd task add "Title" --mission-brief "what & why" --runtime claude-code --model <m>   # Root task
cmd task add "Title" --parent <id> --runtime claude-code --model <m>                  # Subtask
cmd context <id>                                                               # Full task context bundle
cmd task claim <id> --runtime claude-code --model <m>                          # Claim work
cmd task comment <id> "msg" --type progress|error                              # Log progress
cmd task update <id> --status completed --runtime claude-code --model <m>      # Complete
```

### Mission-brief enforcement (`scripts/cmd`)

A wrapper at `scripts/cmd` shadows the real `cmd` binary. It intercepts only `cmd task add` — every other subcommand passes through unchanged.

If a **root** `task add` is attempted **without** `--mission-brief` (and without `--parent`), the wrapper exits with code 2 and refuses to create the task:

```
🛑 cmd-guard: refusing to create a root task without --mission-brief.

Root tasks (no --parent) MUST include --mission-brief "1-3 sentence what & why".

Either:
  1. Add a brief, then retry:
       cmd task add "..." --mission-brief "what & why" --runtime claude-code --model <m>
  2. Make this a subtask by adding --parent <id>:
       cmd task add "..." --parent <id> --runtime claude-code --model <m>
```

**Activation.** Prepend `scripts/` to your `PATH` so the wrapper resolves before the real binary:

```bash
# In your shell rc (one-time), or a per-project .envrc / direnv config:
export PATH="$(pwd)/scripts:$PATH"

# Verify:
which cmd   # → .../agent-pi/scripts/cmd
```

**Bypass.** For test/edge cases, set `CMD_GUARD=off` in the env — the wrapper will warn but pass the call through.

**Tests.** `scripts/cmd.test.sh` is a TDD harness for the wrapper — 10 assertions across 6 scenarios. Run it any time:

```bash
scripts/cmd.test.sh
# → Results: 10 passed, 0 failed
```

<!-- TODO: add a screenshot of the mission-brief guard rejecting a task and the cmd dashboard mission card. Place at docs/screenshots/mission-brief-guard.png -->

## Multi-Agent Orchestration

### Teams

Teams are defined in `agents/teams.yaml`. Each team is a list of agent names. Agent definitions live in `agents/*.md` with YAML frontmatter.

```yaml
plan-build:
  - planner
  - builder
  - reviewer
```

### Chains

Chains are sequential pipelines defined in `agents/agent-chain.yaml`. Each step specifies an agent and a prompt template with `$INPUT` (previous output) and `$ORIGINAL` (user's original prompt).

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

### Pipelines

Pipelines are defined in `agents/pipeline-team.yaml` and combine sequential phases with parallel agent dispatch.

## Security

The security system operates at three layers:

1. **`tool_call` hook** — Pre-execution gate blocks dangerous commands before they run
2. **`context` hook** — Content scanner strips prompt injections from tool results
3. **`before_agent_start` hook** — System prompt hardening reminds the agent of security rules

The `/secure` command runs a comprehensive AI security sweep on any project and can install portable protections.

## Themes

11 themes included. Cycle with **Ctrl+X**:

Catppuccin Mocha · Cyberpunk · Dracula · Everforest · Gruvbox · Midnight Ocean · Nord · Ocean Breeze · Rose Pine · Synthwave · Tokyo Night

## Text Tools

A lightweight, zero-dependency text manipulation app bundled in `tex/`. Open it with `/tex` or directly at `tex/index.html`.

- **15 stackable operations** — trim, dedupe, sort, case transforms, regex replace, and more
- **Before/after diff view** — see exactly what changed
- **No backend, no build step** — single HTML page, works offline
- **Dark theme** — matches the terminal aesthetic

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Extensions not loading | `pi install git:github.com/ruizrica/agent-pi` — reinstall the package |
| No themes available | Same as above — themes are auto-discovered from the package |
| Shift+Tab not working | Ensure mode-cycler extension loaded — check `pi config` |
| No chains/pipelines | Agent configs at `agents/` are loaded automatically by extensions |
| `cmd` not resolving to the wrapper | Verify `scripts/` is first in your `PATH`. Run `which cmd` — it should point to `agent-pi/scripts/cmd`. |
| Mission-brief guard blocked a legitimate task | Re-run with `--mission-brief "..."` (root) or `--parent <id>` (subtask). Bypass for testing only via `CMD_GUARD=off`. |

## Built on Pi

This project is a configuration and extension layer for [Pi Coding Agent](https://github.com/badlogic/pi-mono) by Mario Zechner ([@badlogic](https://github.com/badlogic)). Pi provides the core runtime, TUI framework, LLM integration, and extension API.

---

By [Ricardo Ruiz](https://ruizrica.io)

Inspired by the work of [IndyDevDan](https://www.youtube.com/@indydevdan) — check out his [excellent video on Pi](https://youtu.be/f8cfH5XX-XU?si=RcZoSAKeASaU-lPM) that helped shape this project.

## License

[MIT](LICENSE)
