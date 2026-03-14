---
name: autoresearch
description: Autonomous Goal-directed Iteration. Apply Karpathy's autoresearch principles to ANY task. Loops autonomously — modify, verify, keep/discard, repeat. Invoke with /skill:autoresearch or when user says "work autonomously", "iterate until done", "keep improving", or "run overnight".
allowed-tools: Bash(git:*) Bash(npm:*) Bash(npx:*) Read Write Edit ask_user show_plan commander_task commander_mailbox show_report
---

# Autoresearch — Autonomous Goal-directed Iteration

Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch). Applies constraint-driven autonomous iteration to ANY work — not just ML research.

**Core idea:** You are an autonomous agent. Modify -> Verify -> Keep/Discard -> Repeat.

## When to Activate

- User invokes `/skill:autoresearch` or `/autoresearch`
- User says "work autonomously", "iterate until done", "keep improving", "run overnight"
- Any task requiring repeated iteration cycles with measurable outcomes

## Phase 1: Understand (Do This First — Before ANY Work)

Before touching any files, deeply understand the goal. Do NOT rush into iteration.

1. **Read relevant files** — Scan the codebase to build context around the user's goal. Understand what exists, what patterns are in use, and what's realistic.

2. **Identify ambiguities** — Based on the goal and codebase context, what's unclear?
   - Is the success metric obvious or ambiguous?
   - Is the scope (which files to modify) clear?
   - Are there constraints the user hasn't mentioned?
   - Are there multiple valid interpretations?

3. **Ask clarifying questions** — If ANY ambiguity exists, use `ask_user` to ask targeted questions:
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
   **Tailor questions to the specific goal.** Don't ask about what's already clear. Ask about genuine ambiguities.

4. **Skip if crystal clear** — If the goal is unambiguous (clear metric, scope, exit criteria), skip questions and proceed to Phase 2. State briefly why no questions are needed.

5. **Synthesize understanding** — Form a concrete statement: Goal, Metric (what + direction + verify command), Scope (in/out), Constraints, Exit criteria.

## Phase 2: Plan (Present Before Executing)

Now write and present a research plan for user approval. Do NOT start iterating without approval.

1. **Establish baseline** — Run the verification command to get a starting metric value.

2. **Write the research plan** — Create `.context/autoresearch-plan.md`:

   ```markdown
   # Autoresearch Plan: <goal summary>

   ## Goal
   <Concrete goal statement>

   ## Metric
   - **Measuring:** <what>
   - **Direction:** <higher/lower is better>
   - **Verify command:** `<command>`
   - **Baseline:** <current value>
   - **Target:** <target value or "continuous improvement">

   ## Scope
   - **In scope:** <files/directories to modify>
   - **Read only:** <files for context only>
   - **Out of scope:** <excluded areas>

   ## Strategy
   Ordered approaches, most to least promising:
   1. <First approach — why promising>
   2. <Second approach — what it explores>
   3. <Third approach — alternative angle>
   4. <Fourth approach — radical idea>
   5. <Fifth approach — simplification play>

   ## Iteration Plan
   - **Mode:** <bounded (N) / unbounded>
   - **Estimated time per iteration:** <seconds/minutes>
   - **When stuck:** Re-read plan, combine near-misses, try opposites

   ## Exit Criteria
   - <When to stop>
   ```

3. **Present for approval:**
   ```
   show_plan { file_path: ".context/autoresearch-plan.md", title: "Autoresearch Plan: <goal>" }
   ```
   - **Approved** → proceed to Phase 3
   - **Declined** → revise based on feedback and re-present

## Phase 3: Setup & Begin

With understanding confirmed and plan approved, set up tracking and start.

1. **Create results log** — Create `autoresearch-results.tsv` (see `references/results-logging.md`)
2. **Record baseline** — Log the baseline metric from Phase 2 as iteration #0
3. **Commander tracking** — If available, create task group and broadcast start (see Commander Integration below)
4. **Begin the loop** — Start iterating immediately. No further confirmation needed.

## The Loop

Read `references/autonomous-loop-protocol.md` for full protocol details.

```
LOOP (FOREVER or N times):
  1. Review: Read current state + git history + results log
  2. Ideate: Pick next change based on goal, past results, what hasn't been tried
  3. Modify: Make ONE focused change to in-scope files
  4. Commit: Git commit the change (before verification)
  5. Verify: Run the mechanical metric (tests, build, benchmark, etc.)
  6. Decide:
     - IMPROVED -> Keep commit, log "keep", advance
     - SAME/WORSE -> Git revert, log "discard"
     - CRASHED -> Try to fix (max 3 attempts), else log "crash" and move on
  7. Log: Record result in results log
  8. Repeat: Go to step 1.
     - If unbounded: NEVER STOP. NEVER ASK "should I continue?"
     - If bounded (N): Stop after N iterations, print final summary
```

## Critical Rules

1. **Loop until done** — Unbounded: loop until interrupted. Bounded: loop N times then summarize.
2. **Read before write** — Always understand full context before modifying
3. **One change per iteration** — Atomic changes. If it breaks, you know exactly why
4. **Mechanical verification only** — No subjective "looks good". Use metrics
5. **Automatic rollback** — Failed changes revert instantly. No debates
6. **Simplicity wins** — Equal results + less code = KEEP. Tiny improvement + ugly complexity = DISCARD
7. **Git is memory** — Every kept change committed. Agent reads history to learn patterns
8. **When stuck, think harder** — Re-read files, re-read goal AND `.context/autoresearch-plan.md` for planned strategy, try next untried approach from the plan, combine near-misses, try radical changes. Don't ask for help unless truly blocked by missing access/permissions

## Principles Reference

See `references/core-principles.md` for the 7 generalizable principles from autoresearch.

## Commander Integration (Task Tracking & Visibility)

When Commander is available, autoresearch MUST track every iteration as a Commander task. This gives the dashboard full visibility into autonomous work — just like the `tasks` extension does for manual workflows.

### Setup Phase (Phase 3) — Create Task Group

After establishing the baseline and getting plan approval, create a Commander task group for this research session:

```
commander_task {
  operation: "group:create",
  group_name: "Autoresearch: <goal summary>",
  initiative_summary: "<full goal description with metric and scope>",
  total_waves: 1,
  working_directory: "<cwd>",
  tasks: []
}
```

Store the returned `group_id` — all iteration tasks will be added to this group.

Send an initial mailbox status broadcast:
```
commander_mailbox {
  operation: "send",
  from_agent: "autoresearch",
  to_agent: "commander",
  body: "Autoresearch started: <goal>. Baseline metric: <value>. Scope: <files>. Plan approved.",
  message_type: "status"
}
```

### Per-Iteration — Create → Claim → Complete

**Before modifying** (step 3 of each loop iteration), create and claim a Commander task:

```
commander_task { operation: "create", description: "Iteration #N: <planned change>", working_directory: "<cwd>", group_id: <group_id> }
commander_task { operation: "claim", task_id: <task_id>, agent_name: "autoresearch" }
```

**After logging results** (step 7 of each loop iteration), complete the task with the outcome:

```
commander_task { operation: "complete", task_id: <task_id>, result: "<status>: <description>. Metric: <old> → <new> (delta: <delta>)" }
```

Also add a comment to the task with detailed results:
```
commander_task { operation: "comment:add", task_id: <task_id>, body: "Status: <keep|discard|crash>\nMetric: <value> (delta: <delta>)\nCommit: <hash or '-'>\nDescription: <what was tried>", agent_name: "autoresearch" }
```

**Note:** Use `complete` for ALL outcomes (keep, discard, crash). Discards and crashes are expected in autoresearch — they're not failures. Reserve `fail` only for unrecoverable errors that halt the entire loop.

### Status Broadcasts — Every ~5 Iterations

Every 5 iterations, send a mailbox status update AND add a comment to the group:

```
commander_mailbox {
  operation: "send",
  from_agent: "autoresearch",
  to_agent: "commander",
  body: "Autoresearch progress — Iteration #N: metric at <value> (baseline: <baseline>). Keeps: X | Discards: Y | Crashes: Z",
  message_type: "status"
}
```

### Completion — Report & Final Broadcast (MANDATORY)

When the loop ends (bounded mode reaching N, or goal achieved), you MUST complete all three steps:

1. **Final mailbox broadcast** with full summary:
```
commander_mailbox {
  operation: "send",
  from_agent: "autoresearch",
  to_agent: "commander",
  body: "Autoresearch complete (N iterations). Baseline: <X> → Final: <Y> (delta: <Z>). Keeps: A | Discards: B | Crashes: C. Best iteration: #M — <description>",
  message_type: "result"
}
```

2. **Visual completion report** — This is MANDATORY. Always call `show_report` with a rich summary that ties results back to the original plan:
```
show_report {
  title: "Autoresearch Complete: <goal>",
  summary: "## Results\n\nBaseline: <X> → Final: <Y> (delta: <Z>)\n\n**Iterations:** N total (A keeps, B discards, C crashes)\n\n**Best iteration:** #M — <description>\n\n## Plan vs. Reality\n\nReference `.context/autoresearch-plan.md` — which planned strategies were tried? Which worked? Any surprises or unexpected findings?\n\n## Kept Changes\n\n<list of kept iterations with descriptions>\n\n## What Didn't Work\n\n<Discarded approaches and why — useful for future research runs>"
}
```

3. **Preserve the plan** — Leave `.context/autoresearch-plan.md` intact as a record of what was planned vs. what happened. Do not delete it.

### Graceful Degradation

All Commander calls are **optional**. If Commander is unavailable:
- Skip `commander_task` and `commander_mailbox` calls silently
- The local `autoresearch-results.tsv` log remains the primary record
- The `show_report` call still works (it only needs git, not Commander)
- Never let a Commander error interrupt the autonomous loop

## Adapting to Different Domains

| Domain | Metric | Scope | Verify Command |
|--------|--------|-------|----------------|
| Backend code | Tests pass + coverage % | `src/**/*.ts` | `npm test` |
| Frontend UI | Lighthouse score | `src/components/**` | `npx lighthouse` |
| ML training | val_bpb / loss | `train.py` | `uv run train.py` |
| Blog/content | Word count + readability | `content/*.md` | Custom script |
| Performance | Benchmark time (ms) | Target files | `npm run bench` |
| Refactoring | Tests pass + LOC reduced | Target module | `npm test && wc -l` |

Adapt the loop to your domain. The PRINCIPLES are universal; the METRICS are domain-specific.
