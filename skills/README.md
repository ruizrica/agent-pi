# Agent Pi Skills

This is the main skills folder for Agent Pi. `package.json` registers `./skills`, and project-local `.pi/settings.json` registers `../skills` with skill commands enabled.

Pi discovers skills recursively by finding directories that contain `SKILL.md`. Category folders are organizational only; each concrete skill keeps its own `SKILL.md`, references, templates, and scripts.

## Categories

| Category | Purpose |
| --- | --- |
| `core/` | Agent Pi runtime entry points, Commander workflows, memory, and skill-authoring utilities. |
| `workflows/` | Reusable operating loops: diagnosis, TDD, handoff, triage, task/PRD conversion, and long-running iteration. |
| `engineering/` | Greenfield build, architecture improvement, documentation pressure-testing, and codebase learning. |
| `design/` | Design-token, UI, prototype, and component-system workflows. |
| `testing/` | Test generation, Gopher draft review, and QA automation packages. |
| `automation/` | General local automation primitives such as browser control. |

## Public Skill Index

| Skill | Path | Purpose |
| --- | --- | --- |
| `agent-browser` | `automation/agent-browser` | Local browser automation, including localhost and local-network testing. |
| `agent-memory` | `core/agent-memory` | Search and manage local agent memories across sessions. |
| `caveman` | `core/caveman` | Ultra-compressed communication mode for lower-token responses. |
| `cmd-skill` | `core/cmd` | Commander `cmd` planning, task, execution, and lightweight task workflows. |
| `pi` | `core/pi` | Unified entry point for Pi modes such as plan, spec, investigate, goal, implement, team, pipeline, and chain. |
| `write-a-skill` | `core/write-a-skill` | Create new Agent Skills with correct structure, progressive disclosure, and bundled resources. |
| `design` | `design/design` | Generate design tokens and scaffold multi-platform design outputs. |
| `frontend-design` | `design/frontend-design` | Produce distinctive, production-grade frontend interfaces. |
| `prototype` | `design/prototype` | Build throwaway prototypes to explore UI or logic before committing to a design. |
| `shadcn-ui` | `design/shadcn-ui` | Work with shadcn/ui v4 components and CLI workflows. |
| `build` | `engineering/build` | Build new features/modules deeply from the first commit; imported from `/Users/ricardo/Desktop/build`. |
| `codebase-to-course` | `engineering/codebase-to-course` | Turn a codebase into an interactive course for non-technical learners. |
| `grill-with-docs` | `engineering/grill-with-docs` | Challenge a plan against domain language and update docs/ADRs as decisions crystallize. |
| `improve-codebase-architecture` | `engineering/improve-codebase-architecture` | Find and improve shallow modules using domain language and ADRs. |
| `improve-with-codex` | `engineering/improve-with-codex` | Architecture improvement workflow with Codex-worker delegation. |
| `zoom-out` | `engineering/zoom-out` | Ask the agent for broader context or a higher-level perspective. |
| `gopher-test-viewer` | `testing/gopher-test-viewer` | Preview, edit, and approve Gopher-generated Gherkin/Playwright drafts. |
| `qa-browser` | `testing/qa-automation/qa-browser` | Web QA recipes built on `agent-browser`. |
| `qa-device-management` | `testing/qa-automation/qa-device-management` | Manage simulators, emulators, sessions, and app launch state for QA. |
| `qa-scroll` | `testing/qa-automation/qa-scroll` | Verify scroll-based media feeds, autoplay, mute/unmute, and progression. |
| `qa-setup` | `testing/qa-automation/qa-setup` | Verify or install QA automation dependencies. |
| `qa-state-persistence` | `testing/qa-automation/qa-state-persistence` | Test UI state persistence across navigation and app lifecycle events. |
| `qa-test-flows` | `testing/qa-automation/qa-test-flows` | Bash-based UI test flow framework for native and web apps. |
| `test-generation` | `testing/test-generation` | Generate and review thoughtful Gherkin and Playwright tests. |
| `autoresearch` | `workflows/autoresearch` | Autonomous goal-directed iteration: modify, verify, keep/discard, repeat. |
| `complex-problem-loop` | `workflows/complex-problem-loop` | Iterative workflow for hard engineering tasks with repeated reflection. |
| `diagnose` | `workflows/diagnose` | Reproduce, minimize, hypothesize, instrument, fix, and regression-test bugs. |
| `handoff` | `workflows/handoff` | Create or update concise standalone Pi handoff documents. |
| `implement-directives` | `workflows/implement-directives` | Convert `@implement` comments in code files into documentation. |
| `tdd` | `workflows/tdd` | Red-green-refactor test-driven development workflow. |
| `to-issues` | `workflows/to-issues` | Convert plans/specs/PRDs into independently grabbable Commander tasks. |
| `to-prd` | `workflows/to-prd` | Turn current conversation context into a PRD and publish it as a task. |
| `triage` | `workflows/triage` | Triage issues through state-machine-driven roles. |

## Pruning Criteria

A skill should not live in this public main folder when it is:

- Explicitly retired or quarantined.
- Project-specific private workflow material, such as app-specific release scripts.
- A duplicate wrapper for functionality already covered by a stronger central skill.
- A dead path or non-portable `skill.md` casing issue.
- Missing required frontmatter or carrying unresolved references to files that are not bundled with the skill.

Use `extensions/__tests__/skill-inventory.test.ts` to validate the public registry after changes.
