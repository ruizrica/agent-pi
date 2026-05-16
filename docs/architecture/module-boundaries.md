# Agent-Pi Module Boundaries

Agent-Pi is intended to behave like a thin shell: extension entry files expose tools, commands, events, and viewer launchers while feature logic lives in small, testable modules. New work should follow the boundaries below.

## Layers

| Layer | Location | Responsibility | Should Avoid |
|---|---|---|---|
| Extension adapter | `extensions/<feature>.ts` | Pi registration, schema validation, event hookup, command/tool rendering | Business rules, parsing, filesystem traversal, subprocess semantics |
| Feature service | `extensions/lib/<feature>/*-service.ts` | Use-case orchestration and state transitions | TUI/browser rendering, global mutable Pi state |
| Domain logic | `extensions/lib/<feature>/*-domain.ts` | Pure calculations, classification, validation, summarization | Filesystem/network/process calls |
| Runtime ports | `extensions/lib/<feature>/*-port.ts` or existing shared runtime files | Subprocesses, filesystem, HTTP, Commander, Obsidian, Claude/toolkit integration | UI decisions and business policy |
| Rendering assets | `extensions/lib/*-html.ts`, renderer helpers | Static HTML and render-specific formatting | Domain policy and side effects |

## Organized `extensions/lib` areas

These folders group related modules (imports use `extensions/lib/<area>/...`):

- **`lib/commander/`** — Commander CLI client helpers (ready gate, lifecycle, sync, viewer routing, prompts).
- **`lib/sounds/`** — Sound picker config, playback, image cache, and viewer HTML.
- **`lib/viewers/`** — Shared HTML viewer payloads (plan, spec, file, test, research, reports, board, cleanup, and related viewer modules).
- **`lib/security/`** — Security engine, vulnerability scanner, security report HTML, and history helpers.
- **`lib/claude/`** — Claude CLI/config/context, advisor defaults, provider-stream guards, and advisor runner wiring.
- **`lib/orchestration/`**, **`lib/cleanup/`** — Cross-agent and cleanup domain logic (existing layout).

Prefer adding new shared logic under an existing area or a new `lib/<area>/` folder rather than growing the flat `lib/` root.

## Extension Entry File Rules

Extension entry files should be easy to skim. They may:

- register Pi tools, commands, shortcuts, flags, and event handlers;
- translate Pi parameters into feature-service inputs;
- launch viewers and register message renderers;
- call a service/runtime helper and return a Pi-compatible result.

They should not contain large business rules such as filesystem categorization, output parsing policy, model routing semantics, or cross-agent finalization. Move those into `extensions/lib/<feature>/` or a shared `extensions/lib/<domain>.ts` module.

## Testability Rules

- Domain modules must import without Pi, TUI, browser, Commander, or spawned subprocesses.
- Service modules should accept runtime dependencies when practical.
- Runtime adapters should be thin and tested with mocked ports or argument-builder assertions.
- New behavior should prefer tests in `extensions/__tests__/` that import `extensions/lib/*` directly.

## Private Extension Boundary

`extensions/private/` is a packaging boundary, not a place to fork business logic by default. Private extensions may wrap public shared modules, but duplicate public/private feature implementations should be documented and eventually reconciled by promoting shared logic to `extensions/lib/<feature>/`.

When adding or modifying private extension files, document whether the feature is:

1. private-only;
2. a wrapper over public shared logic; or
3. a temporary fork that needs a follow-up consolidation task.

## Large File Guidance

Large static HTML assets under `extensions/lib/*-html.ts` are acceptable when generated or intentionally self-contained. Large extension entry files are not. If an entry file grows beyond roughly 500 lines, prefer extracting domain/service/runtime modules before adding more behavior.

## Output Handling Rule

Agent, advisor, and toolkit final output must pass through a normalization seam before rendering. Hook-only streams, placeholder-only values such as `<Response>`, and empty CLI results should become explicit diagnostics rather than successful-looking answers.
