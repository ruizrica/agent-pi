# Autonomous Loop Protocol

Detailed protocol for the autoresearch iteration loop. SKILL.md has the summary; this file has the full rules.

## Loop Modes

Autoresearch supports two loop modes:

- **Unbounded (default):** Loop forever until manually interrupted (Ctrl+C)
- **Bounded:** Loop exactly N times when user specifies a count

When bounded, track `current_iteration` against `max_iterations`. After the final iteration, print a summary and stop.

## Phase 1: Review (30 seconds)

Before each iteration, build situational awareness:

```
1. Read current state of in-scope files (full context)
2. Read last 10-20 entries from results log
3. Read git log --oneline -20 to see recent changes
4. Re-read `.context/autoresearch-plan.md` Strategy section for planned approaches
5. Identify: what worked, what failed, what's untried from the plan
6. If bounded: check current_iteration vs max_iterations
```

**Why read every time?** After rollbacks, state may differ from what you expect. Never assume — always verify.

## Phase 2: Ideate (Strategic)

Pick the NEXT change. Priority order:

1. **Fix crashes/failures** from previous iteration first
2. **Exploit successes** — if last change improved metric, try variants in same direction
3. **Explore new approaches** — try something the results log shows hasn't been attempted
4. **Combine near-misses** — two changes that individually didn't help might work together
5. **Simplify** — remove code while maintaining metric. Simpler = better
6. **Radical experiments** — when incremental changes stall, try something dramatically different

**Anti-patterns:**
- Don't repeat exact same change that was already discarded
- Don't make multiple unrelated changes at once (can't attribute improvement)
- Don't chase marginal gains with ugly complexity

**Bounded mode consideration:** If remaining iterations are limited (<3 left), prioritize exploiting successes over exploration.

### Commander: Create + Claim Task

After ideating the next change, create a Commander task and claim it:

```
commander_task { operation: "create", description: "Iteration #N: <planned change>", working_directory: "<cwd>", group_id: <group_id> }
commander_task { operation: "claim", task_id: <returned_task_id>, agent_name: "autoresearch" }
```

This makes the iteration visible on the Commander dashboard as an active task.

## Phase 3: Modify (One Atomic Change)

- Make ONE focused change to in-scope files
- The change should be explainable in one sentence
- Write the description BEFORE making the change (forces clarity)

## Phase 4: Commit (Before Verification)

```bash
git add <changed-files>
git commit -m "experiment: <one-sentence description>"
```

Commit BEFORE running verification so rollback is clean: `git reset --hard HEAD~1`

## Phase 5: Verify (Mechanical Only)

Run the agreed-upon verification command. Capture output.

**Timeout rule:** If verification exceeds 2x normal time, kill and treat as crash.

**Extract metric:** Parse the verification output for the specific metric number.

## Phase 6: Decide (No Ambiguity)

```
IF metric_improved:
    STATUS = "keep"
    # Do nothing — commit stays
ELIF metric_same_or_worse:
    STATUS = "discard"
    git reset --hard HEAD~1
ELIF crashed:
    # Attempt fix (max 3 tries)
    IF fixable:
        Fix -> re-commit -> re-verify
    ELSE:
        STATUS = "crash"
        git reset --hard HEAD~1
```

**Simplicity override:** If metric barely improved (+<0.1%) but change adds significant complexity, treat as "discard". If metric unchanged but code is simpler, treat as "keep".

## Phase 7: Log Results

Append to results log (TSV format):

```
iteration  commit   metric   status   description   commander_task_id
42         a1b2c3d  0.9821   keep     increase attention heads from 8 to 12   184
43         -        0.9845   discard  switch optimizer to SGD   185
44         -        0.0000   crash    double batch size (OOM)   186
```

### Commander: Complete Task + Add Comment

After logging, complete the Commander task and add a detailed comment:

```
commander_task { operation: "complete", task_id: <task_id>, result: "<keep|discard|crash>: <description>. Metric: <old> → <new> (delta: <delta>)" }
commander_task { operation: "comment:add", task_id: <task_id>, body: "Status: <status>\nMetric: <value> (delta: <delta>)\nCommit: <hash or '-'>\nDescription: <what was tried>", agent_name: "autoresearch" }
```

Use `complete` for all outcomes — discards and crashes are expected in autoresearch, not failures.

## Phase 8: Repeat

### Commander: Status Broadcast Every ~5 Iterations

Every 5 iterations, send a mailbox status update so the Commander dashboard shows live progress:

```
commander_mailbox {
  operation: "send",
  from_agent: "autoresearch",
  to_agent: "commander",
  body: "Autoresearch progress — Iteration #N: metric at <value> (baseline: <baseline>). Keeps: X | Discards: Y | Crashes: Z",
  message_type: "status"
}
```

### Unbounded Mode (default)

Go to Phase 1. **NEVER STOP. NEVER ASK IF YOU SHOULD CONTINUE.**

### Bounded Mode (with iteration count)

```
IF current_iteration < max_iterations:
    Go to Phase 1
ELIF goal_achieved:
    Print: "Goal achieved at iteration {N}! Final metric: {value}"
    Print final summary
    STOP
ELSE:
    Print final summary
    STOP
```

**Final summary format:**
```
=== Autoresearch Complete (N/N iterations) ===
Baseline: {baseline} -> Final: {current} ({delta})
Keeps: X | Discards: Y | Crashes: Z
Best iteration: #{n} — {description}
```

### Commander: Final Broadcast + Completion Report (MANDATORY)

When the loop ends (bounded or goal achieved), ALL three steps are required:

1. Send a final mailbox result broadcast:
```
commander_mailbox {
  operation: "send",
  from_agent: "autoresearch",
  to_agent: "commander",
  body: "Autoresearch complete (N iterations). Baseline: <X> → Final: <Y> (delta: <Z>). Keeps: A | Discards: B | Crashes: C. Best: #M — <description>",
  message_type: "result"
}
```

2. Call `show_report` to open the visual completion report with a rich summary that ties back to the research plan:
```
show_report {
  title: "Autoresearch Complete: <goal>",
  summary: "## Results\n\nBaseline: <X> → Final: <Y> (delta: <Z>)\n\n**Iterations:** N total (A keeps, B discards, C crashes)\n\n**Best:** #M — <description>\n\n## Plan vs. Reality\n\nReference `.context/autoresearch-plan.md` — which planned strategies were tried? Which worked? What was surprising?\n\n## Kept Changes\n\n<list of kept iterations with descriptions>\n\n## What Didn't Work\n\n<Discarded approaches and why>"
}
```

3. Preserve `.context/autoresearch-plan.md` as a record of the research session. Do not delete it.

### When Stuck (>5 consecutive discards)

Applies to both modes:
1. Re-read ALL in-scope files from scratch
2. Re-read the original goal AND `.context/autoresearch-plan.md` for planned strategy
3. Review entire results log for patterns
4. Try the next untried approach from the plan's Strategy section
5. Try combining 2-3 previously successful changes
6. Try the OPPOSITE of what hasn't been working
7. Try a radical architectural change

## Crash Recovery

- Syntax error: fix immediately, don't count as separate iteration
- Runtime error: attempt fix (max 3 tries), then move on
- Resource exhaustion (OOM): revert, try smaller variant
- Infinite loop/hang: kill after timeout, revert, avoid that approach
- External dependency failure: skip, log, try different approach

## Communication

- **DO NOT** ask "should I keep going?" — in unbounded mode, YES. ALWAYS. In bounded mode, continue until N is reached.
- **DO NOT** summarize after each iteration — just log and continue
- **DO** print a brief one-line status every ~5 iterations (e.g., "Iteration 25: metric at 0.95, 8 keeps / 17 discards")
- **DO** alert if you discover something surprising or game-changing
- **DO** print a final summary when bounded loop completes
- **DO** send Commander mailbox status broadcasts every ~5 iterations
- **DO** add comments to Commander tasks with detailed iteration results
- **DO** send a final Commander mailbox result broadcast when the loop ends
- **DO** call `show_report` at loop end for a visual completion report

## Commander Graceful Degradation

All Commander integration (task tracking, mailbox broadcasts, comments) is **optional**. If Commander is unavailable:

- Skip all `commander_task` and `commander_mailbox` calls silently
- Never let a Commander error interrupt or break the autonomous loop
- The local `autoresearch-results.tsv` remains the primary record
- `show_report` still works without Commander (it only needs git)
