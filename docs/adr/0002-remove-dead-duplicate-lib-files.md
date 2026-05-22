# ADR 0002 — Remove Dead Duplicate Layer in extensions/lib/

- **Status:** Accepted
- **Date:** 2026-05-21
- **Owners:** Agent-pi maintainers

## Context

20+ files at the `extensions/lib/` top level are exact copies or stale diverged copies of files that have been moved into subdirectories (`claude/`, `security/`, `viewers/`). All 20 have zero external importers — the subdirectory versions are the ones actually used. Two pairs (`claude-cli.ts`, `claude-provider-stream.ts`) have diverged from their subdirectory counterparts, making them actively misleading: they look importable but contain stale code.

## Decision

Delete all 20 dead top-level duplicate files. The subdirectory versions are authoritative.

## Why

These ghost files create navigation friction — an AI navigator or new contributor must check two locations to determine which copy is real. The diverged copies (`claude-cli.ts`, `claude-provider-stream.ts`) are traps that could be accidentally imported. Removing them costs nothing (zero importers) and eliminates a persistent source of confusion.

## Considered Options

1. **Keep top-level as re-exports that re-export from subdirectory** — rejected because it adds indirection with zero benefit.
2. **Move subdirectory files back to top-level** — rejected because the subdirectory grouping (`claude/`, `security/`, `viewers/`) provides locality benefits.

## Consequences

Any future file that tries to import from the top-level path will get a compile error — which is the desired outcome since those imports were never active.
