# Toolkit Plugin → Pi Agent Extensions Adaptation Plan

## Context

The **toolkit** repo (`ruizrica/toolkit`) is a Claude Code plugin with 9 agents, 20 commands, 2 skills, and an `agent-memory` Python tool. It's already **fully integrated** into Pi — all 9 agent `.md` files live in `.pi/agents/toolkit/` and all 20 command `.md` files live in `.pi/prompts/toolkit/`. The `toolkit-commands.ts` extension dynamically registers commands from `.pi/commands/`, and the `agent-defs.ts` loader scans `.pi/agents/` for agent definitions.

**Current state**: The toolkit files are already copied into Pi's directories and are byte-for-byte identical to the repo. What needs to happen is to **formalize the integration** so updates flow cleanly and leverage Pi's native extension capabilities.

---

## Plan

### Phase 1: Sync Infrastructure

- [ ] **1. Create a sync script** (`agent/scripts/sync-toolkit.sh`) that pulls the latest toolkit repo and copies agents/commands/skills to the right Pi directories. This replaces manual file copying and ensures updates from the toolkit GitHub repo flow into Pi cleanly.
  - Pulls/clones `ruizrica/toolkit` to `~/.toolkit` (reuses existing install path)
  - Copies agents → `.pi/agents/toolkit/`
  - Copies commands → `.pi/prompts/toolkit/`  
  - Copies skills → `agent/skills/` (agent-memory.md, just-bash.md)
  - Installs Python agent-memory tool via pip
  - Reports what changed (diff summary)

- [ ] **2. Register toolkit commands in the scanner path** — Currently `toolkit-commands.ts` scans `.pi/commands/` but toolkit commands live in `.pi/prompts/toolkit/`. Either:
  - (a) Symlink `.pi/commands/toolkit` → `.pi/prompts/toolkit/`, or
  - (b) Update `toolkit-commands.ts` to also scan `.pi/prompts/` directories
  - **Recommendation**: Option (a) — a simple symlink keeps the extension generic

### Phase 2: Adapt Commands for Pi's Extension System

- [ ] **3. Adapt fork-mode commands** — Commands with `context: fork` (like `/team`, `/haiku`, `/opus`, `/review`, `/gherkin`, `/kiro`) spawn `pi` subprocesses. The `toolkit-commands.ts` already handles this correctly using `spawn("pi", [...])`. Verify all fork commands work by doing a quick test of `/team` and `/haiku`.

- [ ] **4. Adapt inline commands** — Commands without `context: fork` (like `/compact`, `/restore`, `/save`, `/worktree`, `/setup`, `/stable`) inject their body as a user message with tool restrictions. Verify the `TOOL_MAP` in `toolkit-commands.ts` covers all tool names used in these commands (e.g., `AskUserQuestion` → `ask_user`).

- [ ] **5. Reconcile Pi-native commands with toolkit equivalents** — Some toolkit commands overlap with Pi's native extensions:
  - `/compact` → Pi has `memory-cycle.ts` with its own `/compact` and `/cycle` commands
  - `/restore` → Pi has restoration built into `memory-cycle.ts`
  - Decide: toolkit versions take precedence (they're Pi-aware already), or mark them as aliases
  - **Recommendation**: Keep Pi's native `/compact` and `/cycle` as primary, register toolkit versions as `/tk-compact` and `/tk-restore` to avoid conflicts

### Phase 3: Agent Integration

- [ ] **6. Add toolkit agents to `models.json`** — The agents are loaded by `agent-defs.ts` which reads model assignments from `.pi/agents/models.json`. Add entries for all 9 toolkit agents with their correct provider/model pairs (OpenRouter for gemini/qwen/groq/opencode, Anthropic for cursor/codex/droid/crush, etc.).

- [ ] **7. Add toolkit agents to `teams.yaml`** — Define a "toolkit" team in `.pi/agents/teams.yaml` so `/agents-team` can switch to the toolkit agent roster. This integrates with the agent-team.ts extension's team switching UI.

### Phase 4: Skills & Tools

- [ ] **8. Install agent-memory skill** — Copy `skills/agent-memory.md` to `agent/skills/agent-memory/SKILL.md` and ensure the `agent-memory` Python CLI is on PATH. The skill file teaches the agent when/how to use the CLI.

- [ ] **9. Install just-bash skill** — Copy `skills/just-bash.md` to `agent/skills/just-bash/SKILL.md` and verify `just-bash` npm package is installed globally. This enables sandboxed bash execution.

- [ ] **10. Allow Updates via repo** We must have a way to update the toolkit via the github repo address here https://github.com/ruizrica/toolkit ideally we just pull and replace the files. Find a suitable solution for this

### Phase 5: Verify & Document

- [ ] **10. End-to-end verification** — Test the full integration:
  - Run `/team "hello world"` to test fork-mode multi-agent dispatch
  - Run `/setup` to test inline command with agent-memory
  - Run `/worktree` to test inline command with bash execution
  - Verify agents appear in `/agents-list`
  - Verify `/agents-team` shows toolkit team option

- [ ] **11. Create README** — Write `agent/skills/toolkit/README.md` documenting:
  - What the toolkit provides (agents, commands, skills)
  - How to update (sync script)
  - Command reference table
  - Agent reference table
  - Known overlaps with Pi-native commands
