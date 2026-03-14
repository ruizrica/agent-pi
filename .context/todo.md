# Plan: Enhance Autoresearch — Add Clarifying Questions, Plan Presentation & Completion Report

## Context

The autoresearch feature currently works well as an autonomous iteration loop: it receives a goal, sets up baseline metrics, and immediately begins the modify → verify → keep/discard cycle. Commander task board visibility and status broadcasts are already in place and working great.

However, the current flow has a gap between receiving the user's instruction and starting work. Right now, the agent jumps straight into reading files and establishing baselines without first making sure it truly understands the goal. This leads to wasted iterations when the agent misinterprets scope, picks the wrong metric, or heads in a direction the user didn't intend.

The enhancement adds three structured phases **before** the autonomous loop begins:

1. **Understand Phase** — The agent reads relevant context, then asks clarifying questions using the `ask_user` tool (interactive inline Q&A) to concretely understand the goal, scope, success criteria, and constraints. This ensures alignment before any work starts.

2. **Plan Phase** — After understanding is confirmed, the agent writes a structured research plan to `.context/autoresearch-plan.md` and presents it via `show_plan` for interactive review/approval. This plan covers: the goal and metric, scope of files, iteration strategy, verification command, and expected approaches. The user can edit, reorder, and approve or decline—just like PLAN mode.

3. **Completion Report** — Upon completion, `show_report` is already called (this is working), but we'll strengthen the instructions to ensure it's always invoked with a rich summary and that the plan file is referenced in the final output.

The changes touch two files that are mirrors of each other:
- `agent/.pi/commands/autoresearch/autoresearch.md` — The Pi command definition (with frontmatter `allowed-tools`)
- `agent/skills/autoresearch/SKILL.md` — The skill definition (referenced by the skill system)

Both need the same structural changes. The `allowed-tools` in both must be updated to include `ask_user` and `show_plan`. The reference files (`references/autonomous-loop-protocol.md`, `references/core-principles.md`, `references/results-logging.md`) need minimal or no changes since they describe the loop itself which isn't changing.

---

## Phase 1: Update Allowed Tools

**Why:** The `ask_user` and `show_plan` tools are required for the new clarifying questions and plan presentation features, but they're not currently in the allowed-tools list for either file.

**Modify** → `agent/.pi/commands/autoresearch/autoresearch.md`
- Add `ask_user` and `show_plan` to the frontmatter `allowed-tools` array

**Modify** → `agent/skills/autoresearch/SKILL.md`
- Add `ask_user` and `show_plan` to the frontmatter `allowed-tools` line

---

## Phase 2: Add "Understand" Phase — Clarifying Questions

**Why:** The agent currently jumps straight to file reading and baseline setup. It needs to first deeply understand the user's intent by asking targeted clarifying questions, ensuring it picks the right metric, scope, and strategy.

**Modify** → `agent/.pi/commands/autoresearch/autoresearch.md`
- Restructure the existing "Step 1: Setup" into a new "Step 1: Understand"
- Step 1 should:
  1. Read all in-scope files for initial context (keep this from current setup)
  2. Analyze the user's goal description to identify ambiguities
  3. Use `ask_user` (mode: `questions`) to ask 3-6 targeted clarifying questions covering:
     - What specific outcome/metric defines success?
     - What files/directories are in scope vs. read-only?
     - Are there constraints (time budget, iteration count, approaches to avoid)?
     - What does "done" look like?
     - Any known approaches to try or avoid?
  4. Use `ask_user` only when there are genuine ambiguities—if the goal is crystal clear, skip to plan
  5. Synthesize answers into a concrete goal statement with metric, scope, and constraints

**Modify** → `agent/skills/autoresearch/SKILL.md`
- Mirror the same changes: add an "Understand" phase before the current Setup Phase
- Reference the same `ask_user` workflow

---

## Phase 3: Add "Plan" Phase — Structured Research Plan

**Why:** After understanding the goal, the agent should present a structured plan showing what it intends to do, how it will measure progress, and what approaches it plans to try—giving the user a chance to approve or redirect before any work begins.

**Modify** → `agent/.pi/commands/autoresearch/autoresearch.md`
- Add "Step 2: Plan" between Understand and the Loop
- Step 2 should:
  1. Write a structured research plan to `.context/autoresearch-plan.md` containing:
     - **Goal**: Concrete goal statement with success metric
     - **Metric**: What's being measured, direction (higher/lower is better), verification command
     - **Scope**: Files in scope, files read-only, constraints
     - **Baseline**: Current metric value (run verification to establish)
     - **Strategy**: Ordered list of approaches to try (first 5-10 ideas)
     - **Iteration Budget**: How many iterations (if bounded) or "unbounded"
     - **Exit Criteria**: When to stop (metric target, iteration count, or manual interrupt)
  2. Present the plan via `show_plan { file_path: ".context/autoresearch-plan.md", title: "Autoresearch Plan: <goal>" }`
  3. Wait for user approval before proceeding
  4. If declined, revise the plan based on feedback and re-present
- Renumber current "Step 2: The Loop" to "Step 3: The Loop"
- Add a note that the plan should be referenced during the loop (re-read when stuck)

**Modify** → `agent/skills/autoresearch/SKILL.md`
- Mirror the same plan phase between "Setup Phase" and "The Loop"
- Include the same `.context/autoresearch-plan.md` structure and `show_plan` workflow

**Modify** → `agent/skills/autoresearch/references/autonomous-loop-protocol.md`
- Add a brief note in the "When Stuck" section to re-read the autoresearch plan file
- Add the plan file to Phase 1: Review as something to re-read each iteration

---

## Phase 4: Strengthen Completion Report

**Why:** The completion report is already partially implemented via `show_report`, but we need to ensure it always fires, includes a reference back to the original plan, and provides a rich summary tying results back to the planned strategy.

**Modify** → `agent/.pi/commands/autoresearch/autoresearch.md`
- Enhance the Communication Protocol section's `show_report` call to include:
  - Reference to the original plan (what was planned vs. what happened)
  - Summary of which planned approaches were tried and their outcomes
  - Final metric compared to both baseline AND the plan's target
- Make the `show_report` call more prominent (not buried in a list)

**Modify** → `agent/skills/autoresearch/SKILL.md`
- Mirror the same completion report enhancements
- Ensure the "Completion — Report & Final Broadcast" section is clear that `show_report` is MANDATORY

**Modify** → `agent/skills/autoresearch/references/autonomous-loop-protocol.md`
- Enhance the "Commander: Final Broadcast + Completion Report" section with the richer summary format

---

## Phase 5: Verify & Polish

**Why:** Ensure all changes are consistent across the three files, the flow reads naturally, and nothing is broken.

- Re-read all modified files end-to-end to verify consistency
- Ensure step numbering is correct and sequential
- Verify all tool names in `allowed-tools` match exactly
- Check that the plan template in the instructions matches what `show_plan` expects
- Ensure the flow is: Understand → Plan (approve) → Setup (baseline) → Loop → Complete (report)
- Confirm no existing functionality is broken (Commander tracking, results logging, loop protocol)

---

## Critical Files

| File | Action |
|------|--------|
| `agent/.pi/commands/autoresearch/autoresearch.md` | Modify (add understand + plan phases, update allowed-tools, enhance completion) |
| `agent/skills/autoresearch/SKILL.md` | Modify (mirror all changes from command file) |
| `agent/skills/autoresearch/references/autonomous-loop-protocol.md` | Modify (add plan reference to review/stuck phases, enhance completion) |
| `agent/skills/autoresearch/references/core-principles.md` | Reference only (no changes needed) |
| `agent/skills/autoresearch/references/results-logging.md` | Reference only (no changes needed) |

## Reusable Components (no changes needed)

- **`ask_user` tool** — Already exists in the system, supports `questions` mode with inline answers, `select` mode for choices, and `confirm` mode for yes/no. Perfect for clarifying questions.
- **`show_plan` tool** — Already exists, renders markdown plans with interactive approve/decline. Exactly what we need for the research plan presentation.
- **`show_report` tool** — Already exists and is already referenced in autoresearch. Just needs richer summary content.
- **Commander task/mailbox tools** — Already integrated and working. No changes needed to these integrations.

## Verification

1. Read all three modified files end-to-end and confirm the flow: Understand → Plan → Setup → Loop → Complete
2. Verify `allowed-tools` includes `ask_user` and `show_plan` in both files
3. Confirm the plan template structure is complete and actionable
4. Ensure backward compatibility — bounded/unbounded modes still work, Commander integration unchanged
5. Check that the clarifying questions are genuinely useful (not just busywork) and include a skip path for obvious goals
