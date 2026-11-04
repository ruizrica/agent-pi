# Build Skill Arch Setup Reference

Use this bundled reference when a target project has no `docs/agents/` setup yet. Keep setup minimal and directly useful; do not block greenfield build work on perfect documentation.

## Issue Tracker

Create `docs/agents/issue-tracker.md` with the selected source of work:

```markdown
# Issue Tracker

Use this file to decide where implementation work is tracked.

- Tracker: <github | gitlab | local-markdown>
- Source: <repository URL, issue URL pattern, or local file path>
- Rule: read the relevant issue/task before designing a module; reference the issue in commits when available.
```

Selection defaults:
- GitHub remote → GitHub issues.
- GitLab remote → GitLab issues.
- No hosted remote → local markdown tasks.

## Triage Labels

Create `docs/agents/triage-labels.md` with canonical labels unless the project already defines different ones:

```markdown
# Triage Labels

- `bug` — incorrect behavior or regression.
- `feature` — new user-facing capability.
- `refactor` — behavior-preserving structural change.
- `docs` — documentation-only work.
- `test` — test-only or validation work.
- `blocked` — cannot proceed without an external dependency or decision.
```

## Domain Documentation

Create `docs/agents/domain.md` to explain where domain language lives:

```markdown
# Domain Documentation

- Primary glossary: `CONTEXT.md`.
- ADR directory: `docs/adr/`.
- Add terms lazily when implementation creates or clarifies a domain concept.
- Record an ADR only for hard-to-reverse decisions with real trade-offs.
```

If the project needs multiple context files, create `CONTEXT-MAP.md` that maps areas of the codebase to their context files. Otherwise prefer a single `CONTEXT.md`.

## Agent Skills Block

Add this section to the existing `CLAUDE.md` or `AGENTS.md` file. If both exist, prefer `CLAUDE.md`; if neither exists and the run is non-interactive, create `CLAUDE.md`.

```markdown
## Agent skills

- Read `docs/agents/issue-tracker.md` before implementing tracked work.
- Read `CONTEXT.md` or `CONTEXT-MAP.md` before naming new modules or concepts.
- Read related ADRs in `docs/adr/` before changing architectural shape.
- Update glossary terms and ADRs in the same change as the code they describe.
```
