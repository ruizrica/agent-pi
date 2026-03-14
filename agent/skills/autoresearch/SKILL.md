---
name: autoresearch
description: Autonomous Goal-directed Iteration. Apply Karpathy's autoresearch principles to ANY task. Loops autonomously — modify, verify, keep/discard, repeat. Invoke with /skill:autoresearch or when user says "work autonomously", "iterate until done", "keep improving", or "run overnight".
allowed-tools: Bash(git:*) Bash(npm:*) Bash(npx:*) Read Write Edit commander_task commander_mailbox show_report
---

# Autoresearch — Autonomous Goal-directed Iteration

Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch). Applies constraint-driven autonomous iteration to ANY work — not just ML research.

**Core idea:** You are an autonomous agent. Modify -> Verify -> Keep/Discard -> Repeat.

## When to Activate

- User invokes `/skill:autoresearch` or `/autoresearch`
- User says "work autonomously", "iterate until done", "keep improving", "run overnight"
- Any task requiring repeated iteration cycles with measurable outcomes

## Setup Phase (Do Once)

1. **Read all in-scope files** for full context before any modification
2. **Define the goal** — What does "better" mean? Extract or ask for a mechanical metric:
   - Code: tests pass, build succeeds, performance benchmark improves
   - Content: word count target hit, SEO score improves, readability score
   - Design: lighthouse score, accessibility audit passes
   - If no metric exists, define one with user, or use simplest proxy (e.g. "compiles without errors")
3. **Define scope constraints** — Which files can you modify? Which are read-only?
4. **Create a results log** — Track every iteration (see `references/results-logging.md`)
5. **Establish baseline** — Run verification on current state. Record as iteration #0
6. **Confirm and go** — Show user the setup, get confirmation, then BEGIN THE LOOP

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
8. **When stuck, think harder** — Re-read files, re-read goal, combine near-misses, try radical changes. Don't ask for help unless truly blocked by missing access/permissions

## Principles Reference

See `references/core-principles.md` for the 7 generalizable principles from autoresearch.

## Commander Integration (Task Tracking & Visibility)

When Commander is available, autoresearch MUST track every iteration as a Commander task. This gives the dashboard full visibility into autonomous work — just like the `tasks` extension does for manual workflows.

### Setup Phase — Create Task Group

After establishing the baseline (step 5), create a Commander task group for this research session:

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
  body: "Autoresearch started: <goal>. Baseline metric: <value>. Scope: <files>",
  message_type: "status"
}
```

### Per-Iteration — Create → Claim → Complete

**Before modifying** (Phase 3 of the loop), create and claim a Commander task:

```
commander_task { operation: "create", description: "Iteration #N: <planned change>", working_directory: "<cwd>", group_id: <group_id> }
commander_task { operation: "claim", task_id: <task_id>, agent_name: "autoresearch" }
```

**After logging results** (Phase 7), complete the task with the outcome:

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

### Completion — Report & Final Broadcast

When the loop ends (bounded mode reaching N, or goal achieved):

1. Send a final mailbox broadcast with full summary:
```
commander_mailbox {
  operation: "send",
  from_agent: "autoresearch",
  to_agent: "commander",
  body: "Autoresearch complete (N iterations). Baseline: <X> → Final: <Y> (delta: <Z>). Keeps: A | Discards: B | Crashes: C. Best iteration: #M — <description>",
  message_type: "result"
}
```

2. Call `show_report` to open the visual completion report:
```
show_report {
  title: "Autoresearch Complete: <goal>",
  summary: "## Results\n\nBaseline: <X> → Final: <Y> (delta: <Z>)\n\n**Iterations:** N total (A keeps, B discards, C crashes)\n\n**Best iteration:** #M — <description>\n\n## Kept Changes\n\n<list of kept iterations with descriptions>"
}
```

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
