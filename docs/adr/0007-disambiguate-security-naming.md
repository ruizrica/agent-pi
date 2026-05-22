# ADR 0007 — Disambiguate Security Module Naming by Concern

Three distinct security concerns share the 'security' naming root: runtime policy enforcement (blocking dangerous system operations, privilege escalation, env dumps, URL uploads), vulnerability scanning (on-demand scanner), and message integrity / prompt injection prevention. This naming ambiguity forces developers to open files to understand which concern each module addresses. The decision: rename security-engine.ts → runtime-policy-engine.ts to surface the actual seam between runtime policy (enforced at tool-call time) and vulnerability scanning (triggered on demand), making each concern self-documenting at the file-system level.

## Status

Accepted

## Context

Three distinct security concerns currently share overlapping 'security' naming:

1. **Runtime policy enforcement** (`security-guard.ts`, ~931 lines) — blocks dangerous system operations like recursive forced deletion, privilege escalation, environment variable dumps, and URL uploads at tool-call execution time.
2. **Vulnerability scanning** (`security/security-engine.ts`, `security/vuln-scanner-engine.ts`) — triggered on demand to scan for known vulnerabilities.
3. **Message integrity & prompt injection prevention** (`message-integrity-guard.ts`, ~398 lines) — validates message content and detects injection attacks.

Additionally, ADR-0002 identified 4 dead top-level copies of the `security/` subdirectory files that should be deleted.

The problem: a developer reading `security-engine.ts` cannot immediately tell whether it handles runtime policy, vulnerability scanning, or message integrity without opening the file. This is especially costly in file tree navigation, search results, and AI code navigation. While comments and module docs can clarify, they are invisible in these contexts.

The real seam is between **runtime policy** (enforced at tool-call time via security-guard.ts) and **vulnerability scanning** (triggered separately). This is not an arbitrary split — it reflects two distinct adapters and extension points.

## Decision

1. **Delete the 4 dead top-level copies** (covered by ADR-0002).
2. **Rename `security-engine.ts` → `runtime-policy-engine.ts`** to reflect its actual concern and responsibility.
3. **Keep `vuln-scanner-engine.ts`** — already well-named; makes the distinction from runtime policy obvious.
4. **Keep `message-integrity-guard.ts`** — already well-named and isolated from the other two.

Each file and concern now has a clear, specific name. Each seam has a clear adapter on each side.

## Why

File names are the first thing navigators see — in file trees, IDE outlines, search results, and AI code readers. When three concerns share one name, every navigation context requires opening the file to disambiguate. Renaming costs nothing functionally (just import path updates) and makes each concern self-documenting.

## Considered Options

1. **Keep current names, rely on ABOUTME comments or module documentation** — rejected because comments are invisible in file trees and search results. The cost of understanding falls on every reader.
2. **Merge all security concerns into one module** — rejected because the seam between runtime policy and vulnerability scanning is real, reflected in two distinct adapters (guard extension vs scanner extension) and two different trigger points (tool-call time vs on-demand).

## Consequences

- Import paths change for all consumers of `security-engine`:
  - `security-guard.ts` (imports runtime-policy-engine)
  - `security-report.ts` (imports runtime-policy-engine)
  - Any tests or re-exports that reference the old path
- The rename is mechanical (search-replace on import paths); no behavioral changes.
- Future 'security-*' files should be named after their specific concern, not the generic security root. Examples: `cryptographic-signing.ts`, `api-secret-validation.ts`, not `security-signing.ts`.
