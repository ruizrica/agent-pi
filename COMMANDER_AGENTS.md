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
