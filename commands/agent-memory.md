---
name: agent-memory
description: "Search and manage local agent memories with the agent-memory CLI, including hybrid search and code navigation."
argument-hint: "<search|index|status|add|code-index|code-nav|code-tree|code-refs|code-summarize> [args]"
allowed-tools: ["bash", "read"]
context: inline
---

# /agent-memory — Local Memory CLI Dispatcher

Run the local `agent-memory` CLI from Pi.

## Usage

```text
/agent-memory search <query>
/agent-memory index
/agent-memory status
/agent-memory add <content>
/agent-memory code-index <path>
/agent-memory code-nav <query>
/agent-memory code-tree
/agent-memory code-refs <id>
/agent-memory code-summarize
```

## Workflow

Arguments: `$ARGUMENTS`

1. Parse the first token as the subcommand.
2. If no subcommand is provided, show the usage list above plus the workflow integration notes below.
3. Verify `agent-memory` is on PATH.
   - If missing, tell the user to install the bundled/local tool manually or via the project’s trusted installer.
   - Do not run remote shell installers.
4. Run the matching CLI command.
5. Use `--json` when Pi needs to parse the output programmatically.
6. Summarize results in plain language for the user.

## Subcommands

| Subcommand | Purpose |
|---|---|
| `search <query>` | Hybrid vector + BM25 search over memories |
| `index` | Reindex memory files |
| `status` | Show memory database status |
| `add <content>` | Add a durable memory manually |
| `code-index <path>` | Index code for tree navigation |
| `code-nav <query>` | Find relevant code nodes |
| `code-tree` | Display indexed code tree |
| `code-refs <id>` | Show references for a code node |
| `code-summarize` | Generate code node summaries |

## Examples

```bash
agent-memory status --json
agent-memory index
agent-memory search "worktree save workflow" --json
agent-memory add "Pi uses /handoff for standalone continuation notes and /cycle-context for Project Memory Pack checkpoints plus optional native memory cycling" --source memory --tags "pi,handoff,memory"
agent-memory code-index ./src
agent-memory code-tree --json
agent-memory code-nav "memory cycle extension" --json
```

## Project Memory Pack boundary

The Project Memory Pack (`CLAUDE.md`, `STATE.md`, `journal/`, `BACKLOG.md`, `FEATURES.md`) is the human-readable continuity layer. `agent-memory` is the indexed retrieval layer for concise durable facts and code navigation. Do not copy full handoffs, cmd task state, diffs, or transcripts into `agent-memory`.

`journal/milestones/` contains raw milestone notes that are eligible for wiki/Obsidian raw ingestion only after review and readiness marking. Routine `.context/project-memory/changes/` entries are local change summaries and should not be ingested into the wiki.

## Workflow integration

- `/setup` is the preferred first-time place to validate `agent-memory`, refresh the memory index, and offer `code-index` for the current repo/worktree after Project Memory Pack orientation.
- At the start of substantial work, read Project Memory Pack state first, then search memory for prior decisions before rediscovering them from files.
- When locating code, prefer `code-nav`/`code-tree` if a code index exists, then fall back to normal file reads and grep.
- At `/cycle-context` or `/save` boundaries, add only concise durable memories when there is a reusable lesson. `/handoff` alone should not copy full continuation notes into memory.

## Memory write rubric

Store decisions, conventions, verified root causes, reusable commands, architecture boundaries, and explicit user preferences.

Do not store secrets, credentials, noisy logs, full diffs, full handoffs/transcripts, transient task status, or unverified hypotheses.

## Guardrails

- Keep memory content concise and durable.
- Do not store secrets, tokens, credentials, or private user data unless the user explicitly asks and it is safe to retain.
- Prefer `search` before broad file spelunking when the question is about past decisions or cross-session context.
