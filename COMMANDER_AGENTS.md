# COMMANDER_AGENTS.md

> This project uses **Commander v2** for agent-native task tracking.
> The board is a UI shell; the CLI is your read/write interface to it.

## Quick reference

```bash
cmd task add "Wire X" --priority high
cmd task list                           # all tasks
cmd task show <id>                      # single task
cmd task update <id> --status working
cmd task update <id> --description "rewrite"
cmd task delete <id> --yes              # remove a task
cmd tree                                # hierarchy
cmd context <id>                        # parent + children + comments
cmd mailbox send <agent> <subject> <body>
cmd mailbox inbox
cmd guide overview                      # full command reference
cmd whoami                              # agent identity
```

## Agent Identity Contract

Pi → Commander communication flows through `cmd` CLI invocations via `execFile`. Every Pi command inserts two flags at **position 2** of argv (after subcommand + sub-subcommand) to declare the invoking agent's identity:

- `--runtime <label>` — the agent runtime (e.g., `claude-code`, `pi`, `cursor`, `gemini`)
- `--model <name>` — the LLM model in use (e.g., `opus-4.7`, `gpt-4`)

Example argv transformations:
- `["task", "list", "--json"]` becomes `["task", "list", "--runtime", "pi", "--model", "opus-4.7", "--json"]`
- `["mailbox", "send", "agent", "subject", "body"]` becomes `["mailbox", "send", "--runtime", "pi", "--model", "opus-4.7", "agent", "subject", "body"]` (positionals remain at tail)

Defaults: `PI_RUNTIME_LABEL` env → `"pi"`; `PI_MODEL` env (with fallback to `ANTHROPIC_MODEL`, `PACIFICO_MODEL`, `CLAUDE_MODEL`) → `"unknown"`.

The `cmd` CLI also accepts identity flags **before the subcommand** (legacy pattern) and automatically normalizes them to post-subcommand position via `liftIdentityFlagsToTail()`. Both patterns produce identical behavior.

Without these flags the Commander board shows task assignees as `"unknown"`.

### Session identity

Pi registers itself with Commander on session start using `commander_orchestration { operation: "agent:register" }`. The default name is `pi-${shortHostname}-${pid}` (e.g. `pi-ricardo-mbp-48213`), which is stable within a session and human-readable. Override with `PI_AGENT_NAME` environment variable for a stable cross-session name, or `PI_SUBAGENT_NAME` to mark a process as a subagent (sets `agent_type=pi-subagent` and `role=worker`). The same name is reused for heartbeats and task ownership via `currentActor()`, so the board shows one consistent row per process.

## Stage notice

Commander v2 is in shell-first stage. The CLI's data layer is a
**mock-state JSON file** at `.commander/mock-state.json`. Mutations
persist locally but do not yet flow to the renderer's kanban view —
see `docs/HOST.md` for the planned alignment path.

## Statuses

The bridge accepts free-form status strings. Conventional values:
`pending`, `working`, `needs_review`, `completed`, `failed`,
`cancelled`. Agents may introduce new ones.

## All commands

| Command | Description |
|---------|-------------|
| `cmd init` | Initialize project in current directory |
| `cmd task add` | Create a new task |
| `cmd task list` | List tasks (filterable) |
| `cmd task show <id>` | Full task context |
| `cmd task update <id>` | Update task fields, status, or description |
| `cmd task delete <id>` | Delete a task (alias `rm`; pass `--yes` to skip confirmation) |
| `cmd tree` | Hierarchical task tree |
| `cmd context <id>` | Rich context bundle |
| `cmd bs create` | Create a brainstorm |
| `cmd bs list` | List brainstorms |
| `cmd bs show <id>` | Read a brainstorm |
| `cmd bs update <id>` | Add a new version |
| `cmd mailbox send/inbox/read` | Mailbox messages |
| `cmd dep add/list/blockers` | Task dependencies |
| `cmd session list/cleanup` | Session management |
| `cmd project list/show/switch` | Project context |
| `cmd guide [topic]` | Skill primers |
| `cmd whoami` | Identity context |
