---
name: agent-memory
description: "Search and manage local agent memories with the agent-memory CLI, including hybrid search and code navigation."
argument-hint: "<search|index|status|add|code-index|code-nav|code-tree|code-refs|code-summarize> [args]"
allowed-tools: '["bash", "read"]'
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
agent-memory add "Pi /handoff is the handoff-first place to preserve continuation context and can explicitly request native memory cycling" --source memory --tags "pi,handoff,memory"
agent-memory code-index ./src
agent-memory code-tree --json
agent-memory code-nav "memory cycle extension" --json
```

## Workflow integration

- `/setup` is the preferred first-time place to validate `agent-memory`, refresh the memory index, and offer `code-index` for the current repo/worktree.
- At the start of substantial work, search memory for prior decisions before rediscovering them from files.
- When locating code, prefer `code-nav`/`code-tree` if a code index exists, then fall back to normal file reads and grep.
- At handoff/save boundaries, add only concise durable memories when there is a reusable lesson.

## Memory write rubric

Store decisions, conventions, verified root causes, reusable commands, architecture boundaries, and explicit user preferences.

Do not store secrets, credentials, noisy logs, full diffs, full handoffs/transcripts, transient task status, or unverified hypotheses.

## Guardrails

- Keep memory content concise and durable.
- Do not store secrets, tokens, credentials, or private user data unless the user explicitly asks and it is safe to retain.
- Prefer `search` before broad file spelunking when the question is about past decisions or cross-session context.
