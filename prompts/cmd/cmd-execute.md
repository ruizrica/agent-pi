---
description: "Execute existing cmd/bd tasks via continuous claim-loop with bd-aware dependency ordering, file-scope guards, and Haiku→Sonnet→Opus escalation"
argument-hint: "[task IDs or 'all' or filter like 'pending' or 'backlog' or 'ready']"
allowed-tools: ["Task", "SlashCommand", "Bash", "Read", "Write", "Edit", "Glob", "Grep", "AskUserQuestion"]
---

# cmd Execute — Intelligent Task Orchestration via cmd CLI + bd ready

This command executes **existing tasks** stored in bd (created by `/cmd-plan`, `/cmd-task`, or `cmd task add`) using a planning-agent architecture for ad-hoc tasks and a **bd-native ready queue** for the claim-loop.

## Planning Agent Architecture for Execution

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN AGENT                                  │
│                    (Orchestrator Only)                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │ Phase 0: Fetch     │
                    │ tasks via cmd/bd   │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ HAIKU AGENT 1 │   │ HAIKU AGENT 2 │   │ HAIKU AGENT 3 │
│  Dependency   │   │   File Scope  │   │  Work Type    │
│   Analysis    │   │   Analysis    │   │ Classification│
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────────────┬─┴───────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │    OPUS AGENT       │
              │ (Execution Planner) │
              │   Build Waves &     │
              │   Assign Agents     │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │    MAIN AGENT       │
              │  Present Plan &     │
              │  Run Claim-Loop     │
              └─────────────────────┘
```

**Key Principle: The main agent does NO analysis itself — only fetches tasks and delegates. It does NOT create new tasks (use `/cmd-plan` for that).**

---

## Execution Agent Architecture: Haiku 4.5 with Escalation

**All task execution uses Haiku 4.5 agents with a structured escalation protocol:**

```
┌─────────────────────────────────────────────────────────┐
│              TASK EXECUTION FLOW                         │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Haiku 4.5 (Primary) │
            │   Attempts Task       │
            └───────────┬───────────┘
                        │
        ┌───────────────┼───────────────┐
        │                               │
        ▼ Success                      ▼ Stuck
    ┌──────────┐              ┌──────────────────┐
    │ Complete │              │ Escalation 1/2    │
    │ Task     │              │ → Sonnet 4.5      │
    └──────────┘              └─────────┬────────┘
                                        │
                            ┌───────────┼───────────┐
                            │                       │
                            ▼ Success              ▼ Stuck
                        ┌──────────┐      ┌──────────────────┐
                        │ Complete │      │ Escalation 2/2    │
                        │ Task     │      │ → Opus 4.5        │
                        └──────────┘      └─────────┬────────┘
                                                    │
                                            ┌───────┴───────┐
                                            │               │
                                            ▼ Success      ▼ Failure
                                        ┌──────────┐   ┌──────────┐
                                        │ Complete │   │ Fail Task│
                                        │ Task     │   │ (No more │
                                        └──────────┘   │ escalation│
                                                      └──────────┘
```

### Escalation Rules

1. **Primary Agent:** All tasks start with Haiku 4.5
2. **First Escalation:** Haiku 4.5 → Sonnet 4.5 (when stuck)
3. **Second Escalation:** Sonnet 4.5 → Opus 4.5 (only Sonnet can escalate to Opus)
4. **Total Limit:** Maximum 2 escalations per task
5. **Tracking:** All escalations logged via `cmd task comment <id> "ESCALATION N/2: ..." --type attempt`

---

## CRITICAL: Execution Only — No Planning

**`/cmd-execute` does NOT create tasks.** It only:
1. Fetches existing tasks via `cmd task list` / `bd ready`
2. Uses planning agents to analyze dependencies and waves (for ad-hoc tasks only)
3. Moves tasks through lifecycle: pending → working → completed
4. Orchestrates parallel agent execution via the bd-native ready queue

**If you need to create new tasks:**
- Use `/cmd-plan [description]` to scout, synthesize, and create tasks
- `/cmd-execute` can DELEGATE to `/cmd-plan` if it discovers undocumented subtasks
- Never create tasks directly inside `/cmd-execute`

---

## Prerequisites

- `cmd` and `bd` on PATH
- Current directory has `.beads/` (or run `bd init` first)
- Tasks exist in bd (otherwise `/cmd-execute` exits with "no tasks to execute")

---

## Input

Task selection: **$ARGUMENTS**

Options:
- `all` or empty — Execute all currently-ready tasks (`bd ready`)
- `ready` — Same as default; shows what `bd ready` returns
- `backlog` — Tasks tagged `cmd-status:backlog`; promote them to `pending` then execute
- `pending` — All `pending` tasks (regardless of bd-ready status — useful when deps are off-graph)
- Comma-separated numeric IDs — Execute specific tasks: `123,124,125`

---

## Workflow

### Phase 0: Fetch Tasks (Main Agent)

**The main agent fetches tasks based on $ARGUMENTS and decides whether planning is needed.**

#### 0.1 Fetch by selection

```bash
# Default / "ready" / "all"
bd ready --json
# Returns array of bead-id objects ready to work on (deps closed)

# "pending"
cmd task list --status pending --json

# "backlog"
cmd task list --status backlog --json

# Specific IDs (numeric)
for id in 123 124 125; do
  cmd task show "$id" --json
done
```

**For the canonical agent loop, prefer `bd ready --json`** — it filters to unblocked work and is the single source of truth for "what can run now".

To resolve a bd bead-id back to the cmd numeric id (needed for `cmd task claim`), parse `cmd task list --json` and look up `.bead_id == <ready bead>`.

```bash
# Resolve bead → numeric
ready_beads=$(bd ready --json | jq -r '.[].id')
all_tasks=$(cmd task list --json | sed -E 's/\x1b\[[0-9;]*m//g')
# Then lookup .bead_id == bead in all_tasks → .id
```

#### 0.2 Filter by working_directory

`bd` is scoped per `.beads/` directory, so the working_directory filter is automatic — every task returned by `bd ready` lives under the current `.beads/`. No explicit filter is needed.

If $ARGUMENTS specifies cross-project execution, switch directories first or run a separate `/cmd-execute` per project.

#### 0.3 Classify: Pre-Planned vs Ad-Hoc

Pre-planned tasks (from `/cmd-plan` or `/cmd-task`) have an `info` comment containing the Opus plan JSON (`source: "cmd-plan"` or `"cmd-task"`).

For each task, run:

```bash
plan_json=$(cmd task comments "$numeric_id" --json \
  | sed -E 's/\x1b\[[0-9;]*m//g' \
  | python3 -c "
import json, sys, re
d = sys.stdin.read()
s = d.find('['); e = d.rfind(']') + 1
arr = json.loads(d[s:e])
for c in arr:
    if c.get('type') == 'info':
        msg = c['message'].strip()
        if msg.startswith('{') and ('cmd-plan' in msg or 'cmd-task' in msg):
            print(msg)
            break
")
```

Tasks with `plan_json` non-empty are **pre-planned** — skip Phase 1/2 for them.
Tasks with `plan_json` empty are **ad-hoc** — they need Phase 1/2.

#### 0.4 Decision: Skip or Analyze

```
IF all tasks are Pre-Planned:
  → SKIP to Phase 3 (Direct Execution Planning)
  → Use existing context from each task's info comment

ELSE IF mixed (some Pre-Planned, some Ad-Hoc):
  → Only analyze Ad-Hoc tasks (Phase 1)
  → Merge with Pre-Planned context (Phase 2)

ELSE IF all Ad-Hoc:
  → Run full analysis (Phase 1 + Phase 2)
```

---

### Phase 1: Parallel Analysis (Ad-Hoc Tasks Only)

**Skip if all tasks are Pre-Planned.**

**Spawn ALL Haiku agents in a SINGLE message with multiple Task tool calls.**

#### Agent 1: Dependency Analyzer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Dependency Analysis for cmd Tasks

    **Tasks to Analyze:** [TASK_LIST_WITH_DESCRIPTIONS_AND_BEAD_IDS]

    **Mission:** Analyze task dependencies and build execution order.

    **Tasks:**
    1. Run `bd dep tree <bead-id>` for each task to see existing edges
    2. Parse each task description for dependency keywords:
       - "after", "depends on", "requires", "blocks", "must complete before"
       - Explicit IDs in description text
    3. Compare written deps against the bd graph; flag mismatches
    4. Build a per-task wave assignment based on transitive blockers

    **Return Format (JSON):**
    ```json
    {
      "dependency_map": {
        "v2-abc": [],
        "v2-def": ["v2-abc"],
        "v2-ghi": ["v2-abc", "v2-def"]
      },
      "waves": {
        "wave_1": ["v2-abc"],
        "wave_2": ["v2-def"],
        "wave_3": ["v2-ghi"]
      },
      "circular_dependencies": [],
      "execution_order": ["v2-abc", "v2-def", "v2-ghi"],
      "missing_bd_edges": [
        {"from": "v2-def", "to": "v2-abc", "reason": "task description says 'after v2-abc' but no bd edge exists"}
      ]
    }
    ```
```

#### Agent 2: File Scope Analyzer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## File Scope Analysis for cmd Tasks

    **Tasks to Analyze:** [TASK_LIST_WITH_DESCRIPTIONS]

    **Mission:** Determine file scope for each task (for execution guards).

    **Tasks:**
    1. Parse descriptions for scope keywords ("modifies:", "affects:", "scope:", file paths)
    2. Identify allowed files (whitelist)
    3. Identify forbidden zones (must NOT modify)
    4. Map services/modules each task touches

    **Return Format (JSON):**
    ```json
    {
      "task_scopes": {
        "<numeric_id>": {
          "allowed_files": ["src/models/user.ts"],
          "may_also_touch": ["src/utils/validation.ts"],
          "must_not_touch": ["frontend/*", "tests/*"],
          "services_used": ["database", "auth"]
        }
      },
      "scope_conflicts": [],
      "notes": ["..."]
    }
    ```
```

#### Agent 3: Work Type Classifier

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Work Type Classification for cmd Tasks

    **Tasks to Analyze:** [TASK_LIST]

    **Mission:** Classify each task by work type and complexity.

    | Work Type | Keywords |
    |-----------|----------|
    | Backend | api, database, service, auth, business logic, endpoint, schema |
    | Frontend | ui, component, styling, state, form, button, page |
    | Testing | test, unit, integration, e2e, coverage, spec |
    | Documentation | doc, readme, comment, guide |
    | DevOps | ci, cd, deployment, infra, config, docker, k8s |
    | Refactoring | refactor, cleanup, optimize, improve, simplify |

    **Return Format (JSON):**
    ```json
    {
      "task_classifications": {
        "<numeric_id>": {
          "work_type": "backend",
          "keywords_matched": ["api", "endpoint"],
          "complexity": "low|medium|high"
        }
      },
      "work_type_summary": {"backend": 3, "frontend": 2, "testing": 1}
    }
    ```
```

---

### Phase 2: Build Execution Plan (Opus Subagent — Ad-Hoc Tasks Only)

**Skip if all tasks are Pre-Planned.**

```
Use the Task tool with:
- subagent_type: "general-purpose"
- model: "opus"
- prompt: |
    ## Execution Plan Synthesis

    **Inputs (paste verbatim):**
    [DEPENDENCY_JSON]
    [FILE_SCOPE_JSON]
    [WORK_TYPE_JSON]

    **Mission:** Build a wave-organized execution plan.

    1. Combine the three Haiku analyses
    2. For each task: pick assigned_agent (haiku-4.5 default; sonnet-4.5 if complexity=high)
    3. Group tasks into waves based on the dependency graph
    4. For each wave, list tasks that can run in parallel

    **Return Format (JSON):**
    ```json
    {
      "execution_summary": "1-2 sentence summary",
      "total_tasks": 7,
      "total_waves": 3,
      "waves": [
        {
          "wave": 1,
          "tasks": [
            {
              "numeric_id": 1,
              "bead_id": "v2-abc",
              "description": "...",
              "work_type": "backend",
              "assigned_agent": "haiku-4.5",
              "file_scope": {"allowed": ["..."], "forbidden": ["..."]},
              "complexity": "medium"
            }
          ]
        }
      ],
      "missing_bd_edges_to_create": [
        {"from_bead": "v2-def", "to_bead": "v2-abc", "reason": "wave-2 must wait for wave-1"}
      ]
    }
    ```
```

After Opus returns, **wire any missing bd edges** so `bd ready` correctly gates the loop:

```bash
for edge in $missing_bd_edges; do
  bd dep add "$edge.from_bead" "$edge.to_bead"
done
```

---

### Phase 3: Direct Execution Planning (Pre-Planned Tasks Only)

For pre-planned tasks, the per-task `info` comment already contains:
- `file_scope.allowed`
- `assigned_agent`
- `implementation_guide`
- `analysis_context`

The main agent just collects them per-wave (where wave is derived from `bd dep tree`):

```bash
# For each pre-planned task, parse its info comment to get wave assignment
# (the Opus plan from /cmd-plan includes wave numbers)
```

If both pre-planned and ad-hoc tasks are present, merge results from Phase 2 and Phase 3.

---

### Phase 4: Present Plan & Approval Gate

```
## Execution Plan

### Summary
[execution_summary from Opus or aggregate of pre-planned summaries]

### Total: [N] tasks across [M] waves

### Wave 1 ([count] tasks — parallel-safe)
- #1  v2-abc  [pending]  backend     p1   In src/auth/middleware.ts:30-50  Add JWT verification
- #2  v2-def  [pending]  backend     p2   In src/auth/types.ts:1-20         Define JwtPayload type

### Wave 2 ([count] tasks — depends on Wave 1)
- #3  v2-ghi  [pending]  testing     p3   In tests/auth.test.ts:1-100      Add JWT verification tests

### Wave 3 ([count] tasks — depends on Wave 2)
- #4  v2-jkl  [pending]  docs        p4   In docs/auth.md                  Document JWT flow

---

Sanity:
  bd ready              # should match Wave 1 only
  cmd tree              # full hierarchy
```

```
AskUserQuestion({
  questions: [{
    question: "Plan: X tasks across Y waves. Execute?",
    header: "Execute?",
    options: [
      { label: "Execute All", description: "Start the claim-loop and run all waves" },
      { label: "Execute Wave 1", description: "Run wave 1 only; pause for review" },
      { label: "Modify", description: "Adjust the plan first" },
      { label: "Cancel", description: "Don't execute, leave tasks as-is" }
    ],
    multiSelect: false
  }]
})
```

Wait for user response.

---

### Phase 5: Continuous Claim-Loop Execution

**On approval, execute via continuous claim-loop. Each agent claims ONE bd-ready task at a time. Multiple agents (multiple terminals running `/cmd-execute`) coexist via `cmd task claim`'s atomic sidecar write.**

#### 5.1 Algorithm

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLAIM-LOOP EXECUTION FLOW                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 1. bd ready --json            │
              │    Find unblocked work        │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼ Found                        ▼ Empty
     ┌────────────────┐           ┌────────────────────────┐
     │ 2. Resolve     │           │ 3. Are any tasks still │
     │ bead → numeric │           │    open / working?     │
     └───────┬────────┘           └───────────┬────────────┘
             │                                │
             ▼                          ┌─────┴─────┐
     ┌────────────────┐                 ▼ Yes      ▼ No
     │ 3. cmd task    │            ┌────────┐  ┌──────────┐
     │    claim <id>  │            │ Wait   │  │ EXIT     │
     └───────┬────────┘            │ 30s    │  │ All done │
             │                     └────────┘  └──────────┘
       ┌─────┴─────┐
       │           │
       ▼ ok       ▼ already claimed
  ┌──────────┐ ┌─────────────┐
  │ 4. Work  │ │ Pick next   │
  │ on task  │ │ ready bead  │
  └────┬─────┘ └─────────────┘
       │
       ▼
  ┌──────────┐
  │ Complete │
  │ or Fail  │
  └────┬─────┘
       │
       ▼ (loop back to step 1)
```

#### 5.2 Main Claim-Loop (pseudo-code)

```
INITIALIZE:
  consecutive_empty_polls = 0
  max_empty_polls = 5  # 5 × 30s = 2.5 min before exiting

MAIN_LOOP:
  WHILE TRUE:

    # Step 1: Find next ready task (bd does the dependency-aware filtering)
    next_bead=$(bd ready --json | jq -r '.[0].id // empty')

    IF next_bead is empty:
      # Are there still tasks open elsewhere (working, deferred)?
      open_count=$(cmd task list --status working --json | jq 'length')

      IF open_count > 0:
        # Other agents may finish theirs and unblock more work
        Log: "No ready work, but $open_count tasks still working. Waiting…"
        WAIT 30s
        consecutive_empty_polls += 1
        IF consecutive_empty_polls >= max_empty_polls:
          Log: "Long stretch of no progress; exiting loop. Re-run /cmd-execute later."
          BREAK
        CONTINUE
      ELSE:
        Log: "All tasks complete. Exiting loop."
        BREAK

    consecutive_empty_polls = 0

    # Step 2: Resolve bead → numeric id
    numeric=$(cmd task list --json \
      | sed -E 's/\x1b\[[0-9;]*m//g' \
      | python3 -c "
import json, sys
d = sys.stdin.read()
arr = json.loads(d[d.find('['):d.rfind(']')+1])
print(next(t['id'] for t in arr if t['bead_id'] == '$next_bead'))
")

    # Step 3: Atomic claim
    claim_out=$(cmd task claim "$numeric" 2>&1) || {
      Log: "[INFO] Task $numeric already claimed by another agent; trying next."
      CONTINUE
    }

    # Step 4: Mark as working (separate from claim — claim only sets identity)
    cmd task update "$numeric" --status working

    # Step 5: Execute the task (see 5.4)
    executeTask numeric=$numeric bead=$next_bead

    # Loop continues
    CONTINUE
```

#### 5.3 Wave checkpoints

When all tasks at the current "wave depth" close, run a commit checkpoint before the next wave begins:

```bash
# Detect wave boundary: when bd ready returns NEW beads that weren't ready before,
# treat that transition as a wave boundary.

# After every wave:
git add -A
git commit -m "checkpoint: wave [N] complete — [count] tasks"
```

Skip the commit if there's nothing to commit.

#### 5.4 Task Agent Execution

**Spawn a Task agent per claim using this prompt:**

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## cmd CLI Protocol — Claim-Loop Execution (Haiku 4.5)

    **You are a Haiku 4.5 agent. You have ALREADY been claimed onto task #[NUMERIC_ID] (bead [BEAD_ID]).**

    **Working directory:** [WORKING_DIRECTORY]
    **File scope (allowed):** [FILE_SCOPE_ALLOWED]
    **File scope (forbidden):** [FILE_SCOPE_FORBIDDEN]

    ---

    ### Awareness Check
    `cmd mailbox inbox` — pick up any prior context from teammates. If another agent is working the exact same scope, surface the conflict and bail.

    Optional teammate communication:
    - `cmd mailbox send @all "discovery" "Found: [discovery]"`
    - `cmd mailbox send commander "stuck" "Stuck on: [problem]"` (only after 2+ real attempts)

    ### Task Execution Protocol

    **1. ADD START COMMENT:**
    `cmd task comment [NUMERIC_ID] "STARTED: [approach]. Scope: [files]. Escalations remaining: 2" --type progress`

    **2. WORK WITH CONSTANT COMMENTS — every step gets a before/after comment:**

    | Operation | Before | After |
    |-----------|--------|-------|
    | Reading file | `ANALYZING: [file] — [goal]` | `FOUND: [discovery]` |
    | Making edit | `PLANNING: [file:lines] — [change]` | `MODIFIED: [file:lines] — [summary]` |
    | Running test | `TESTING: [test] — [expected]` | `RESULT: [pass/fail] — [details]` |
    | Decision | `DECISION: [choice] because [reason]` | — |

    Post each via:
    `cmd task comment [NUMERIC_ID] "[PREFIX]: [details]" --type progress`

    Comment in real-time as you work. **Do NOT batch.** This audit trail is what makes debugging and handoffs possible.

    **3. ON COMPLETION:**
    ```bash
    cmd task update [NUMERIC_ID] --status done
    cmd task comment [NUMERIC_ID] \
      "COMPLETED: [summary]. Files: [list]. Escalations used: [0/1/2]" \
      --type info
    ```

    **4. ON FAILURE:**
    ```bash
    cmd task comment [NUMERIC_ID] \
      "FAILED: [reason]. Attempted: [approaches]. Blocker: [what stopped progress]" \
      --type error
    cmd task update [NUMERIC_ID] --status failed
    ```

    **5. EXIT:**
    Return control to the main agent. The main agent's claim-loop picks the next ready task.

    ---

    ### File Scope Enforcement

    BEFORE editing any file, verify it is in `allowed_files` from your context. If you need to touch a forbidden file, comment a `BLOCKED:` message and FAIL the task — escalation will not bypass scope.

    ```bash
    cmd task comment [NUMERIC_ID] "BLOCKED: file scope says forbidden — [forbidden_file]. Suggest plan revision." --type handoff
    cmd task update [NUMERIC_ID] --status failed
    ```

    ---

    ### Multi-Agent Awareness

    - **Expect race conditions.** Another agent may have completed adjacent work between when you started and when you finish. Re-read files before final assertions.
    - **Trust `cmd task claim`** — it's atomic. If you're here, the task is yours.
    - **Don't claim or release tasks** other than the one assigned to you. The main agent's loop handles dispatch.

    ---

    ### Escalation Protocol (Maximum 2 escalations per task)

    1. **First Escalation (Haiku → Sonnet 4.5):**
       Stuck after reasonable attempts. Spawn a Sonnet subagent with full context (your attempts + the blocker).
       Comment: `ESCALATION 1/2: Escalating to Sonnet 4.5 — [reason]` (type: `attempt`)

    2. **Second Escalation (Sonnet → Opus 4.5):**
       Only Sonnet can escalate. Spawn an Opus subagent.
       Comment: `ESCALATION 2/2: Escalating to Opus 4.5 — [reason]` (type: `attempt`)

    3. After Opus, no further escalation — fail the task with a clear handoff comment.

    **Escalation criteria:**
    - Complex architectural decisions beyond your model's capability
    - Persistent errors you cannot resolve after 2+ attempts
    - Need for deep codebase understanding you lack
```

---

### Phase 6: Final Summary

After the claim-loop exits (either all tasks complete or user-requested stop):

```
## Execution Summary

### Completed: [count]
- #1  v2-abc  COMPLETED  In src/auth/middleware.ts:30-50  (Haiku)
- #3  v2-ghi  COMPLETED  In tests/auth.test.ts:1-100      (Haiku)

### Failed: [count]
- #5  v2-mno  FAILED  In src/auth/oauth.ts  Need: design clarification

### Pending: [count]
- #6  v2-pqr  Still blocked by #5

Sanity:
  cmd task list --status pending
  cmd task list --status failed
  bd ready
```

---

## cmd ↔ commander tool reference

| Old MCP tool | New cmd CLI |
|---|---|
| `commander_task(operation="list", status, working_directory)` | `cmd task list --status <s> --json` |
| `commander_task(operation="get", task_id)` | `cmd task show <id> --json` |
| `commander_task_lifecycle(operation="claim")` | `cmd task claim <id>` |
| `commander_task_lifecycle(operation="complete")` | `cmd task update <id> --status done` + `cmd task comment <id> "..." --type info` |
| `commander_task_lifecycle(operation="fail")` | `cmd task update <id> --status failed` + `cmd task comment <id> "..." --type error` |
| `commander_comment(operation="add")` | `cmd task comment <id> "msg" --type T` |
| `commander_log` | `cmd task comment <id> "msg" --type progress` |
| `commander_task_group(operation="get", group_id)` | `bd dep tree <root-bead>` (use the bd dep graph as the group; `bd ready` filters to unblocked) |
| `commander_task_group(operation="list")` | `cmd task list --json` (full picture) |
| `commander_mailbox` | `cmd mailbox send`, `cmd mailbox inbox`, `cmd mailbox read` |

---

## Usage Examples

```bash
# Default: process whatever bd thinks is ready
/cmd-execute

# Explicit: ready queue only
/cmd-execute ready

# Backlog promotion: move backlog tasks to pending, then run
/cmd-execute backlog

# Specific tasks
/cmd-execute 123,124,125

# All pending (ignore bd ready filter — useful when deps are off-graph)
/cmd-execute pending
```

```bash
# Multi-agent execution (run from N different terminals):
# Terminal 1
/cmd-execute

# Terminal 2 (in parallel, claim contention is handled atomically)
/cmd-execute
```
