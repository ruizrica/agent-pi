# Tasks: New Feature

> Generated: 2026-07-06
> Framework: context-os

---

# Implementation Task Plan — Context OS (New Feature)

## Phase 1 — Scope lock and shell contract alignment
- [ ] Reconfirm AGENTS constraints by validating no backend/persistence layer touch points are in-scope for this feature.
- [ ] Inspect current shell contract docs and record required updates in a diff note: `DESIGN.md`, `docs/scaffolding-audit.md`, and module docs.
- [ ] Confirm `src/components/layout/` and `src/components/views/` are true module roots and identify any new module-root docs needed from `docs/templates/MODULE.md`.
- [ ] Capture current surface navigation baseline (current selected surface on load, back-navigation target, and tab-switch behavior) for later regression comparison.

## Phase 2 — Mock model and fixture definition
- [ ] Define a `ContextSnapshot` interface/type in `src/mocks/` with fields: `id`, `name`, `lastActiveModule`, `lastActiveAt`, `statusSummary`, `isPinned`, `isActive`.
- [ ] Add deterministic fixture data in `src/mocks/contextSnapshots.ts` with fixed UUID-like IDs and fixed timestamps.
- [ ] Add a pure normalization utility for snapshot ordering that returns:
  - pinned snapshots first,
  - then unpinned snapshots,
  - and within each group, `lastActiveAt` descending.
- [ ] Add a deterministic update utility that handles create/rename/pin/switch/delete without side effects and returns fully defined snapshots in all branches.

## Phase 3 — Shell state orchestration integration
- [ ] Wire the snapshot state into existing shell-state/store hooks only (no service call, no adapter changes).
- [ ] Add action handlers for:
  - `createContextSnapshot`
  - `renameContextSnapshot`
  - `toggleContextSnapshotPin`
  - `switchContextSnapshot`
  - `closeContextSnapshot`
- [ ] Add reducer/state tests (or targeted unit checks) asserting each action mutates only shell-local mocked state and preserves immutability.
- [ ] Add deterministic sequence tests for repeated flows: create→pin→switch→rename→delete returns expected final arrays and active snapshot.

## Phase 4 — Surface registration in shell chrome and view routing
- [ ] Register a new shell surface label `Context OS` in `src/components/layout/` navigation chrome, preserving existing surface order semantics where possible.
- [ ] Register the new view route/component in `src/components/views/` without modifying existing route keys or historical back-navigation behavior.
- [ ] Ensure `Context OS` opens from shell chrome and renders without runtime warnings.
- [ ] Add a regression check that default surface selection on app start remains unchanged unless user explicitly opens Context OS.

## Phase 5 — Core panel and card components
- [ ] Implement `ContextSnapshotsPanel` under `src/components/views/` using existing primitives from `src/design-system/`.
- [ ] Implement `ContextSnapshotCard` in shell-level modules (`src/components/layout/` or adjacent layout-facing folder), with required fields shown:
  - last active module
  - relative or absolute last-active timestamp
  - short status summary
- [ ] Implement pinned/active visual states and card actions (rename, pin/unpin, switch, close/delete) using tokenized spacing, color, and typography only.
- [ ] Add empty, single-item, and large-list layout states for the panel.

## Phase 6 — Interaction flows (explicitly testable)
- [ ] Create flow: add snapshot action creates one new deterministic fixture-derived card and appends in normalized order.
- [ ] Rename flow: editing a snapshot name updates the card immediately and supports cancel/revert behavior.
- [ ] Pin flow: toggling pin moves card order deterministically according to sorting contract.
- [ ] Switch flow: selecting a snapshot updates shell active module mock-state and reflects active marker in UI.
- [ ] Close/delete flow: removing one snapshot never mutates unrelated snapshots and updates ordering of remaining cards predictably.

## Phase 7 — Accessibility and interaction parity
- [ ] Add keyboard focus order for create, rename, pin, switch, and close controls.
- [ ] Add accessible labels/aria attributes:
  - `aria-label` for each action button
  - panel role and list semantics
  - card role/description for module and timestamp fields.
- [ ] Ensure Enter/Space activates controls and focus is visible on all interactive elements.
- [ ] Validate status and timestamp text remains readable in non-hover and disabled/focus-reduced visual states.

## Phase 8 — Design tokens and docs parity
- [ ] Replace any raw style literals in new files with tokens from `src/design-system/tokens.ts` / `tokens.css`.
- [ ] Confirm no new token system is introduced and no shell primitives outside shared design-system are used.
- [ ] Update `DESIGN.md` to document the new Context OS surface and mock-only contract.
- [ ] Update any affected module `README.md` / `MODULE.md` for changed entry points, dependencies, and state assumptions.
- [ ] Add a module-local note documenting deterministic mock-driven snapshot behavior and no persistence promise.

## Phase 9 — Deterministic test coverage
- [ ] Add unit tests for mock fixture loading and initial render determinism.
- [ ] Add reducer/state tests for each action and edge order case (pin/unpin, renaming active snapshot, deleting active snapshot).
- [ ] Add focused component tests for the panel and card rendering of module/timestamp/summary fields.
- [ ] Add interaction tests for create, rename, switch, pin, and close flows using mocked shell state only.

## Phase 10 — Acceptance and regression validation
- [ ] Execute focused acceptance checks against all criteria AC1–AC11.
- [ ] Validate no API/service/network calls are triggered from snapshot actions via static scan and runtime hook interception.
- [ ] Verify shell navigation behavior outside Context OS is unchanged (surface switching, back-stack, existing modal flow).
- [ ] Produce a completion note mapping each requirement FR1–FR7 and NFR1–NFR6 to implemented tasks and file locations.
