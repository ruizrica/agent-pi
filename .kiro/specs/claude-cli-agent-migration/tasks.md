# Implementation Tasks

- [ ] 1. Build a complete Claude runtime migration inventory and confirm routing boundaries [Requirements: 1, 3, 4]
  - [ ] 1.1 Inventory all in-scope Claude runtime automation call sites and classify each as agentic, utility-oriented, shared-runtime, or already CLI-backed. [Requirements: 4]
    - Likely files/modules: `extensions/`, `extensions/lib/`, `scripts/`, agent runtime helpers, viewer analysis flows
    - Include known direct SDK/API usage such as `extensions/cleanup-viewer.ts`
    - Record whether each call site requires streaming, tool approval mapping, session continuity, or custom result formatting
    - Verification: documented migration inventory and reviewable list of migrated vs already-compliant call sites
  - [ ] 1.2 Confirm the exact routing boundary for Claude-family versus non-Claude providers in shared orchestration/model resolution paths. [Requirements: 1, 3]
    - Likely files/modules: model resolution helpers, Claude overlay/routing helpers, toolkit worker runtime files
    - Constraint: preserve existing non-Claude runtime behavior
    - Verification: tests or documented assertions showing Claude-only branching

- [ ] 2. Consolidate and extend the shared Claude CLI runtime adapter for all in-scope Claude execution [Requirements: 1, 2, 6]
  - [ ] 2.1 Review and, if needed, extend `extensions/lib/claude-cli.ts` so all migrated Claude flows can use a common invocation interface. [Requirements: 1, 2, 6]
    - Likely files/modules: `extensions/lib/claude-cli.ts`, `extensions/lib/claude-config.ts`, `extensions/lib/claude-tool-mapping.ts`
    - Support needs may include feature-level profile selection, session continuation, streamed deltas, status events, stderr propagation, and result normalization
    - Constraint: do not duplicate raw `spawn("claude", ...)` logic across features
    - Verification: unit tests for arg construction, stream parsing, failure handling, and any newly added runtime options
  - [ ] 2.2 Define or refine reusable feature wrapper patterns that adapt shared Claude CLI callbacks/results into feature-specific contracts. [Requirements: 1, 2]
    - Likely files/modules: shared runtime wrapper files under `extensions/lib/`
    - Constraint: preserve current output shape and streaming semantics for consuming code
    - Verification: tests validating wrapper compatibility contracts

- [ ] 3. Migrate direct Claude runtime call sites to the shared CLI-backed path [Requirements: 1, 2, 4, 6]
  - [ ] 3.1 Replace direct Claude SDK/API automation usage in utility-oriented runtime features with shared Claude CLI-backed wrappers. [Requirements: 1, 2, 4, 6]
    - Known likely file: `extensions/cleanup-viewer.ts`
    - Preserve SSE/update behavior, final payload shape, and safety-focused analysis UX
    - Constraint: no silent fallback to direct Claude SDK/API calls
    - Verification: feature tests and manual smoke validation of streamed analysis behavior
  - [ ] 3.2 Audit Claude-family agent/subagent/worker/advisor execution paths and ensure they all converge on the shared CLI runtime adapter. [Requirements: 1, 2, 4]
    - Likely files/modules: `extensions/lib/toolkit-cli.ts`, advisor runner, model-resolution/runtime wiring, subagent execution helpers
    - Reuse existing `/advisor` pattern first
    - Verification: routing tests and targeted end-to-end smoke checks for at least one worker/advisor flow
  - [ ] 3.3 Preserve multi-turn continuity only where current Claude-backed flows depend on it. [Requirements: 1, 2]
    - Use CLI session continuation/resume capabilities only for flows with existing continuity needs
    - Constraint: do not introduce a new global session manager in this migration
    - Verification: tests around session flags or documented no-op decisions for stateless flows

- [ ] 4. Preserve compatibility for non-Claude providers and mixed-provider flows [Requirements: 3]
  - [ ] 4.1 Validate that shared orchestration logic only switches Claude-family execution to the CLI path and leaves other providers on their current runtimes. [Requirements: 3]
    - Likely files/modules: shared provider/model selection and orchestration layers
    - Verification: regression tests covering at least one non-Claude path and one mixed-provider decision path

- [ ] 5. Strengthen verification coverage for Claude CLI standardization [Requirements: 2, 4, 5, 6]
  - [ ] 5.1 Add or update unit tests for Claude routing, CLI argument construction, stream handling, and compatibility wrappers. [Requirements: 2, 5, 6]
    - Likely tests: `extensions/__tests__/claude-cli.test.ts` plus new migrated-feature coverage
    - Verification: targeted automated test execution
  - [ ] 5.2 Add regression coverage proving migrated features use the shared CLI-backed runtime and preserve existing consumer contracts. [Requirements: 2, 4, 5]
    - Include at least one utility feature migration and existing advisor/worker coverage
    - Verification: test assertions on observable behavior and routing outcomes
  - [ ] 5.3 Run final validation for Claude-family and non-Claude execution paths. [Requirements: 2, 3, 5, 6]
    - Validation set: migrated Claude utility flow, existing `/advisor` path, at least one Claude worker/subagent path, at least one non-Claude provider path
    - Verification: test output plus concise migration summary of addressed call sites and any remaining deferred items

- [ ] 6. Document migration outcomes and operational guidance [Requirements: 4, 6]
  - [ ] 6.1 Produce an implementation summary of migrated Claude call sites, preserved behaviors, known constraints, and any explicit deferred items. [Requirements: 4, 6]
    - Include operational note: Claude automation routes through local Claude Code CLI due to automation restrictions on direct SDK/API usage
    - Verification: reviewable summary attached to completion or follow-up docs
