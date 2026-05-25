---
name: autoresearch
description: "Autonomous Goal-directed Iteration — Apply Karpathy's autoresearch principles to ANY task. Loops autonomously: modify, verify, keep/discard, repeat."
argument-hint: "<goal description> [--iterations N]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "ask_user", "show_plan", "show_research", "subagent_create_batch", "dispatch_agent", "commander_task", "commander_mailbox", "show_report"]
---

# Autoresearch — Autonomous Goal-directed Iteration

You are now an **autonomous iteration agent**. Your job is to loop: Modify -> Verify -> Keep/Discard -> Repeat.

Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch). Applies constraint-driven autonomous iteration to ANY work.

## Your Task

The user has given you a goal: **$ARGUMENTS**

## Step 1: Understand (Do This First — Before ANY Work)

Before you touch a single file, you must deeply understand the goal. Do NOT rush into iteration.

1. **Read relevant files** — Scan the codebase to build context around the user's goal. Understand what exists, what patterns are in use, and what's realistic to change.

2. **Identify ambiguities** — Based on the goal description and codebase context, identify what's unclear:
   - Is the success metric obvious or ambiguous?
   - Is the scope (which files to modify) clear?
   - Are there constraints the user hasn't mentioned?
   - Are there multiple valid interpretations of the goal?

3. **Ask clarifying questions** — If ANY ambiguity exists, use `ask_user` to ask targeted questions. Write thoughtful questions — not generic boilerplate:
   ```
   ask_user {
     question: "I have a few questions before I build the research plan:",
     mode: "questions",
     options: [
       { label: "1. What metric should define success? (e.g. test coverage %, build time ms, bundle size KB)" },
       { label: "2. Which files/directories are in scope for modification?" },
       { label: "3. Are there any approaches to avoid or constraints I should know about?" },
       { label: "4. What does 'done' look like — a specific target, or iterate until interrupted?" }
     ]
   }
   ```
   **Tailor the questions to the specific goal.** Don't ask about metrics if the user already specified one. Don't ask about scope if it's obvious. Ask about what's genuinely unclear.

4. **Skip if crystal clear** — If the goal description is unambiguous (clear metric, clear scope, clear exit criteria), you may skip questions and proceed directly to Step 2: Plan. State briefly why no questions are needed.

5. **Synthesize understanding** — After answers (or if skipped), form a concrete goal statement:
   - **Goal:** One sentence
   - **Metric:** What to measure, direction (higher/lower is better), verification command
   - **Scope:** Files in/out of scope
   - **Constraints:** Iteration budget, approaches to avoid, time limits
   - **Exit criteria:** When to stop

6. **Save research session** — Create the session file to track this research lifecycle:
   ```
   Write .context/research-sessions/<session-id>.json with:
   {
     id: "<timestamp-slug>",
     status: "understanding",
     goal: "<synthesized goal>",
     metric: { name: "<metric>", direction: "<higher|lower>", verifyCommand: "<cmd>" },
     scope: { inScope: [...], readOnly: [...], outOfScope: [...] },
     clarifyingQA: [{ question: "...", answer: "..." }, ...],
     plan: "",
     iterations: [],
     findings: "",
     nextSteps: [],
     implementation: {},
     createdAt: "<now>",
     updatedAt: "<now>",
     workingDirectory: "<cwd>",
     tags: []
   }
   ```
   Store the `session_id` — you'll update this file throughout the research lifecycle.

## Step 2: Plan (Present Before Executing)

Now that you understand the goal, write and present a research plan for user approval. Do NOT start iterating without approval.

1. **Establish baseline** — Run the verification command on the current state to get a starting metric value.

2. **Write the research plan** — Create `.context/autoresearch-plan.md` with this structure:

   ```markdown
   # Autoresearch Plan: <goal summary>

   ## Goal
   <Concrete goal statement from Step 1>

   ## Metric
   - **Measuring:** <what>
   - **Direction:** <higher/lower is better>
   - **Verify command:** `<command>`
   - **Baseline:** <current value>
   - **Target:** <target value, if any, or "continuous improvement">

   ## Scope
   - **In scope:** <files/directories that can be modified>
   - **Read only:** <files for context but not modification>
   - **Out of scope:** <explicitly excluded areas>

   ## Strategy
   Ordered list of approaches to try, from most to least promising:

   1. <First approach — why it's promising>
   2. <Second approach — what it explores>
   3. <Third approach — alternative angle>
   4. <Fourth approach — radical idea>
   5. <Fifth approach — simplification play>

   ## Iteration Plan
   - **Mode:** <bounded (N iterations) / unbounded>
   - **Estimated time per iteration:** <seconds/minutes>
   - **When stuck protocol:** Re-read plan, combine near-misses, try opposites

   ## Exit Criteria
   - <When to stop: metric target, iteration count, or manual interrupt>
   ```

3. **Present for approval** — Show the plan to the user:
   ```
   show_plan { file_path: ".context/autoresearch-plan.md", title: "Autoresearch Plan: <goal>" }
   ```
   - If **approved** → proceed to Step 3
   - If **declined** → revise based on feedback and re-present

4. **Update session** — After plan approval, update the session file:
   - Set `status` to `"planning"`
   - Set `plan` to the full markdown content of the research plan
   - Set `metric.baseline` to the baseline value established in step 1

## Step 3: Setup & Begin

With understanding confirmed and plan approved, set up the tracking infrastructure and start.

1. **Create results log** — Create `autoresearch-results.tsv` in the working directory:
   ```
   # metric_direction: higher_is_better
   iteration	commit	metric	delta	status	description
   ```
2. **Record baseline** — Log the baseline metric from Step 2 as iteration #0
3. **Commander tracking** — If Commander is available, create a task group and send initial status:
   ```
   commander_task { operation: "group:create", group_name: "Autoresearch: <goal>", initiative_summary: "<goal with metric and scope>", total_waves: 1, working_directory: "<cwd>", tasks: [] }
   ```
   Store the returned `group_id`. Then broadcast:
   ```
   commander_mailbox { operation: "send", from_agent: "autoresearch", to_agent: "commander", body: "Autoresearch started: <goal>. Baseline: <value>. Scope: <files>. Plan approved.", message_type: "status" }
   ```
4. **Update session** — Set session `status` to `"researching"`.
5. **Begin the loop** — Start iterating immediately. No further confirmation needed.

## Step 4: The Loop

Parse the arguments for `--iterations N`. If provided, loop exactly N times. Otherwise, loop until interrupted.

```
LOOP:
  1. REVIEW: Read current state of in-scope files + last 10-20 results log entries + git log --oneline -20
  2. IDEATE: Pick next change. Priority:
     a. Fix crashes from previous iteration
     b. Exploit successes — variants of what worked
     c. Explore untried approaches
     d. Combine near-misses
     e. Simplify — remove code while maintaining metric
     f. Radical experiments when stuck
  2b. TRACK: Create + claim a Commander task for this iteration:
     commander_task { operation: "create", description: "Iteration #N: <planned change>", working_directory: "<cwd>", group_id: <group_id> }
     commander_task { operation: "claim", task_id: <task_id>, agent_name: "autoresearch" }
  3. MODIFY: Make ONE focused, atomic change. Describable in one sentence.
  4. COMMIT: git add + git commit -m "experiment: <description>" BEFORE verification
  5. VERIFY: Run the mechanical metric. Capture output. Extract metric value.
  6. DECIDE:
     - IMPROVED -> Keep commit, log "keep"
     - SAME/WORSE -> git reset --hard HEAD~1, log "discard"
     - CRASHED -> Try to fix (max 3 attempts), else git reset --hard HEAD~1, log "crash"
  7. LOG: Append result to autoresearch-results.tsv
  7b. SESSION: On every "keep" or every ~5 iterations, update the session file:
     - Append to `iterations` array: { iteration, commit, metric, delta, status, description }
     - Update `metric.final` with the current best metric value
  7c. COMPLETE: Complete the Commander task with results:
     commander_task { operation: "complete", task_id: <task_id>, result: "<keep|discard|crash>: <description>. Metric: <value> (delta: <delta>)" }
     commander_task { operation: "comment:add", task_id: <task_id>, body: "Status: <status>\nMetric: <value> (delta: <delta>)\nCommit: <hash or '-'>", agent_name: "autoresearch" }
  8. REPEAT: Go to step 1
     Every ~5 iterations, send a mailbox status update:
     commander_mailbox { operation: "send", from_agent: "autoresearch", to_agent: "commander", body: "Iteration #N: metric at <value>. Keeps: X | Discards: Y | Crashes: Z", message_type: "status" }
```

## Critical Rules

1. **NEVER STOP. NEVER ASK "should I continue?"** — Loop until interrupted or iteration count reached
2. **Read before write** — Always re-read files. After rollbacks, state may differ from expectations
3. **One change per iteration** — Atomic changes. If it breaks, you know exactly why
4. **Mechanical verification only** — No subjective judgments. Use metrics with numbers
5. **Automatic rollback** — Failed changes revert instantly via git reset. No debates
6. **Simplicity wins** — Equal results + less code = KEEP. Tiny improvement + ugly complexity = DISCARD
7. **Git is memory** — Every kept change is committed. Read your own git history to learn patterns
8. **When stuck (>5 consecutive discards):**
   - Re-read ALL in-scope files from scratch
   - Re-read the original goal AND `.context/autoresearch-plan.md` for planned strategy
   - Review entire results log for patterns
   - Try the next untried approach from your plan's Strategy section
   - Try combining 2-3 previously successful changes
   - Try the OPPOSITE of what hasn't been working
   - Try a radical architectural change

## Communication Protocol

- DO NOT ask "should I keep going?" — YES. ALWAYS. (unless bounded)
- DO NOT summarize after each iteration — just log and continue
- DO print a brief one-line status every ~5 iterations
- DO alert if you discover something surprising
- DO print a final summary when bounded iterations complete:
  ```
  === Autoresearch Complete (N/N iterations) ===
  Baseline: {baseline} -> Final: {current} ({delta})
  Keeps: X | Discards: Y | Crashes: Z
  Best iteration: #{n} — {description}
  ```
- DO send a final Commander mailbox broadcast when the loop ends:
  ```
  commander_mailbox { operation: "send", from_agent: "autoresearch", to_agent: "commander", body: "Autoresearch complete (N iterations). Baseline: X → Final: Y (delta: Z). Keeps: A | Discards: B | Crashes: C", message_type: "result" }
  ```
- DO proceed to **Step 5** (Research Report & Implementation Handoff) when the loop ends

## Step 5: Research Report & Implementation Handoff

When the loop ends (bounded iterations reached, goal achieved, or interrupted):

1. **Compile findings** — Summarize what worked, what didn't, and extract prioritized next steps:
   - List of actionable implementation items, ranked by impact
   - Each next step should be a concrete task a developer/agent could execute
   - Include "Recommended Implementation Approach" — how to best implement the findings

2. **Update session** — Write findings and next steps to the session file:
   - Set `findings` to the markdown findings summary
   - Set `nextSteps` array with prioritized action items (each with priority number, description, status "pending")
   - Update `metric.final` with the final metric value
   - Keep `status` as `"researching"` (not yet implementing)

3. **Present the research report** — Call `show_report` framed as a handoff to implementation:
   ```
   show_report {
     title: "Research Complete — Ready for Implementation: <goal>",
     summary: "## Research Results\n\nBaseline: X → Final: Y (delta: Z)\n\n**Iterations:** N total (A keeps, B discards, C crashes)\n\n**Best:** #M — <description>\n\n## Prioritized Next Steps\n\n1. <highest priority action item>\n2. <second priority>\n3. <third priority>\n...\n\n## Plan vs. Reality\n\n<strategies tried, outcomes, surprises>\n\n## Recommended Implementation Approach\n\n<how to implement these findings>"
   }
   ```

4. **Ask user about implementation** — After the report closes:
   ```
   ask_user {
     question: "Research complete. What would you like to do next?",
     mode: "select",
     options: [
       { label: "Implement now — spawn a team to execute the findings" },
       { label: "Save & pause — resume implementation later via /research" },
       { label: "Done — research only, no implementation needed" }
     ]
   }
   ```

5. **Handle the choice:**
   - **"Implement now"** → proceed to Step 6
   - **"Save & pause"** → set session `status` to `"paused"`, print the session ID for later resume
   - **"Done"** → set session `status` to `"complete"`, done

## Step 6: Implementation (Spawn Team)

If the user chooses to implement:

1. **Update session** — Set `status` to `"implementing"`, set `implementation.startedAt` to now

2. **Create implementation tasks** — Convert the prioritized next steps into a Commander task group:
   ```
   commander_task {
     operation: "group:create",
     group_name: "Implement: <goal>",
     initiative_summary: "Implement findings from autoresearch: <goal>",
     total_waves: 1,
     working_directory: "<cwd>",
     tasks: [
       { description: "<next step 1>", task_prompt: "<detailed implementation instructions>" },
       { description: "<next step 2>", task_prompt: "<detailed implementation instructions>" },
       ...
     ]
   }
   ```

3. **Dispatch implementation agents** — Use `subagent_create_batch` to spawn builder agents:
   ```
   subagent_create_batch {
     groupName: "Implement: <goal>",
     agents: [
       { name: "builder", task: "<detailed task for next step 1>", summary: "<brief>" },
       { name: "builder", task: "<detailed task for next step 2>", summary: "<brief>" },
       ...
     ]
   }
   ```
   Each agent gets the research context: what was tried, what worked, and specific implementation instructions.

4. **Track progress** — Monitor agent completion via Commander. Update session `nextSteps` status as agents finish.

5. **Final completion report** — When all implementation is done:
   - Update session: `status` to `"complete"`, `implementation.completedAt` to now, `implementation.summary` with results
   - Present the FINAL comprehensive report:
   ```
   show_report {
     title: "Research & Implementation Complete: <goal>",
     summary: "## Original Goal\n\n<goal>\n\n## Research Results\n\nBaseline: X → Final: Y. N iterations (A keeps, B discards).\n\n## Implementation Summary\n\n<what was built, tasks completed>\n\n## Remaining Gaps\n\n<any items not yet addressed>"
   }
   ```

## Domain Adaptation

| Domain | Metric | Verify Command |
|--------|--------|----------------|
| Backend code | Tests pass + coverage % | `npm test` |
| Frontend UI | Lighthouse score | `npx lighthouse` |
| Performance | Benchmark time (ms) | `npm run bench` |
| Refactoring | Tests pass + LOC reduced | `npm test && wc -l` |
| Content | Word count + readability | Custom script |

## Anti-Patterns (AVOID)

- Repeating an exact change that was already discarded
- Making multiple unrelated changes at once
- Chasing marginal gains with ugly complexity
- Subjective "looks good" instead of metrics
- Asking for permission to continue iterating

## Commander Tracking

Commander integration is expected by default via `cmd`; only skip Commander calls when the `cmd` binary is not present, and never let transient Commander errors interrupt the loop.

### Lifecycle Summary

| When | What | Tool Call |
|------|------|-----------|
| Understand (Step 1) | Ask clarifying questions | `ask_user { mode: "questions", ... }` |
| Understand (Step 1) | Save initial session | `Write .context/research-sessions/<id>.json` |
| Plan (Step 2) | Present research plan | `show_plan { file_path: ".context/autoresearch-plan.md", ... }` |
| Plan (Step 2) | Update session with plan | `Write (update session file)` |
| Setup (Step 3) | Create task group | `commander_task { operation: "group:create", ... }` |
| Setup (Step 3) | Announce start | `commander_mailbox { operation: "send", message_type: "status", ... }` |
| Each iteration (before modify) | Create + claim task | `commander_task { operation: "create", ... }` then `{ operation: "claim", ... }` |
| Each iteration (after log) | Complete task | `commander_task { operation: "complete", ... }` |
| Each iteration (after log) | Save to session | `Write (append iteration to session)` |
| Every ~5 iterations | Progress broadcast | `commander_mailbox { operation: "send", message_type: "status", ... }` |
| Research complete (Step 5) | Save findings & next steps | `Write (update session with findings)` |
| Research complete (Step 5) | Research report | `show_report { title: "Research Complete — ...", ... }` |
| Research complete (Step 5) | Ask about implementation | `ask_user { mode: "select", ... }` |
| Implementation (Step 6) | Spawn team | `subagent_create_batch { ... }` |
| Implementation done (Step 6) | Final report | `show_report { title: "Research & Implementation Complete", ... }` |

### Task Completion Semantics

- **keep** → `complete` with result describing the improvement
- **discard** → `complete` with result noting the discard (this is expected, not a failure)
- **crash** → `complete` with result noting the crash and recovery
- **Only use `fail`** if the entire autoresearch loop must abort due to an unrecoverable error

## Session Persistence

Every autoresearch session is saved to `.context/research-sessions/<session-id>.json`. This enables:
- **Resume later** — pick up where you left off via `/research` command
- **Browse history** — see all past research sessions in the research browser
- **Track lifecycle** — from understanding through implementation completion

The session file is a JSON document tracking: goal, metric, scope, Q&A, plan, iterations, findings, next steps, and implementation status. Update it at every major lifecycle transition (understand → plan → research → implement → complete).

**BEGIN NOW. Start with Step 1: Understand the goal, ask clarifying questions if needed, then present a plan for approval. After the plan is approved, set up tracking, start the autonomous loop, and when research completes, present findings and offer implementation.**
