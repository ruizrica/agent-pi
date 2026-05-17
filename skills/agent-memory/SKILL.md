---
name: agent-memory
description: Search and manage local agent memories with hybrid vector + BM25 retrieval and code navigation. Use when the user asks about past decisions, cross-session context, memory search, setup indexing, or local code/file-tree navigation.
---

# Agent Memory

`agent-memory` is a local CLI for durable agent memory and code navigation. It complements Pi native memory-cycle: Pi compaction keeps daily/session continuity, while `agent-memory` makes decisions, patterns, root causes, and code structure searchable.

## Quick start

```bash
agent-memory status --json
agent-memory search "topic" --json
agent-memory index
agent-memory add "decision or pattern" --source memory --tags "tag1,tag2"
```

## Code tree navigation

Use these when file structure matters or semantic navigation is faster than broad grep:

```bash
agent-memory code-index ./src
agent-memory code-tree --json
agent-memory code-nav "where compaction state is written" --json
agent-memory code-refs <id> --json
agent-memory code-summarize
```

## Workflow integration

- **`/setup`** — check `agent-memory status`, run `agent-memory index` when needed, and offer `code-index <repo-or-worktree>` for tree navigation.
- **Recon / planning** — search memory before rediscovering past decisions; use `code-nav` before broad file reads when the index exists.
- **Diagnose / investigate** — search prior incidents and root causes; use `code-nav` to find likely seams; add one verified root-cause memory after the fix.
- **Complex loops** — search at recon start; add durable decisions after reflection milestones.
- **Handoff / compact / save** — preserve Pi native memory-cycle, then add only concise durable memories when there is a reusable lesson.

## Memory write rubric

Store:

- durable decisions and rationale
- project conventions and architecture boundaries
- verified root causes and fix patterns
- repeatable commands/workflows
- explicit user preferences that should affect future sessions

Do not store:

- secrets, credentials, tokens, or private env values
- noisy logs, full diffs, or full handoffs/transcripts
- transient task state already captured by `/handoff`, `.context/session-state.json`, or `cmd`
- unverified hypotheses or speculation

## Pi integration

Use `/agent-memory <subcommand>` as the slash-command dispatcher when working interactively in Pi.

Pi may also have native memory tools, Obsidian-backed tools, and automatic compaction memory. Use `agent-memory` specifically for indexed search, durable facts, and code/file-tree navigation.

## Guardrails

- Prefer `--json` when Pi will parse output.
- Keep added memories short, factual, and reusable.
- If the CLI is missing, ask the user to install the trusted local/bundled tool; do not run remote shell installers.
