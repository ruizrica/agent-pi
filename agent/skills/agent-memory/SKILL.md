# agent-memory — Local Hybrid Search Memory System

## What It Does

`agent-memory` is a CLI tool that indexes your markdown memory files (`~/.claude/agent-memory/`) into SQLite and provides **hybrid search** (0.7 vector + 0.3 BM25), fully local with zero API calls.

## When to Use

- **Searching past context**: Find relevant memories before starting a task
- **Before `/restore`**: Search for specific topics across all daily logs and session snapshots
- **Cross-session recall**: "What did we decide about X?" — search instead of scrolling
- **Adding structured memories**: Store key decisions/patterns for retrieval

## Quick Reference

```bash
# Search (main feature)
agent-memory search "query"                  # Hybrid: 0.7 vector + 0.3 BM25
agent-memory search "query" --vector         # Vector-only (semantic)
agent-memory search "query" --keyword        # BM25-only (exact match)
agent-memory search "query" --limit 10 --json

# Index management
agent-memory index                           # Reindex all memory files
agent-memory index --path /custom/path       # Index specific path
agent-memory status                          # File count, chunk count, last indexed

# CRUD
agent-memory add "content" --tags "t1,t2" --source daily
agent-memory list [--source memory|daily|session] [--limit 20]
agent-memory get <id>

# Intelligence (requires ANTHROPIC_API_KEY)
agent-memory ask "what do I know about X?"   # Q&A over memories
agent-memory summarize                       # Consolidate daily logs

# Code Navigation (tree-sitter AST, 165+ languages)
agent-memory code-index ./src                # Index codebase
agent-memory code-nav "hybrid search"        # Navigate to relevant code
agent-memory code-tree                       # Display tree structure
agent-memory code-summarize                  # Generate node summaries
agent-memory code-refs 42                    # Show cross-references

# Setup
agent-memory install                         # Download ~67MB embedding model
```

## Typical Workflow

1. Run `agent-memory index` to index all memory files
2. Run `agent-memory search "topic"` to find relevant context
3. Use `--json` flag for machine-readable output
4. Use `agent-memory add` to store key decisions

## When NOT to Use

- For reading a specific known file → use `Read` tool directly
- For writing to MEMORY.md → edit the file directly
- For session state management → use `/compact` and `/restore`
