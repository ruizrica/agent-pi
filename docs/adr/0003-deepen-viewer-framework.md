# Deepen the Viewer Framework Module

The viewer infrastructure spans 13,530+ lines across 11 files, with each viewer reimplementing the same lifecycle pattern (HTTP server, session bridging, snapshot/restore, export). Creating a new viewer costs ~1500 lines of duplicated code. We will extract a deep viewer framework module that accepts a viewer spec (title, domain HTML, handlers) and hides all lifecycle complexity, allowing new viewers in ~100 lines.

## Context

Currently, viewer rendering is split across:
- `plan-viewer-html.ts` (2,227 lines)
- `spec-viewer-html.ts` (1,973 lines)
- `test-viewer-html.ts` (1,266 lines)
- `web-chat-html.ts` (1,300 lines)
- `completion-report-html.ts` (1,841 lines)
- 6 additional viewers

Supporting modules (`viewer-server.ts`, `viewer-session.ts`, `viewer-snapshots.ts`) provide partial infrastructure, but each viewer still carries 1000–2000 lines of unique wiring and inline HTML. The pattern is shallow: understanding any viewer requires reading both the shared module AND its unique implementation. Using the deletion test: if you deleted all `*-viewer-html.ts` files, the complexity would vanish — each is an island, signaling a missing deep module.

## Decision

Create a deep `viewer-framework` module whose public interface accepts a viewer spec:
- **title** — viewer display name
- **domain-specific HTML fragment** — the unique UI content
- **action handlers** — domain-specific message handlers

The framework hides:
- Server lifecycle (boot, shutdown, port allocation)
- Session bridging (browser ↔ Pi process message relay)
- Snapshot/restore wiring
- Scrollbar styling and layout utilities
- Standalone export (HTML + assets bundled)

Migrate existing viewers one at a time. Each migration should delete 80%+ of that viewer's HTML file.

## Why

**Cost Reduction:** Adding a new viewer drops from ~1,500 lines of infrastructure to ~100 lines of domain content.

**Locality:** Bug fixes to server lifecycle or snapshot logic currently require touching 11+ files. With the framework, they concentrate in one place.

**Testability:** Viewer infrastructure is today sparsely tested. A framework module makes it testable through a single interface.

**Reversibility:** Incremental migration allows rollback at any point.

## Considered Options

1. **Keep current pattern, add more shared utilities** — Rejected. Utilities don't hide lifecycle complexity; callers still wire it up manually.

2. **Use a templating engine (Handlebars, JSX)** — Rejected. Adds a build step and doesn't address the goal: deepen the module, not change rendering approach.

3. **Full rewrite of all viewers at once** — Rejected. Too risky; incremental migration is safer.

## Consequences

- Viewer files shrink from 1000–2000 lines to 100–300 lines.
- The framework module becomes a high-value test target, improving overall viewer reliability.
- New viewers become cheap to implement.
- Migration is incremental and reversible per viewer.
- Framework updates (e.g., new snapshot features) apply to all viewers automatically.
