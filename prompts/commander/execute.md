---
description: "Execute pending tasks from Commander with intelligent orchestration: dependency analysis, work type classification, and execution guards"
argument-hint: "[task IDs or 'all' or filter like 'pending' or 'working']"
allowed-tools: ["Task", "SlashCommand", "AskUserQuestion", "Bash"]
---

# Commander Execute - Intelligent Task Orchestration with Execution Guards

This command executes **existing tasks** from Commander CLI-backed tools using a **planning agent architecture** with sophisticated orchestration: dependency analysis, work type classification, commit checkpoints, and execution guards.

## Planning Agent Architecture for Execution

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN AGENT                                  │
│                    (Orchestrator Only)                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Phase 0: Fetch    │
                    │ Tasks from Commander  │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ SCOUT AGENT 1 │   │ SCOUT AGENT 2 │   │ SCOUT AGENT 3 │
│  Dependency   │   │   File Scope  │   │  Work Type    │
│   Analysis    │   │   Analysis    │   │ Classification│
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────────────┬─┴───────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │    PLANNER AGENT       │
              │ (Execution Planner) │
              │   Build Waves &     │
              │   Assign Agents     │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │    MAIN AGENT       │
              │  Present Plan &     │
              │  Execute Waves      │
              └─────────────────────┘
```

**Key Principle: The main agent does NO analysis itself - only fetches tasks and delegates.**

---

## Execution Agent Architecture: builder with Escalation to reviewer

**All task execution uses builder agents with a structured escalation protocol:**

```
┌─────────────────────────────────────────────────────────┐
│              TASK EXECUTION FLOW                         │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   builder (Primary)   │
            │   Attempts Task       │
            └───────────┬───────────┘
                        │
        ┌───────────────┼───────────────┐
        │                               │
        ▼ Success                      ▼ Stuck
    ┌──────────┐              ┌──────────────────┐
    │ Complete │              │ Escalation        │
    │ Task     │              │ → reviewer        │
    └──────────┘              └─────────┬────────┘
                                        │
                            ┌───────────┼───────────┐
                            │                       │
                            ▼ Success              ▼ Failure
                        ┌──────────┐          ┌──────────┐
                        │ Complete │          │ Fail Task│
                        │ Task     │          │ (No more │
                        └──────────┘          │ escalation│
                                              └──────────┘
```

### Escalation Rules

1. **Primary Agent:** All tasks start with `builder` agent
2. **Escalation:** builder → `reviewer` (when stuck)
   - builder must document attempts and blockers before escalating
   - Maximum 1 escalation to reviewer per task
   - Only builder can escalate to reviewer
   - builder must attempt the task before escalating
3. **Total Limit:** Maximum 1 escalation per task (builder → reviewer)
4. **Escalation Tracking:** All escalations logged in task comments with reason

### When to Escalate

- Complex architectural decisions beyond current model's capability
- Persistent errors that cannot be resolved after reasonable attempts
- Need for deep codebase understanding or pattern recognition
- Multi-step reasoning that exceeds current model's capacity
- Type system or compilation issues requiring advanced reasoning

---

## CRITICAL: Execution Only - No Planning

**Commander Execute does NOT create tasks.** It only:
1. Fetches existing tasks from Commander (pending or working)
2. Uses planning agents to analyze dependencies and organize waves
3. Moves tasks through lifecycle: pending → in-progress → done (with in-progress alias `working`)
4. Orchestrates parallel agent execution

**If you need to create new tasks:**
- Use `/commander-plan [description]` to analyze and create tasks
- Commander-execute can DELEGATE to commander-plan when subtasks are discovered
- Never directly create tasks in commander-execute

**⚠️ CRITICAL: NO AD-HOC TASKS — ALL tasks should belong to an initiative root task tree, not standalone ad-hoc tasks.**
- `/commander-execute` only runs already-created tasks.
- If needed tasks are missing, run `/commander-plan` first to provision them.

---

**⚠️ IMPORTANT: Use current Commander statuses (`pending`, `in-progress`/`working`, `done`/`completed`) when selecting tasks for execution.**

## Input

Task selection: **$ARGUMENTS**

Options:
- `all` or empty - Execute all pending tasks
- `pending` - All tasks with pending status
- Task IDs (comma-separated) - Execute specific tasks: `123, 124, 125`
- `working`/`in-progress` - Resume tasks that were in progress

---

## Workflow

### Phase 0: Fetch Tasks & Classify (Main Agent)

**The main agent fetches tasks and determines if planning is needed.**

**CRITICAL: Only execute tasks for the current working directory.**

1. **Fetch Tasks Based on $ARGUMENTS (Filtered by Current Directory)**

   Use `cmd` with current-directory scope:
   - `cmd task list --status pending --json` (pending tasks)
   - `cmd task list --status in-progress --json` (currently working tasks)
   - `cmd task show <id> --json` for each specific task id
   - Filter by `working_directory` from returned task JSON
   - If `all` or empty: fetch all non-completed tasks via `cmd task list --json` and focus on this directory

   **If no tasks match the current directory:**
   - Display message: "No tasks found for this directory: [CURRENT_DIR]"
   - List other directories that have pending tasks (if any)
   - Exit without executing

2. **Classify Tasks: Pre-Planned vs Ad-Hoc**

   Check task fields to classify (NOT the context JSON):

   **Pre-Planned Tasks** (from `/commander-plan`):
   - Have `source` field equal to `"commander-plan"` (check `task.source`, NOT `task.context`)
   - OR have `parent_task_id` set (belongs to a planned initiative tree - most reliable indicator)
   - Have `dependency_order` set
   - Context JSON contains `file_scope`, `assigned_agent`, `implementation_guide`

   **Ad-Hoc Tasks** (individual tasks):
   - Have `source` field equal to `"ad-hoc"` or undefined
   - No `parent_task_id` (null or undefined)
   - Missing execution context

   **IMPORTANT:** The `source` and hierarchy (`parent_task_id`) fields are used for classification.
   Use `task.source === 'commander-plan'` or `task.parent_task_id` (or any parent-child relation) for classification.

3. **Decision Point: Skip or Analyze**

   ```
   IF all tasks are Pre-Planned (same initiative root and wave order):
     → SKIP to Phase 2.5 (Direct Execution Planning)
     → Use existing context from tasks

   ELSE IF mixed (some Pre-Planned, some Ad-Hoc):
     → Only analyze Ad-Hoc tasks (Phase 1)
     → Merge with Pre-Planned context (Phase 2)

   ELSE IF all Ad-Hoc:
     → Run full analysis (Phase 1 + Phase 2)
   ```

---

### Phase 1: Parallel Analysis (Ad-Hoc Tasks Only)

**SKIP THIS PHASE if all tasks are Pre-Planned from `/commander-plan`.**

**Only run for Ad-Hoc tasks that lack execution context.**

**Spawn multiple scout agents IN PARALLEL using the Task tool.**

**CRITICAL: Launch ALL scout agents in a SINGLE message with multiple Task tool calls.**

#### Agent 1: Dependency Analyzer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Dependency Analysis for Commander Tasks

    **Tasks to Analyze:**
    [INSERT TASK LIST WITH DESCRIPTIONS]

    **Your Mission:** Analyze task dependencies and build execution order.

    **Analysis Tasks:**
    1. Parse each task description for dependency keywords:
       - "after", "depends on", "requires", "blocks", "must complete before"
       - Explicit IDs: "Task #123", "#456", "task 789"
    2. Build dependency map: `{ taskA: [taskB, taskC] }` means A depends on B and C
    3. Detect circular dependencies
    4. Perform topological sort for execution order
    5. Group independent tasks into waves

    **Return Format (JSON):**
    ```json
    {
      "dependency_map": {
        "task_123": [],
        "task_124": ["task_123"],
        "task_125": ["task_123", "task_124"]
      },
      "waves": {
        "wave_1": ["task_123"],
        "wave_2": ["task_124"],
        "wave_3": ["task_125"]
      },
      "circular_dependencies": [],
      "execution_order": ["task_123", "task_124", "task_125"],
      "analysis_notes": ["...", "..."]
    }
    ```
```

#### Agent 2: File Scope Analyzer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## File Scope Analysis for Commander Tasks

    **Tasks to Analyze:**
    [INSERT TASK LIST WITH DESCRIPTIONS AND CONTEXT]

    **Your Mission:** Determine file scope for each task (for execution guards).

    **Analysis Tasks:**
    1. Parse task descriptions for scope keywords:
       - "modifies:", "affects:", "scope:", "files:", "updates:"
       - File paths mentioned: "src/auth/*.ts", "src/models/user.ts"
    2. Extract file patterns from task context metadata
    3. Identify files that SHOULD be modified (whitelist)
    4. Identify files that MUST NOT be modified
    5. Map dependencies and services used

    **Return Format (JSON):**
    ```json
    {
      "task_scopes": {
        "task_123": {
          "allowed_files": ["src/models/user.ts", "src/types/user.ts"],
          "may_also_touch": ["src/utils/validation.ts"],
          "must_not_touch": ["frontend/*", "tests/*"],
          "services_used": ["database", "auth"]
        }
      },
      "scope_conflicts": [],
      "notes": ["...", "..."]
    }
    ```
```

#### Agent 3: Work Type Classifier

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Work Type Classification for Commander Tasks

    **Tasks to Analyze:**
    [INSERT TASK LIST WITH DESCRIPTIONS]

    **Your Mission:** Classify each task by work type and complexity (for escalation likelihood estimation).

    **Classification Keywords:**

    | Work Type | Keywords |
    |-----------|----------|
    | Backend | api, database, service, auth, business logic, endpoint, schema |
    | Frontend | ui, component, styling, state, form, button, page |
    | Testing | test, unit, integration, e2e, coverage, spec |
    | Documentation | doc, readme, comment, guide, api docs |
    | DevOps | ci, cd, deployment, infra, config, docker, k8s |
    | Refactoring | refactor, cleanup, optimize, improve, simplify |

    **Note:** All tasks are executed by builder agents with escalation capability.

    **Return Format (JSON):**
    ```json
    {
      "task_classifications": {
        "task_123": {
          "work_type": "backend",
          "keywords_matched": ["api", "endpoint"],
          "complexity": "medium"
        }
      },
      "work_type_summary": {
        "backend": 3,
        "frontend": 2,
        "testing": 1
      },
      "complexity_distribution": {
        "low": 4,
        "medium": 2,
        "high": 0
      }
    }
    ```
```

### Phase 2: Execution Planning (planner Subagent)

**After ALL scout agents return, spawn planner to create the execution plan.**

```
Use the Task tool with:
- subagent_type: "Plan"
- model: "planner"
- prompt: |
    ## Create Execution Plan for Commander Tasks

    **Tasks to Execute:**
    [INSERT TASK LIST]

    **Analysis Results:**

    ### Dependency Analysis:
    [INSERT DEPENDENCY AGENT RESULTS]

    ### File Scope Analysis:
    [INSERT SCOPE AGENT RESULTS]

    ### Work Type Classification:
    [INSERT CLASSIFIER AGENT RESULTS]

    ---

    **Your Mission:** Create a comprehensive execution plan with waves, agent assignments, and guards.

    **Planning Tasks:**

    1. **Validate Waves**
       - Verify dependency ordering is correct
       - Ensure no circular dependencies
       - Group parallel tasks within each wave

    2. **Assign Execution Strategy**
       - All tasks execute with builder agents
       - Escalation protocol available (scout → builder → reviewer)
       - Consider task complexity for escalation likelihood

    3. **Configure Guards**
       - Set file scope guards for each task
       - Define commit checkpoint after each wave
       - Establish scope violation rules

    4. **Estimate Execution**
       - Order tasks by priority within waves
       - Identify potential bottlenecks
       - Note tasks that may need human review

    **Return Format (JSON):**
    ```json
    {
      "execution_plan": {
        "total_tasks": 10,
        "total_waves": 3,
        "waves": [
          {
            "wave_number": 1,
            "tasks": [
              {
                "task_id": 123,
                "description": "...",
                "work_type": "backend",
                "execution_agent": "builder",
                "priority": 1,
                "file_scope": {
                  "allowed": ["src/models/user.ts"],
                  "forbidden": ["frontend/*"]
                },
                "dependencies": []
              }
            ],
            "parallel_groups": [
              {"group": "backend", "task_ids": [123, 124]},
              {"group": "testing", "task_ids": [125]}
            ]
          }
        ],
        "commit_checkpoints": ["after_wave_1", "after_wave_2", "after_wave_3"],
        "guard_rules": {
          "scope_violation": "block_task",
          "dependency_violation": "block_wave"
        }
      },
      "execution_strategy": {
        "primary_agent": "builder",
        "escalation_available": true,
        "task_distribution": {
          "builder": [123, 124, 125, 126, 127, 128]
        }
      },
      "risks": ["...", "..."],
      "recommendations": ["...", "..."]
    }
    ```
```

### Phase 2.5: Direct Execution Plan (Pre-Planned Tasks)

**USE THIS PHASE when all tasks are Pre-Planned from `/commander-plan`.**

**Skip Phase 1 and Phase 2 entirely - the context already exists!**

1. **Extract Execution Context from Tasks**

   For each Pre-Planned task, the task has:
   - `description`: Nicely formatted markdown (for UI display)
   - `task_prompt`: CodeRabbit-style technical prompt (for agent execution)
   - `context`: JSON with full analysis data

   The context JSON contains:
   ```json
   {
     "source": "commander-plan",
     "wave": 1,
     "dependency_order": 0,
     "work_type": "backend",
     "execution_agent": "builder",
     "escalation_protocol": "builder → reviewer (escalation)",
     "file_scope": {
       "allowed": ["src/models/user.ts"],
       "forbidden": ["frontend/*"]
     },
     "implementation_guide": "## Steps\n1. ...",
     "analysis_context": {
       "architecture": "...",
       "patterns": "...",
       "dependencies": ["..."]
     }
   }
   ```

2. **Build Execution Plan from Context**

   - Group tasks by `dependency_order` (0 = Wave 1, 1 = Wave 2, etc.)
   - Tasks with same `dependency_order` can run in parallel
   - All tasks execute with builder (escalation available)
   - Use `file_scope` from context for guards
   - **Use `task_prompt` (not `description`) when passing to agents**
   - Use `implementation_guide` from context for additional instructions

3. **Construct Execution Plan Object**

   ```json
   {
     "execution_plan": {
       "source": "pre-planned",
       "total_tasks": [count],
       "total_waves": [max dependency_order + 1],
       "waves": [
         {
           "wave_number": 1,
           "dependency_order": 0,
           "tasks": [/* tasks where dependency_order === 0 */],
           "parallel_groups": [/* group by work_type */]
         }
       ],
       "planning_skipped": true,
       "reason": "Tasks created by /commander-plan with full context"
     }
   }
   ```

4. **Proceed directly to Phase 3** (Present Execution Plan)

---

### Phase 3: Present Execution Plan (Main Agent)

**Display the execution plan to the user.**

**For Pre-Planned Tasks (Phase 2.5), show simplified header:**

```
## Execution Plan (Pre-Planned)

⚡ **Planning Skipped** - Tasks from `/commander-plan` with full context

### Summary
- Total tasks: X
- Waves: Y (from dependency_order)
- Source: commander-plan
- Execution: builder (with escalation available)

---
```

**For Ad-Hoc/Mixed Tasks (Phase 1+2), show standard header:**

```
## Execution Plan

### Summary
- Total tasks: X
- Waves: Y
- Execution: builder (with escalation: reviewer → planner)

---

### Wave 1 (Foundation - Independent)

**Backend Group (parallel)**
- [123] Implement user model → builder
      Scope: src/models/user.ts, src/types/user.ts
- [124] Create database schema → builder
      Scope: db/migrations/*, db/schema.ts

**Testing Group (parallel)**
- [125] Add unit tests for auth → builder
      Scope: tests/auth.test.ts

---

### Wave 2 (Implementation - depends on Wave 1)

**Frontend Group (parallel)**
- [126] Create login form → builder
      Scope: frontend/pages/login.tsx
- [127] Add password reset UI → builder
      Scope: frontend/components/PasswordReset.tsx

---

### Execution Guards
- File scope validation: ENABLED (BLOCKING)
- Commit checkpoints: After each wave
- Scope violations will BLOCK task completion

---

### Risks
1. [risk 1]
2. [risk 2]
```

### Phase 4: Approval Gate

**Use AskUserQuestion tool to present options:**

```
AskUserQuestion({
  questions: [{
    question: "Ready to execute X tasks across Y waves. How would you like to proceed?",
    header: "Execute Tasks",
    options: [
      { label: "Execute All", description: "Begin orchestrated execution of all waves" },
      { label: "Wave 1 Only", description: "Start with foundation tasks first" },
      { label: "Modify Plan", description: "Adjust dependencies or execution guards" },
      { label: "Cancel", description: "Don't execute, keep tasks pending" }
    ],
    multiSelect: false
  }]
})
```

Wait for user response before proceeding to Phase 5.

### Phase 5: Continuous Claim-Loop Execution (On Approval)

**Execute tasks using a continuous claim-loop pattern. Each agent claims ONE task at a time, works on it, then claims the next. This supports multi-agent environments where multiple Claude instances may run in parallel.**

**Key Principles:**
1. **Atomic claiming**: Use `cmd task update <id> --status in-progress` as the claim step, which prevents duplicate execution
2. **Wave boundaries**: Complete Wave N before starting Wave N+1
3. **No pre-assignment**: Tasks are NOT pre-assigned - agents claim from the available pool
4. **Self-termination**: Loop ends when no tasks remain and all waves complete
5. **Multi-agent aware**: Assume other agents may be working in parallel

---

#### 5.1 Claim-Loop Algorithm

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLAIM-LOOP EXECUTION FLOW                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 1. Get Group Progress         │
              │    (current wave status)       │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ 2. Find Available Task        │
              │    in Current Wave            │
              │    (status=pending|working,   │
              │     dependency_order=N)       │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼ Found                        ▼ Not Found
     ┌────────────────┐           ┌────────────────────────┐
     │ 3. Claim Task  │           │ 4. Check Wave Complete │
     │    Atomically  │           │    All tasks completed?│
     └───────┬────────┘           └───────────┬────────────┘
             │                                │
     ┌───────┴───────┐            ┌───────────┴───────────┐
     │               │            │                       │
     ▼ Success      ▼ Failed     ▼ Yes                  ▼ No
┌──────────┐  ┌──────────┐   ┌──────────┐         ┌──────────┐
│ 5. Work  │  │ Retry    │   │ 6. Next  │         │ 7. Wait  │
│ on Task  │  │ another  │   │ Wave?    │         │ for tasks│
└────┬─────┘  └────┬─────┘   └────┬─────┘         └────┬─────┘
     │             │              │                    │
     │             │              │                    │
     ▼             │         ┌────┴────┐               │
┌──────────┐       │         │         │               │
│ Complete │       │         ▼ Yes    ▼ No            │
│ or Fail  │       │   ┌───────┐   ┌────────┐         │
└────┬─────┘       │   │Start  │   │ 8. ALL │         │
     │             │   │Wave   │   │ DONE   │         │
     │             │   │N+1    │   │ EXIT   │         │
     └─────────────┴───┴───────┴───┴────────┴─────────┘
                              │
                    (loop back to step 2)
```

**Critical: This loop runs continuously until all waves are complete.**

---

#### 5.2 Wave Completion Checking

**Before claiming from a new wave, verify the previous wave is 100% complete.**

```
FUNCTION: canStartWave(initiativeRootId, waveNumber)

1. Get initiative root progress:
   cmd task show [INITIATIVE_ROOT_ID] --json

2. Check wave_status from response:
   - Find wave N-1 in wave_status array
   - If wave N-1 exists:
     - Return TRUE if is_complete === true
     - Return FALSE otherwise
   - If wave N-1 does not exist (waveNumber === 0):
     - Return TRUE (Wave 1 can always start)
```

**Wave Transition Logic:**

```
IF current_wave tasks exhausted (none pending):
  1. Check if current_wave is complete:
     - All tasks in current wave have status 'done' (or 'completed' alias) or 'todo' (blocked)

  2. IF complete AND more waves exist:
     - Log: "Wave {N} complete. Starting Wave {N+1}"
     - Update group: completed_waves = N
     - Trigger commit checkpoint
     - Move to next wave (increment current_wave)

  3. IF NOT complete:
     - Some tasks still in progress ('working'/'in-progress') by other agents
     - Wait 30 seconds, re-check

  4. IF no more waves:
     - Mark group complete
     - EXIT loop
```

---

#### 5.3 Main Claim-Loop Implementation

**Each executing agent runs this loop continuously:**

```
INITIALIZE:
  current_wave = 0
  initiative_root_id = [INITIATIVE_ROOT_ID]
  working_directory = [CURRENT_WORKING_DIRECTORY]
  max_consecutive_failures = 5
  consecutive_failures = 0

MAIN_LOOP:
  WHILE TRUE:

    // Step 1: Find available task in current wave
    available_task = findAvailableTask(initiative_root_id, current_wave, working_directory)

    IF available_task is NULL:
      // No tasks available in current wave

      // Check if wave is complete
      wave_complete = isWaveComplete(initiative_root_id, current_wave)

      IF wave_complete:
        // Commit checkpoint for this wave
        commitWaveCheckpoint(current_wave)

        // Update initiative root progress
        # Update parent task progress metadata (implementation-specific)
        cmd task update $initiative_root_id --description "Completed waves: $((current_wave + 1))"

        // Check if more waves exist
        IF hasMoreWaves(initiative_root_id, current_wave):
          current_wave = current_wave + 1
          Log: "Moving to Wave {current_wave + 1}"
          consecutive_failures = 0
          CONTINUE  // Try to find task in next wave
        ELSE:
          // All waves complete
          cmd task update $initiative_root_id --status done
          Log: "All waves complete. Exiting."
          BREAK  // Exit main loop
      ELSE:
        // Wave not complete - other agents still working
        Log: "Waiting for Wave {current_wave + 1} tasks to complete..."
        WAIT 30 seconds
        CONTINUE

    // Step 2: Attempt to claim the task
    if cmd task update "$available_task.id" --status in-progress; then
      // Claim succeeded, move to execution
    else
      // Claim failed (race condition - another agent claimed it)
      consecutive_failures = consecutive_failures + 1
      Log: "[INFO] Task {available_task.id} already claimed by another agent"
      IF consecutive_failures >= max_consecutive_failures:
        Log: "Multiple claim failures - refreshing task list..."
        consecutive_failures = 0
        WAIT 5 seconds
      CONTINUE  // Try to find another task
    fi
      consecutive_failures = 0

      // Step 3: Execute the task (see 5.5 for full protocol)
      executeTask($available_task)  # Work using claimed task context

      // Loop continues to claim next task
      CONTINUE
    ELSE:
      // Claim failed (race condition - another agent claimed it)
      consecutive_failures = consecutive_failures + 1
      Log: "[INFO] Task {available_task.id} already claimed by another agent"

      IF consecutive_failures >= max_consecutive_failures:
        Log: "Multiple claim failures - refreshing task list..."
        consecutive_failures = 0
        WAIT 5 seconds

      CONTINUE  // Try to find another task
```

---

#### 5.4 Helper Functions

**findAvailableTask(initiativeRootId, waveNumber, workingDirectory):**

```
1. List tasks in initiative root:
   cmd task list --parent $initiativeRootId --json

2. Filter tasks where:
   - dependency_order === waveNumber
   - status === 'pending'
   - workingDirectory matches (if task has working_directory set)

3. Sort by priority (lower number = higher priority), then createdAt (older first)

4. Return first matching task, or NULL if none found
```

**isWaveComplete(initiativeRootId, waveNumber):**

```
1. Get root progress:
   progress = $(cmd task show $initiativeRootId --json)

2. Find wave in wave_status:
   wave_info = progress.wave_status.find(w => w.wave === waveNumber)

3. IF wave_info exists:
   RETURN wave_info.is_complete

4. ELSE:
   // Calculate manually
   tasks = getAllTasksInWave(initiativeRootId, waveNumber)
   RETURN tasks.every(t => t.status === 'done' || t.status === 'completed' || t.status === 'todo')
```

**hasMoreWaves(initiativeRootId, currentWave):**

```
progress = cmd task show $initiativeRootId --json

RETURN currentWave + 1 < progress.total_waves
```

---

#### 5.5 Task Agent Execution Instructions

**When spawning a Task agent for the claim-loop, use this prompt:**

```
Use the Task tool with:
- subagent_type: "Code"
- model: "mercury-2"
- prompt: |
    ## CRITICAL: Commander CLI-backed Protocol - Claim-Loop Execution

    You are a **builder agent** executing tasks in a **claim-loop pattern**.

    ### Your Execution Loop

    You will:
    1. **Claim ONE task** from the available pool
    2. **Work on that task** following all protocols
    3. **Complete or fail the task**
    4. **Loop back** to claim the next task
    5. **Continue** until no more tasks available in the current wave

    ### Working Directory
    Your working directory: [WORKING_DIRECTORY]
    ONLY claim tasks that match this directory.

    ### Group Context
    Initiative Root ID: [INITIATIVE_ROOT_ID]
    Current Wave: [CURRENT_WAVE]
    Total Waves: [TOTAL_WAVES]

    ---

    ### You Are Part of a Team

    You work independently, but other builder agents may be active in this project — possibly in the same claim-loop, possibly from a different terminal.

    **Before your first claim, take a quick glance** — check your inbox for context:
    ```
    cmd mailbox inbox
    ```
    If there are messages with discoveries or context from other agents, use them.

    **While you work, you have tools available if you need them:**
    - **Share a discovery** (a pattern, a gotcha, a file location that would help other builders):
      `cmd mailbox send @all "Found: [discovery]"`
    - **Ask for help** (stuck after 2+ real attempts — don't spin):
      `cmd mailbox send commander "Stuck on: [problem]"`
    - **Request a helper** (need specialist work done while you continue):
      `cmd mailbox send commander "Need help with: [task]"`

    None of these are required. Use them when they would actually help.

    ---

    ### Claim Protocol

    **To find and claim a task:**

    1. List available tasks:
       cmd task list --parent [GROUP_ID] --json

    2. Filter tasks by:
       - dependency_order === [CURRENT_WAVE]
       - status == 'pending' (or in-progress if resuming)
       - working_directory matches yours

    3. Claim the task:
       cmd task update [TASK_ID] --status in-progress

    4. IF claim succeeds: Work on the task
       IF claim fails: Try another task (race condition is NORMAL)

    ---

    ### Task Execution Protocol

    **After successful claim:**

    **1. ADD START COMMENT:**
    cmd task comment [TASK_ID] "STARTED: [approach]. Scope: [files]. Escalations remaining: 2"

    **2. WORK WITH CONSTANT COMMENTS (MANDATORY - EVERY STEP):**

    You MUST add a comment BEFORE and AFTER every operation. This is not optional.

    | Operation | Before Comment | After Comment |
    |-----------|----------------|---------------|
    | Reading file | `ANALYZING: [file] - [goal]` | `FOUND: [discovery]` |
    | Making edit | `PLANNING: [file:lines] - [change]` | `MODIFIED: [file:lines] - [summary]` |
    | Running test | `TESTING: [test] - [expected]` | `RESULT: [pass/fail] - [details]` |
    | Decision | `DECISION: [choice] because [reason]` | - |

    **Use `cmd task comment` for EVERY comment:**
    ```
    cmd task comment [TASK_ID] "[PREFIX]: [details]"
    ```

    **Do NOT batch comments. Comment in real-time as you work.**
    **This creates the audit trail for debugging and handoffs.**

    **3. ON COMPLETION:**
    cmd task comment [TASK_ID] "COMPLETING: [summary]. Files: [list]. Escalations used: [0/1/2]"
    cmd task update [TASK_ID] --status done

    **4. ON FAILURE:**
    cmd task comment [TASK_ID] "FAILED: [reason]. Attempted: [approaches]. Blocker: [what stopped progress]"
    cmd task update [TASK_ID] --status todo

    **5. AFTER TASK COMPLETE - LOOP BACK:**

    After completing or failing a task, IMMEDIATELY loop back to claim the next one:

    ```
    // Task just completed
    cmd task comment [COMPLETED_TASK_ID] "Task complete. Checking for next available task..."

    // Find and claim next task in current wave
    available_tasks=$(cmd task list --parent [INITIATIVE_ROOT_ID] --json)
    next_task=$(echo "$available_tasks" | jq -r --argjson current_wave "$current_wave" '.[] | select(.dependency_order == $current_wave and .status == "pending") | .id' | head -n 1)

    IF [ -n "$next_task" ]; then
      cmd task update "$next_task" --status in-progress
      // Continue to claim protocol
    ELSE
      Log: "No immediate pending task in current wave."
    FI
    ```

    ---

    ### Multi-Agent Awareness

    **You are NOT alone.** Other agents may be working in parallel:

    - **Expect claim failures** - Another agent got it first. This is NORMAL.
    - **Do NOT re-claim** tasks you see as 'working'/'in-progress' - they belong to other agents
    - **Trust the atomic claim** mechanism - no coordination needed
    - **Race conditions are healthy** - they mean the system is working

    **When claim fails:**
    ```
    cmd task comment [TASK_ID] "CLAIM_FAILED: Task [ID] already claimed. Trying next available."
    // Immediately try the next task - don't wait
    ```

    ---

    ### Escalation Protocol (Maximum 1 escalation per task)

    **You are `builder`. If you encounter blockers:**

    1. **Escalation (builder → reviewer):**
       - If stuck after reasonable attempts, escalate to `reviewer`
       - Use Task tool with `model: "reviewer"` and include:
         - What you've tried
         - The specific blocker
         - Current state of the code
       - Add comment: `ESCALATION: Escalating to reviewer - [reason]`

    2. **Escalation Limits:**
       - Maximum 1 escalation per task (builder → reviewer)
       - After reviewer, no further escalation available — task fails if reviewer can't resolve

    **Escalation Criteria:**
    - Complex architectural decisions beyond your capability
    - Persistent errors you cannot resolve
    - Need for deep codebase understanding you lack

    ---

    ### Loop Termination

    **Stop claiming when:**
    - No pending tasks in current wave AND wave is complete
    - Main agent will handle wave transition and commit checkpoint
    - When all waves complete, main agent will signal completion

    **Do NOT exit prematurely:**
    - If no tasks available but wave incomplete, WAIT and retry
    - Other agents may be completing tasks that unblock you
```

**Escalation Agent Instructions (for reference):**

When `reviewer` receives an escalated task, it follows the same protocol above with `agent_name="reviewer"` and continues the claim-loop after completion.

---

#### 5.6 Race Condition Handling

**Expected behavior:** In multi-agent environments, claim failures are NORMAL.

**When claim fails:**
1. Log the failure (not an error, just info)
2. Immediately try the next available task
3. Do NOT retry the same task (another agent has it)
4. Track consecutive failures to detect issues

**Consecutive failure handling:**
```
IF consecutive_failures >= 5:
  Log: "Multiple claim failures - refreshing task list..."
  WAIT 5 seconds
  Reset consecutive_failures = 0
  CONTINUE

IF consecutive_failures >= 10:
  Log: "[WARN] Many consecutive failures - checking group status"
  Check if wave is complete
  IF complete: Move to next wave
  ELSE: Wait for other agents to finish
```

---

### Phase 6: Commit Checkpoint (After Each Wave)

1. **Check for Changes**
   ```bash
   git status --porcelain
   ```

2. **Validate File Scope Compliance**
   For each completed task:
   - Read declared scope from plan
   - Check actual files modified with `git diff`
   - Flag violations

3. **Create Wave Commit (if no violations)**
   ```bash
   git add .
   git commit -m "[commander-execute] Wave N complete

   Completed tasks:
   - Task [ID]: [Title] (Work type: [TYPE])

   Wave N summary:
   - Total: [COUNT] tasks
   - All scope validations passed"
   ```

4. **Block on Violations**
   If scope violation detected:
   - Report violation to user
   - Do NOT commit
   - Ask for resolution before proceeding

5. **Update Group Progress (after wave completes)**
   After ALL tasks in a wave complete successfully:
   ```
   // Read root/task metadata and optionally store progress notes
   cmd task show [GROUP_ID] --json

   // Optionally annotate root task to reflect wave checkpoint
   cmd task update [GROUP_ID] --description "Wave completed: $((CURRENT_COMPLETED + 1))"
   ```

   When ALL waves complete (completed_waves === total_waves):
   ```
   cmd task update [GROUP_ID] --status done
   ```

   **Track Initiative Start:**
   When first task starts (first wave begins), mark initiative active:
   ```
   cmd task update [GROUP_ID] --status in-progress
   ```

### Phase 7: Progress Display

```
## Execution Status (Live - Claim-Loop Mode)

Last updated: [timestamp]
Mode: Continuous Claim-Loop (Multi-Agent Aware)

### Initiative Progress
[initiative_summary from group]
████████████░░░░░░░░ 67% (Wave 2 of 3)

### Wave 2 Status
- Total tasks: 6
- Completed: 3 ✅
- Working: 2 🔵 (claimed by agents)
- Pending: 1 ⏳ (available for claiming)

### Active Agents
🔵 Agent executing claim-loop in Wave 2
   - Last claimed: Task 124 (2 min ago)
   - Tasks completed this session: 3

### Recent Activity
[124] builder: "CLAIMED: Starting implementation"
[125] builder: "COMPLETED: Added validation logic"
[123] builder: "CLAIM_FAILED: Task already claimed, trying next"

### Completed Tasks
✅ Task 120: Setup structure (Wave 1)
✅ Task 121: Configure database (Wave 1)
✅ Task 125: Add validation (Wave 2)

### Wave Summary
- Wave 1: ✅ Complete (4/4) - Committed: abc1234
- Wave 2: 🔵 In Progress (3/6)
- Wave 3: ⏳ Blocked (waiting for Wave 2)
```

### Phase 8: Completion Report

```
## Execution Complete

### Summary
- Total: 10 tasks
- Successful: 9 ✅
- Failed: 1 ⚠️ (scope violation)

### Wave Breakdown
| Wave | Tasks | Success | Work Types |
|------|-------|---------|------------|
| 1 | 4 | 4/4 ✅ | Backend, Testing |
| 2 | 3 | 3/3 ✅ | Frontend, Docs |
| 3 | 3 | 2/3 ⚠️ | Refactoring |

### Scope Validation
✅ Wave 1: All within scope
✅ Wave 2: All within scope
⚠️ Wave 3: Task 127 modified unauthorized file

### Commits Created
- Wave 1: `abc1234` - Wave 1 complete (4 tasks)
- Wave 2: `def5678` - Wave 2 complete (3 tasks)
- Wave 3: Not committed (violation)

### Failed Tasks
- **Task 127**: SCOPE VIOLATION
  - Modified: src/utils/logging.ts (NOT in scope)
  - Recommendation: Expand scope or revert

### Next Steps
1. Investigate Task 127 scope violation
2. Run full test suite
3. Review agent insights
```

---

## Agent Roles Summary

| Agent | Name | Role | When Used |
|-------|------|------|-----------|
| Main Agent | `pi` | Orchestrator, fetch & classify tasks | Always |
| Dependency Analyzer | `scout` | Parse dependencies, build waves | **Ad-Hoc tasks only** |
| File Scope Analyzer | `scout` | Determine file guards | **Ad-Hoc tasks only** |
| Work Type Classifier | `scout` | Classify tasks by work type | **Ad-Hoc tasks only** |
| Execution Planner | `planner` | Synthesize into execution plan | **Ad-Hoc tasks only** |
| Execution Agent (Primary) | `builder` | Execute individual tasks | All tasks |
| Escalation Agent | `reviewer` | Assist when builder is stuck | On escalation |

### Escalation Protocol

```
builder (Primary)
    ↓ (if stuck)
reviewer (Escalation — final level)
```

**Rules:**
- Maximum 1 escalation per task (builder → reviewer)
- Only builder can escalate to reviewer
- Each escalation must document attempts and blockers
- Escalations tracked in task comments

### Planning Skip Logic

```
Pre-Planned Tasks (from /commander-plan):
  → Phase 0 (fetch) → Phase 2.5 (extract context) → Phase 3+ (execute)
  → Saves 4 agent invocations per execution

Ad-Hoc Tasks:
  → Phase 0 (fetch) → Phase 1 (analyze) → Phase 2 (plan) → Phase 3+ (execute)
  → Full analysis needed

Mixed Tasks:
  → Phase 0 (fetch) → Phase 1 (analyze Ad-Hoc only) → Phase 2 (merge) → Phase 3+ (execute)
  → Partial analysis, merge with Pre-Planned context
```

---

## Commander CLI Reference

| Tool | Purpose |
|------|---------|
| `cmd task add` | Create root tasks and children |
| `cmd task list` | List tasks (pending/in-progress/done) |
| `cmd task show` | Inspect task + context |
| `cmd task update` | Update status (`in-progress`, `done`, `todo`) |
| `cmd task comment` | Add progress comments |
| `cmd mailbox` | Cross-agent status sharing |

---

## Usage Examples

```bash
# Execute all pending tasks
/commander-execute

# Execute specific tasks
/commander-execute 123, 124, 125


# Resume in-progress tasks
/commander-execute working  # or /commander-execute in-progress

# Execute all pending
/commander-execute pending
```
