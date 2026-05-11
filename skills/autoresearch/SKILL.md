---
name: autoresearch
description: Autonomous Goal-directed Iteration. Apply Karpathy's autoresearch principles to ANY task. Loops autonomously — modify, verify, keep/discard, repeat. Invoke with /skill:autoresearch or when user says "work autonomously", "iterate until done", "keep improving", or "run overnight".
allowed-tools: Bash(git:*) Bash(npm:*) Bash(npx:*) Bash(cmd:*) Read Write Edit ask_user show_plan show_research subagent_create_batch dispatch_agent show_report
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

6. **Save research session** — Create `.context/research-sessions/<session-id>.json` with the initial session data: goal, metric, scope, clarifying Q&A, status "understanding". Store the `session_id` for updates throughout the lifecycle.

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

4. **Update session** — Set status to "planning", save plan content and baseline metric.

## Phase 3: Setup & Begin

With understanding confirmed and plan approved, set up tracking and start.

1. **Create results log** — Create `autoresearch-results.tsv` (see `references/results-logging.md`)
2. **Record baseline** — Log the baseline metric from Phase 2 as iteration #0
3. **Commander tracking** — If available, create a root `cmd task` and broadcast start (see Commander Integration below)
4. **Update session** — Set status to "researching"
5. **Begin the loop** — Start iterating immediately. No further confirmation needed.

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

When `cmd` is available, autoresearch MUST track every iteration as a Commander task for local visibility in the Commander task tree.

### Setup Phase (Phase 3) — Create a root task

After baseline + plan approval, create a root feature task for this research session:

```bash
ROOT_TASK_ID=$(cmd task add "Autoresearch: <goal summary>" --type feature --priority high --json | jq -r '.id')
cmd task comment "$ROOT_TASK_ID" "Autoresearch started: <goal>. Baseline metric: <value>. Scope: <files>. Plan approved." --type progress --agent autoresearch
cmd mailbox send commander "Autoresearch: <goal summary>" "Autoresearch started: <goal>. Baseline metric: <value>. Scope: <files>."
```

Keep the returned `ROOT_TASK_ID` and create each iteration as a child task.

### Per-Iteration — Create → Claim → Update

**Before modifying** (step 3), add and claim an iteration task:

```bash
ITER_TASK_ID=$(cmd task add "Iteration #N: <planned change>" --parent "$ROOT_TASK_ID" --type task --priority medium --json | jq -r '.id')
cmd task claim "$ITER_TASK_ID"
cmd task comment "$ITER_TASK_ID" "STARTED: Iteration #N. Planned change: <short plan>." --type progress --agent autoresearch
```

**After logging results** (step 7), close the iteration task and capture metrics:

```bash
cmd task comment "$ITER_TASK_ID" "RESULT: <keep|discard|crash>: <description>. Metric: <old> → <new> (delta: <delta>). Commit: <hash or '-'>" --type progress --agent autoresearch
cmd task update "$ITER_TASK_ID" --status done
```

Use `done` for completed iterations; if an iteration must be retried intentionally, set it back to `todo`.

### Status Broadcasts — Every ~5 Iterations

Every 5 iterations, broadcast progress and add one root summary comment:

```bash
cmd mailbox send commander "Autoresearch progress" "Iteration #N: metric at <value> (baseline: <baseline>). Keeps: X | Discards: Y | Crashes: Z"
cmd task comment "$ROOT_TASK_ID" "Progress check: metric at <value>. Keeps: X | Discards: Y | Crashes: Z" --type progress --agent autoresearch
```

### Research Complete — Report & Implementation Handoff (MANDATORY)

When the loop ends (bounded mode reached or goal achieved):

```bash
cmd mailbox send commander "Autoresearch complete" "Iterations: N. Baseline: <X> → Final: <Y> (delta: <Z>). Keeps: A | Discards: B | Crashes: C. Best: #M — <description>"
cmd task comment "$ROOT_TASK_ID" "Autoresearch complete. Baseline: <X> → Final: <Y> (delta: <Z>). Keeps: A, Discards: B, Crashes: C. Best iteration: #M." --type progress --agent autoresearch
```

Then continue with report generation and implementation handoff as described above.

### Graceful Degradation

All Commander tracking is best-effort:
- If `cmd` is unavailable, skip `cmd task`/`cmd mailbox` calls silently.
- Keep `.context/autoresearch-results.tsv` as the source of truth.
- Do not let tracking failures interrupt the loop.

show_report still works unchanged for final handoff.

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

## Session Persistence

Every autoresearch session is saved to `.context/research-sessions/<session-id>.json`. This enables:
- **Resume later** — pick up where you left off via `/research` command
- **Browse history** — see all past research sessions in the research browser
- **Track lifecycle** — from understanding through implementation completion

Update the session file at every major transition: understand → plan → research → implement → complete. On every "keep" iteration or every ~5 iterations, append iteration data to the session. This creates a complete record of the research lifecycle that can be browsed and resumed.
