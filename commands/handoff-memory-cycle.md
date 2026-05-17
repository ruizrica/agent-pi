---
name: handoff-memory-cycle
description: "Reference helper for the former local compact workflow; use /handoff for memory-aware handoffs."
argument-hint: "[focus for continuation]"
allowed-tools: '["bash", "read", "write", "cycle_memory"]'
context: inline
---

# /handoff-memory-cycle — Former Compact Workflow Reference

The repository no longer registers a local `/compact` command because that name conflicts with Pi's native/system compact behavior.

Use `/handoff` instead:

- Run `/handoff` for a standalone handoff document.
- Run `/handoff <focus>` with an explicit request such as "handoff and compact" or "cycle memory after handoff" when you want the handoff written first and then Pi's native `cycle_memory` path triggered.

This file keeps the former memory-aware workflow discoverable under a non-conflicting command name, but `/handoff` is the canonical entry point.

## Memory-aware handoff model

1. Create or update a concise handoff in `.context/handoffs/` using the `/handoff` structure.
2. Optionally extract one durable memory only for lasting decisions, verified root causes, architecture boundaries, reusable workflows, or project-specific gotchas.
3. Trigger Pi's native `cycle_memory` compaction path only when explicitly requested and available.
4. Report the handoff path, memory-compaction status, and restore hint.

## Guardrails

- Do not duplicate plans, specs, diffs, logs, or transcripts; reference artifacts by path or URL.
- Do not include secrets or credentials.
- Do not claim memory was compacted unless the native compaction path was actually triggered.
- Do not reintroduce a local command or skill named `compact`.
