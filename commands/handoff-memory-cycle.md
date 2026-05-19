---
name: handoff-memory-cycle
description: "Compatibility reference for the former memory-aware handoff flow; use /cycle-context."
argument-hint: "[focus for continuation]"
allowed-tools: '["read"]'
context: inline
---

# /handoff-memory-cycle — Compatibility Reference

This name is kept only for discovery by users who remember the former memory-aware handoff flow.

Use the clearer commands instead:

- `/handoff <focus>` — standalone pointer-based handoff only.
- `/cycle-context <focus>` — Project Memory Pack checkpoint/update-docs flow, pointer-based handoff, milestone/wiki readiness checks, and optional native `cycle_memory` when explicitly requested.

## Why this changed

There should not be two competing handoff flows. `/handoff` is for concise continuation pointers. `/cycle-context` is for preserving context across the broader memory system.

## Guardrails

- Do not implement a separate compact or handoff workflow here.
- Do not update `STATE.md`, `journal/`, `BACKLOG.md`, or `FEATURES.md` from this compatibility command; use `/cycle-context`.
- Do not claim memory was compacted unless the native compaction path was actually triggered by `/cycle-context`.
- Do not reintroduce a local command or skill named `compact`.
