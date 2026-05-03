# Requirements Document

## Overview
This spec defines a migration that standardizes all Claude-family runtime execution onto the local Claude Code CLI path already exemplified by `/advisor`. The migration replaces direct Claude API/SDK automation usage in runtime code paths with local CLI-based execution while preserving existing user-visible behavior, streaming semantics, permissions posture, and integration flows. Non-Claude providers and their existing flows remain operational and out of scope for architectural replacement.

## Goals
- Route Claude-family automated execution through the local Claude Code CLI runtime.
- Reuse and extend existing Claude CLI helper infrastructure before introducing new runtime layers.
- Preserve behavior for existing Claude-backed tools, agents, and utility flows as closely as possible.
- Keep non-Claude provider routing and execution unchanged.
- Ensure the codebase prefers CLI-backed Claude execution for runtime automation.

## Non-Goals
- Re-architect all non-Claude providers onto a new unified runtime.
- Replace interactive Claude Code usage patterns outside affected runtime automation flows.
- Build a brand-new cross-provider session manager unless required by existing Claude continuity needs.
- Introduce visual assets beyond markdown-mermaid documentation unless needed later.

## Reusability Check
Existing code to reuse and extend:
- `extensions/lib/claude-cli.ts` for Claude CLI spawning, arg construction, streaming, and output normalization.
- `extensions/lib/claude-advisor-runner.ts` for context packet assembly and structured invocation patterns.
- Existing Claude profile/tool mapping tests under `extensions/__tests__/claude-cli.test.ts` and related Claude routing tests.
- Existing overlay/routing and model resolution logic that already recognizes Claude-family models.

## Requirements

### Requirement 1: Claude-family runtime routing
**User Story:** As a maintainer, I want Claude-family automated execution to use the local Claude Code CLI runtime so that we comply with Claude automation constraints while keeping current product flows working.

#### Acceptance Criteria
1. WHEN a runtime code path invokes a Claude-family model for automated work THEN the system SHALL route that execution through the local Claude Code CLI path instead of a direct Claude API/SDK automation call.
2. IF an existing Claude-backed feature currently uses shared runtime helpers THEN the migration SHALL prefer extending those helpers rather than creating a separate Claude execution stack.
3. WHEN a Claude-family agent, advisor, worker, or utility analysis flow runs THEN the system SHALL use a CLI-backed invocation pattern compatible with the existing `/advisor` execution model.
4. IF a feature depends on multi-turn Claude continuity THEN the system SHALL support session continuation/resume behavior through the CLI path where that continuity already matters.

### Requirement 2: Behavioral compatibility
**User Story:** As a user, I want current Claude-backed flows to keep behaving the same so that the migration does not degrade UX or break downstream integrations.

#### Acceptance Criteria
1. WHEN a migrated Claude-backed flow is executed THEN the system SHALL preserve existing user-visible behavior, output shape, streaming semantics, and permissions posture to the highest practical degree.
2. IF a migrated flow emits incremental updates today THEN the CLI-backed path SHALL provide equivalent streamed or progressive updates expected by the surrounding UI/integration.
3. WHEN a migrated flow completes successfully THEN the returned result SHALL remain compatible with existing consumers without requiring unrelated cross-system rewrites.
4. IF an exact internal implementation detail cannot be preserved THEN the migration SHALL keep external interfaces stable and document any unavoidable deviations.

### Requirement 3: Non-Claude compatibility boundaries
**User Story:** As a maintainer, I want this migration to avoid destabilizing other model providers so that only Claude-family routing changes.

#### Acceptance Criteria
1. WHEN a non-Claude model is selected or resolved THEN the system SHALL continue using its current provider/runtime path unless separately changed by another initiative.
2. IF a shared orchestration flow supports both Claude and non-Claude models THEN the system SHALL branch only the Claude-family path to the CLI-backed runtime while preserving the rest of the flow.
3. WHEN this migration is implemented THEN the codebase SHALL not require a full cross-provider runtime abstraction rewrite as part of the same change.

### Requirement 4: Migration completeness for in-scope Claude calls
**User Story:** As a maintainer, I want all in-scope Claude runtime automation paths covered so that direct Claude automation usage does not remain hidden in the product.

#### Acceptance Criteria
1. WHEN the migration scope is assessed THEN the implementation SHALL include any runtime code path that invokes Claude models, including agentic and utility-oriented flows.
2. IF a direct Claude API/SDK runtime usage is discovered in scope THEN it SHALL be migrated to the CLI-backed path or explicitly documented as deferred with rationale.
3. WHEN the migration work is reviewed THEN the team SHALL have an inventory of migrated Claude runtime call sites and any intentionally excluded cases.
4. IF future in-scope runtime work adds Claude-family automation THEN the implementation SHOULD make the CLI-backed path the default integration approach.

### Requirement 5: Test and validation coverage
**User Story:** As a maintainer, I want strong verification around Claude routing so that regressions and accidental direct-runtime usage are caught quickly.

#### Acceptance Criteria
1. WHEN the migration is implemented THEN automated tests SHALL cover Claude CLI argument construction, routing selection, output/stream handling, and consumer compatibility for migrated paths.
2. IF a Claude-backed runtime feature is migrated from direct SDK/API usage THEN tests SHALL verify the feature now uses the shared CLI-backed runtime helper path.
3. WHEN the migration is validated THEN regression checks SHALL confirm non-Claude model flows still work through their existing runtimes.
4. IF new Claude runtime paths are added later THEN the codebase SHOULD include tests that prefer the shared CLI-backed runtime conventions established by this migration.

### Requirement 6: Error handling and operational clarity
**User Story:** As an operator, I want failures to remain understandable so that CLI-based Claude routing does not reduce debuggability.

#### Acceptance Criteria
1. WHEN a Claude CLI invocation fails THEN the system SHALL surface actionable error information compatible with the current consuming flow.
2. IF the CLI path encounters transient failures, retries, or session issues THEN the surrounding integration SHALL be able to communicate useful status or failure states.
3. WHEN a migrated flow is observed in logs or tests THEN maintainers SHALL be able to distinguish Claude CLI-backed execution from other provider runtimes.

## Visual Assets Request
- No additional visual asset files requested at this stage.
- Architecture and routing visuals will be represented with mermaid diagrams in markdown.
