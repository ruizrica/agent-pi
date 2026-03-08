# Toolkit Integration for Pi

The [toolkit](https://github.com/ruizrica/toolkit) plugin provides 9 agents, 20 commands, and 2 skills for multi-agent orchestration, TDD workflows, and advanced productivity.

## Quick Reference

### Update

```bash
# From Pi:
/toolkit-update

# Or from shell:
bash ~/.pi/agent/scripts/sync-toolkit.sh
```

### File Locations

| Component | Path |
|-----------|------|
| Agents | `~/.pi/agent/.pi/agents/toolkit/` |
| Commands | `~/.pi/agent/.pi/prompts/toolkit/` |
| Skills | `~/.pi/agent/skills/agent-memory/`, `~/.pi/agent/skills/just-bash/` |
| Model config | `~/.pi/agent/.pi/agents/models.json` |
| Team config | `~/.pi/agent/.pi/agents/teams.yaml` |
| Sync script | `~/.pi/agent/scripts/sync-toolkit.sh` |
| Toolkit repo | `~/.toolkit/` |

---

## Agents

All agents are available via `dispatch_agent` / `subagent_create` and the `/agents-team toolkit` team.

| Agent | Model | Specialty |
|-------|-------|-----------|
| `gemini-agent` | OpenRouter / Gemini 2.5 Flash | Large codebase analysis (1M tokens), Google Search |
| `cursor-agent` | Anthropic / Sonnet | Code review, refactoring, session management |
| `codex-agent` | Anthropic / Sonnet | Natural language to code, multi-language |
| `qwen-agent` | OpenRouter / Qwen3 Coder+ | Agentic coding, workflow automation |
| `opencode-agent` | OpenRouter / Gemini 2.5 Flash | 75+ AI models via OpenRouter |
| `groq-agent` | OpenRouter / Llama 4 Maverick | Fast inference, lightweight tasks |
| `crush-agent` | Anthropic / Haiku | Media compression/optimization |
| `droid-agent` | Anthropic / Sonnet | Enterprise code generation |
| `rlm-subcall` | Anthropic / Haiku | Chunk analysis helper for RLM workflow |

---

## Commands

Commands are registered by the `toolkit-commands.ts` extension with a `toolkit-` prefix.

### Fork-mode (spawn subprocesses)

| Command | Description |
|---------|-------------|
| `/toolkit-team` | Coordinate multi-agent team for parallel implementation |
| `/toolkit-haiku` | Spawn team of 10 Haiku agents managed by Opus |
| `/toolkit-opus` | Spawn team of 10 Opus agents managed by Opus |
| `/toolkit-sonnet` | Spawn team of 10 Sonnet agents managed by Opus |
| `/toolkit-review` | CodeRabbit review + parallel fixes + verification |
| `/toolkit-gherkin` | Extract business rules into Gherkin specs |
| `/toolkit-kiro` | Spec-driven development (requirements → design → tasks → execution) |
| `/toolkit-design` | Interactive design system generator (tokens, Tailwind, CSS) |
| `/toolkit-@implement` | Process @implement comments into documentation |
| `/toolkit-handbook` | Generate comprehensive project handbook |

### Inline-mode (inject as user message)

| Command | Description |
|---------|-------------|
| `/toolkit-compact` | Memory-aware session compact (triggers Pi's native hooks) |
| `/toolkit-restore` | Restore session from saved state and daily logs |
| `/toolkit-save` | Commit, merge WIP to main, cleanup |
| `/toolkit-stable` | Create stable checkpoint with tags |
| `/toolkit-worktree` | Create isolated git worktree |
| `/toolkit-setup` | Initialize project context and agent-memory indexing |
| `/toolkit-rlm` | Recursive Language Model for large documents |
| `/toolkit-just-bash` | Sandboxed bash execution (read-only, no network) |
| `/toolkit-compact-min` | Minimal compact without memory persistence |
| `/agent-memory` | Search and manage agent memories (registered without prefix) |

---

## Skills

| Skill | CLI Tool | Description |
|-------|----------|-------------|
| `agent-memory` | `agent-memory` (Python) | Local hybrid search (vector + BM25) for memory files |
| `just-bash` | `just-bash` (Node) | Sandboxed bash execution (read-only FS, no network) |

---

## Pi-native vs Toolkit Overlap

| Feature | Pi Native | Toolkit |
|---------|-----------|---------|
| Compaction | `/cycle` (memory-cycle.ts) | `/toolkit-compact` (references Pi's native hooks) |
| Restore | Auto-injected after compact | `/toolkit-restore` (manual session state restore) |
| Agent dispatch | `dispatch_agent` / `subagent_create` | `/toolkit-team` (orchestrated multi-agent) |

Both systems work together — toolkit commands delegate to Pi's native extensions.

---

## How It Works

1. **`toolkit-commands.ts`** scans `~/.pi/agent/.pi/commands/` (which symlinks to `~/.pi/agent/.pi/prompts/toolkit/`) for `.md` files with frontmatter
2. Each `.md` is registered as a Pi slash command
3. Fork-mode commands spawn `pi` subprocesses with the command body as system prompt
4. Inline-mode commands inject the body as a user message with tool restrictions
5. **`agent-defs.ts`** scans `~/.pi/agent/.pi/agents/toolkit/` for agent definitions
6. Model assignments come from `~/.pi/agent/.pi/agents/models.json`
7. Team rosters come from `~/.pi/agent/.pi/agents/teams.yaml`
