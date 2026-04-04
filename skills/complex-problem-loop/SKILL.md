---
name: complex-problem-loop
description: Iterative workflow for hard engineering tasks that need repeated back-and-forth, deep reconnaissance, phased planning, short execution slices, reflection, and explicit continuation or handoff. Use when the task is ambiguous, spans multiple files or systems, requires hypothesis-driven debugging, architecture exploration, or needs deliberate context preservation across iterations.
allowed-tools: Read Write Edit ask_user show_plan show_report subagent_create_batch subagent_list subagent_continue subagent_enqueue_task cycle_memory tasks
---

# Complex Problem Loop

Use this skill when the user wants the agent to handle a difficult problem the way strong research-oriented agents do: clarify what is unknown, gather context in parallel when needed, externalize a plan, execute in small deliberate slices, reflect after each slice, and continue without losing the thread.

This is a **meta-skill**. It does not replace the repository's planner, pipeline, or subagent systems. It composes them into a reusable operating model for problems that require repeated back-and-forth.

## When to Use This Skill

Activate this skill when the task involves any of the following:

- Cross-file refactors with uncertain blast radius
- Debugging with unknown root cause
- Architecture or design work that needs exploration before implementation
- Research-heavy implementation where there are multiple viable approaches
- Long-running work that may require several execution/reflection cycles
- User requests like "think deeply", "iterate carefully", "work through this step by step", "keep the thread", or "do the smart agent thing"

Do not use this skill for simple one-file edits, straightforward config changes, or mechanical tasks that can be completed in one short pass.

## Core Loop

Follow this operating loop:

1. **Clarify** — restate the goal, constraints, unknowns, and success criteria
2. **Recon** — gather targeted context yourself or with scouts depending on complexity
3. **Synthesize** — write down what is known, what is still uncertain, and the best next move
4. **Plan** — externalize a phased plan before touching code when scope is non-trivial
5. **Execute Slice** — make one focused unit of progress, not a giant all-at-once change
6. **Reflect** — inspect the outcome, update state, and decide whether to continue, ask, or hand off
7. **Continue or Handoff** — either run the next slice, ask the user a precise question, or delegate follow-up work to the right agent

Detailed protocol: `references/complex-problem-loop.md`
State template: `references/state-template.md`
Dispatch heuristics: `references/dispatch-patterns.md`

## Workflow

### Phase 1: Clarify the Problem

Before changing anything:

- Restate the user goal in concrete terms
- Identify success criteria and constraints
- Separate facts from assumptions
- Identify what is unknown but important

If any ambiguity matters to implementation, ask focused clarifying questions. Prefer narrow questions with defaults over broad open-ended ones.

### Phase 2: Reconnaissance

For simple or tightly scoped tasks, gather context yourself.

For complex tasks, dispatch focused scouts in parallel. Typical scout areas:

- Structure and entry points
- Existing patterns and conventions
- Data or control flow
- Tests, validation, or integration points

Use `subagent_create_batch` when the problem touches multiple subsystems. Wait for all scouts to complete before synthesizing findings.

### Phase 3: Synthesize and Externalize State

After recon, write down:

- What the system currently does
- What is blocking confidence
- Which hypothesis or path looks strongest
- Which files are likely involved
- What the next slice of work should accomplish

For longer efforts, persist a loop state artifact in `.context/` using the template from `references/state-template.md`.

### Phase 4: Plan Before Execution

If scope is non-trivial, write a structured phased plan and present it with `show_plan` before implementation. Use the repository's existing plan format and approval flow.

If the task is already in an approved plan, align the next execution slice to that plan instead of inventing a new one.

### Phase 5: Execute in Slices

Do one focused slice at a time.

A slice can be:

- Add or revise one test boundary
- Implement one subsystem adjustment
- Wire one integration path
- Refactor one seam
- Validate one hypothesis

Do not batch unrelated edits into the same slice if that makes the result harder to reason about.

### Phase 6: Reflect After Each Slice

After each slice:

- Verify what changed
- Record what was learned
- Decide whether the slice reduced uncertainty
- Update the loop state
- Choose one of three next actions:
  - Continue immediately with the next slice
  - Ask the user a precise follow-up question
  - Hand off or queue work to a specialist/subagent

### Phase 7: Preserve Continuity

If the task is likely to exceed the available context window or span multiple sessions:

- Keep concise state in `.context/`
- Use `cycle_memory` proactively when needed
- Queue follow-up work to persistent subagents when that keeps context localized

## Rules

1. Prefer deliberate progress over speed theater
2. Do not jump from ambiguity straight into implementation
3. Always separate reconnaissance from execution on hard tasks
4. Use plans for non-trivial scope
5. Keep execution slices small enough to evaluate clearly
6. Reflect explicitly after each slice
7. Preserve state so the next turn can continue without rediscovery
8. Use delegation to reduce uncertainty, not to create noise

## Relationship to Existing Systems

- Use the planner format already established in this repository
- Use subagents for focused recon or follow-up execution
- Use pipeline/team workflows when they are the best fit, not by default
- Use memory cycling for continuity instead of inventing a second memory system

This skill is a practical operating model for complex problem solving inside Pi.
