---
description: "Plan and execute a single task with full Commander CLI-backed tracking - uses planning agents for context, then implements directly"
argument-hint: "[task description - what to implement, fix, or build]"
allowed-tools: ["Task", "Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebFetch", "WebSearch", "AskUserQuestion"]
---

# Commander Task - Planning + Execution with Full Tracking

**⚠️ COMMANDER CLI RULE: NO AD-HOC TASKS — create one root task, then child tasks with `cmd task add --parent`, and execute only through CLI claim/update/comment flows.**

This command combines **planning agent architecture** with **direct execution** for single-task workflows. Unlike `/commander-plan` (multi-task planning) or `/commander-execute` (batch execution), this command:

1. Uses scout agents to gather context in parallel
2. Uses planner agent to create an implementation plan
3. Creates the task **in a Commander task group** for tracking
4. **Executes the task directly with full observability**

## Planning + Execution Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN AGENT                                  │
│                    (Orchestrator Only)                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Phase 1: Parse   │
                    │   Task Request     │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ SCOUT AGENT 1 │   │ SCOUT AGENT 2 │   │ SCOUT AGENT 3 │
│  Codebase     │   │   Related     │   │   Patterns    │
│  Structure    │   │   Files       │   │   & Context   │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────────────┬─┴───────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │    PLANNER AGENT       │
              │  (Planning Agent)   │
              │   Create Detailed   │
              │   Implementation    │
              │   Plan              │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │    MAIN AGENT       │
              │  Create Task in     │
              │  Commander & EXECUTE│
              │  with Full Tracking │
              └─────────────────────┘
```

**Key Principle: The main agent does NO context gathering - delegates to subagents, then executes the plan.**

---

## When to Use

Use `/commander-task` for:
- **Single tasks** that benefit from codebase context
- Bug fixes where you need to understand surrounding code
- Feature additions that should follow existing patterns
- Any work that needs planning before implementation
- Tasks where you want **full observability** via Commander dashboard

Use `/commander-plan` instead if:
- Task decomposes into **multiple subtasks**
- You want tasks created but NOT executed immediately
- Feature requires parallel agent execution

Use the simpler direct approach if:
- Task is trivial (e.g., "fix typo in README")
- No context gathering needed
- You don't need Commander tracking

---

## Input

Task description: **$ARGUMENTS**

Examples:
- `Fix the null pointer exception in UserService.findById`
- `Add email validation to the signup form`
- `Implement the logout endpoint following existing auth patterns`
- `Refactor the payment processing to use the new billing service`

---

## Workflow

### Phase 1: Parse Task Request (Main Agent)

**The main agent ONLY parses the request - it does NOT gather context.**

1. **Extract Task Intent**
   - Parse the goal from $ARGUMENTS
   - Identify keywords suggesting scope (files, features, areas)
   - Note any mentioned files or patterns

2. **Determine Context Needs**
   Based on the task description, identify what context is needed:
   - **Structure** - Always needed (where are relevant files?)
   - **Related Files** - Files mentioned or implied in the task
   - **Patterns** - Existing patterns to follow

3. **Spawn scout Agents in Parallel**
   Launch 2-3 scout subagents for focused context gathering.

### Phase 2: Parallel Context Gathering (scout Subagents)

**Spawn multiple scout agents IN PARALLEL using the Task tool.**

**CRITICAL: Launch ALL scout agents in a SINGLE message with multiple Task tool calls.**

#### Agent 1: Codebase Structure Explorer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Codebase Structure for Task: [TASK_DESCRIPTION]

    **Your Mission:** Find the relevant parts of the codebase for this task.

    **Exploration Tasks:**
    1. Find files related to the task (by name, location, imports)
    2. Identify the main entry point or module
    3. Map the directory structure of relevant areas
    4. Find configuration files that may be relevant

    **Search Strategy:**
    - Glob for relevant file patterns
    - Grep for keywords from the task description
    - Read key files to understand structure

    **Return Format (JSON):**
    ```json
    {
      "relevant_files": [
        {"path": "...", "purpose": "...", "relevance": "high|medium|low"}
      ],
      "directory_structure": {
        "src/": ["models/", "services/", "utils/"]
      },
      "entry_points": ["...", "..."],
      "config_files": ["...", "..."],
      "key_insights": ["...", "..."]
    }
    ```
```

#### Agent 2: Related Files Analyzer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Related Files for Task: [TASK_DESCRIPTION]

    **Your Mission:** Find and analyze files directly related to this task.

    **Exploration Tasks:**
    1. Find the specific file(s) that need modification
    2. Read the file content to understand current implementation
    3. Identify imports and dependencies
    4. Find tests for these files
    5. Look for similar implementations to reference

    **Search Strategy:**
    - Direct file reads for mentioned files
    - Grep for related function/class names
    - Find test files

    **Return Format (JSON):**
    ```json
    {
      "files_to_modify": [
        {
          "path": "...",
          "current_content_summary": "...",
          "lines_of_interest": "45-60",
          "imports": ["...", "..."],
          "exports": ["...", "..."]
        }
      ],
      "test_files": ["...", "..."],
      "similar_implementations": [
        {"file": "...", "what": "...", "how_similar": "..."}
      ],
      "dependencies": ["...", "..."]
    }
    ```
```

#### Agent 3: Patterns & Context Analyzer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Patterns & Context for Task: [TASK_DESCRIPTION]

    **Your Mission:** Understand the patterns and conventions used in this codebase.

    **Exploration Tasks:**
    1. Identify coding patterns in related files
    2. Find naming conventions
    3. Look for error handling patterns
    4. Check for existing utilities that could be reused
    5. Find documentation or comments about conventions

    **Search Strategy:**
    - Read multiple related files to see patterns
    - Grep for common patterns (try/catch, async/await, etc.)
    - Look for utility functions

    **Return Format (JSON):**
    ```json
    {
      "patterns": [
        {
          "name": "Error handling",
          "example_file": "...",
          "example_lines": "45-60",
          "description": "..."
        }
      ],
      "naming_conventions": {
        "functions": "camelCase",
        "files": "kebab-case",
        "classes": "PascalCase"
      },
      "reusable_utilities": [
        {"name": "...", "file": "...", "purpose": "..."}
      ],
      "conventions_to_follow": ["...", "..."]
    }
    ```
```

### Phase 3: Implementation Planning (planner Subagent)

**After ALL scout agents return, spawn planner to create the implementation plan.**

```
Use the Task tool with:
- subagent_type: "Plan"
- model: "planner"
- prompt: |
    ## Create Implementation Plan for Task: [TASK_DESCRIPTION]

    **Context from Analysis:**

    ### Codebase Structure:
    [INSERT STRUCTURE AGENT RESULTS]

    ### Related Files:
    [INSERT FILES AGENT RESULTS]

    ### Patterns & Context:
    [INSERT PATTERNS AGENT RESULTS]

    ---

    **Your Mission:** Create a detailed, step-by-step implementation plan.

    **Planning Requirements:**

    1. **Analyze the Task**
       - What exactly needs to be done?
       - What files need to be modified?
       - What patterns should be followed?

    2. **Create Step-by-Step Plan**
       For each step:
       - What file to modify
       - What specific changes to make
       - What patterns to follow
       - What to test

    3. **Identify Risks**
       - What could go wrong?
       - What edge cases exist?
       - What tests are needed?

    4. **Define Success Criteria**
       - How do we know when the task is complete?
       - What tests should pass?
       - What behavior should change?

    **Return Format (JSON):**
    ```json
    {
      "task_summary": "Brief description of what will be done",
      "files_to_modify": [
        {
          "file": "src/services/UserService.ts",
          "action": "modify",
          "changes": "Add null check in findById method",
          "lines": "45-52"
        }
      ],
      "implementation_steps": [
        {
          "step": 1,
          "description": "Add null check after database query",
          "file": "src/services/UserService.ts",
          "details": "After line 47, add: if (!user) throw new UserNotFoundError(id)",
          "pattern_reference": "See similar pattern in src/services/ProductService.ts:89"
        },
        {
          "step": 2,
          "description": "Add test for null case",
          "file": "src/services/UserService.test.ts",
          "details": "Add test case: 'should throw UserNotFoundError when user not found'",
          "pattern_reference": "Follow existing test patterns in file"
        }
      ],
      "tests_to_run": ["npm test -- UserService"],
      "success_criteria": [
        "findById throws UserNotFoundError for invalid ID",
        "All existing tests pass",
        "New test passes"
      ],
      "risks": [
        {
          "risk": "Breaking change for callers expecting null",
          "mitigation": "Check all callers handle the error"
        }
      ],
      "estimated_complexity": "low|medium|high"
    }
    ```
```

### Phase 4: Create Task & Present Plan (Main Agent)

**The main agent creates the task in Commander and presents the plan to the user.**

1. **Create a root task and child task in Commander CLI (MANDATORY for tracking).**

   **⚠️ CRITICAL: ALL work should start with a root task + child task, not standalone ad-hoc task creation.**

   ```bash
   ROOT_TASK_ID=$(cmd task add "[TASK_DESCRIPTION - short title]" --type feature --priority high --json | jq -r '.id')
   TASK_ID=$(cmd task add "Implementation: [task_summary from planner]" --parent "$ROOT_TASK_ID" --type task --priority high --json | jq -r '.id')
   ```

   Save the returned `ROOT_TASK_ID` and `TASK_ID` for tracking.

2. **Present Plan to User**

   ```
   ## Implementation Plan

   ### Summary
   [task_summary from planner]

   ### Files to Modify
   - `file1.ts` - [action]: [changes]
   - `file2.ts` - [action]: [changes]

   ### Steps
   1. [step 1 description]
      - File: [file]
      - Details: [details]
      - Pattern: [reference]

   2. [step 2 description]
      - File: [file]
      - Details: [details]

   ### Success Criteria
   - [ ] [criterion 1]
   - [ ] [criterion 2]

   ### Risks
   - [risk 1]: [mitigation]

   ---

   **Task created:** `[TASK_ID]` (child of root `ROOT_TASK_ID`)

   Ready to execute this plan?
   - **Yes** - Begin implementation with full tracking
   - **Modify** - Let me adjust the plan first
   - **Cancel** - Don't execute
   ```

### Phase 5: Execute with Full Tracking (Main Agent)

**On approval, the main agent executes the plan with constant Commander updates.**

#### 5.0 Awareness Check (Quick Glance)

You work independently, but other agents may be active in this project. Before starting execution, check your inbox for context:

```
cmd mailbox inbox
```

If there are messages with discoveries or context from other agents, use them — don't redo work that's already been done. If another agent is already working on this exact task, stop and report the conflict.

While you work, you have tools available if you need them:
- **Share a discovery**: `cmd mailbox send @all "Discovery: [discovery]"`
- **Ask for help** (stuck after 2+ attempts): `cmd mailbox send commander "Stuck: [problem]"`
- **Request a helper**: `cmd mailbox send commander "Need help with: [task]"`

None of these are required. Use them when they would actually help.

#### 5.1 Claim and Start

```
cmd task update [TASK_ID] --status in-progress
cmd task comment [TASK_ID] "STARTED: Beginning implementation. Plan: [brief summary]. First step: [step 1]"
```

#### 5.2 Execute Each Step with Comments

**For each step in the plan, follow this pattern:**

```
# Before starting step
cmd task comment [TASK_ID] "STEP [N]: Starting - [description]"

# During the step - comment on every action
cmd task comment [TASK_ID] "ANALYZING: [file] - [what you're looking for]"

# Do the actual work (Read, Edit, Write, etc.)
# ...

cmd task comment [TASK_ID] "MODIFIED: [file] lines [X-Y] - [what changed]"

# After completing step
cmd task comment [TASK_ID] "STEP [N]: Complete - [summary]"
```

#### 5.3 Comment Patterns

**Use these exact prefixes for consistent tracking:**

```
STEP [N]: Starting - [description]
ANALYZING: [file] - [what you're looking for]
FOUND: [discovery] - [relevance]
DECISION: [choice] because [reasoning]
PLANNING: [what you will do] - [why]
MODIFIED: [file] lines [X-Y] - [what changed]
STEP [N]: Complete - [summary]
TESTING: Running [test] - [expected outcome]
RESULT: [passed/failed] - [details]
ISSUE: [problem] - attempting [solution]
RESOLVED: [issue] by [solution]
BLOCKER: [issue]. Tried: [attempts]. Need: [help]
INSIGHT: [pattern or learning]
```

#### 5.4 Use Logs for Real-Time Dashboard

```
cmd task comment [TASK_ID] "[Concise progress update]"
```

### Phase 6: Complete or Fail

#### On Successful Completion

```
# Final verification comment
cmd task comment [TASK_ID] "COMPLETING: Final verification - [what you checked]"

# Complete the task
cmd task update [TASK_ID] --status done

# Final summary comment
cmd task comment [TASK_ID] "COMPLETED: [detailed summary]. Files: [list]. Tests: [status]. Changes: [brief]"
```

#### On Failure

```
cmd task comment [TASK_ID] "FAILING: [immediate reason]"
cmd task update [TASK_ID] --status todo  # failure: [Clear, actionable error description]
cmd task comment [TASK_ID] "FAILED: [root cause]. Attempted: [what tried]. Files touched: [partial changes]. Suggestion: [retry guidance]"
```

#### If Task Needs Review

```
cmd task update [TASK_ID] --status todo  // review requested
cmd task comment [TASK_ID] "NEEDS REVIEW: [what needs checking]. Work completed: [list]. Question: [specific question]. Recommendation: [suggestion]"
```

---

### Phase 6.5: Check for Related Tasks (Claim-Loop Continuation)

**After completing the primary task, check if there are pending tasks to continue with.**

This enables seamless multi-agent coordination where `/commander-task` can continue with related work.

```
// After primary task completion, check for more work
pending_tasks = cmd task list --status pending --json
all_available = pending_tasks
```

**If tasks found:**

```
AskUserQuestion({
  questions: [{
    question: "Primary task complete. Found X pending tasks in this directory. Continue executing?",
    header: "Continue?",
    options: [
      { label: "Continue", description: "Enter claim-loop mode and execute remaining tasks" },
      { label: "Done", description: "Stop here, leave tasks for later" }
    ],
    multiSelect: false
  }]
})
```

**If user chooses "Continue":**

Enter claim-loop mode (same pattern as `/commander-execute`):

```
CLAIM_LOOP:
  WHILE TRUE:
    // Find next available task
    task = findAvailableTask(current_wave)

    IF task is NULL:
      // Check if wave is complete
      IF isWaveComplete(current_wave):
        IF hasMoreWaves():
          current_wave++
          CONTINUE
        ELSE:
          Log: "All tasks complete."
          BREAK
      ELSE:
        // Other agents may be working
        WAIT 30 seconds
        CONTINUE

    // Claim atomically
    if [ -n "$task_id" ]; then
      // Claim succeeded (task remains marked in-progress)
      executeTask(task)  // Follow Phase 5 protocol
    else
      // Race condition - another agent claimed it
      Log: "Task claimed by another agent, trying next"
      CONTINUE
```

**Multi-Agent Awareness:**
- Expect claim failures - other agents may be working in parallel
- Do NOT re-claim tasks marked as 'working'
- Trust the atomic claim mechanism

---

## Completion Report

After execution, display:

```
## Task Complete

### Summary
Task #[ID]: [DESCRIPTION]
Status: ✅ Completed

### Implementation
- **Files modified:**
  - `file1.ts` (lines 45-52) - Added null check
  - `file1.test.ts` (lines 89-98) - Added test

- **Tests run:**
  - `npm test -- UserService` - ✅ 12/12 passed

### Success Criteria
- [x] findById throws UserNotFoundError for invalid ID
- [x] All existing tests pass
- [x] New test passes

### Comments Trail
1. STARTED: Beginning implementation...
2. STEP 1: Starting - Add null check...
3. MODIFIED: UserService.ts lines 45-52...
4. STEP 1: Complete - Null check added
5. STEP 2: Starting - Add test...
6. MODIFIED: UserService.test.ts lines 89-98...
7. TESTING: Running tests...
8. RESULT: 12/12 passed
9. COMPLETED: Fixed null pointer bug

### Next Steps
- Consider adding similar checks to other services
- Review error handling in downstream callers
```

---

## Agent Roles Summary

| Agent | Name | Role | When Used |
|-------|------|------|-----------|
| Main Agent | `pi` | Orchestrator + Executor | Always |
| Structure Explorer | `scout` | Find codebase structure | Always |
| Files Analyzer | `scout` | Analyze related files | Always |
| Patterns Analyzer | `scout` | Find patterns to follow | Always |
| Planning Agent | `planner` | Create implementation plan | Always |

---

## MANDATORY: Comment Protocol

**You MUST add comments throughout execution. This is NOT optional.**

### Minimum Comments Per Task

| Phase | Minimum |
|-------|---------|
| Start | 1: approach and first step |
| Per step | 2: starting + completed |
| Per file read | 1: what was learned |
| Per file modify | 1: what changed |
| Per test run | 1: results |
| Completion | 1: final summary |

**Typical task: 10-20 comments minimum**

### Why Comments Matter

- Comments appear on Commander dashboard in real-time
- Future agents can learn from your work
- Humans can audit what happened
- Knowledge is preserved for the project

---

## Commander CLI Reference

| Tool | Purpose |
|------|---------|
| `cmd task` | Create/list/update tasks |
| `cmd task update` | Claim/start/complete/reopen |
| `cmd task comment` | Add progress comments |
| `cmd mailbox` | Share cross-agent context/status updates |

---

## Usage Examples

```bash
# Bug fix with context
/commander-task Fix the null pointer exception in UserService.findById

# Feature with patterns
/commander-task Add email validation to signup form following existing validation patterns

# Refactoring
/commander-task Refactor payment processing to use the new billing service

# API endpoint
/commander-task Implement the logout endpoint following existing auth patterns

# Testing
/commander-task Add unit tests for PaymentService.processRefund
```

---

## Task Lifecycle

```
pending → in-progress → done
```

- **pending → in-progress → done** - Always follow this flow
- **Start from pending** - Tasks created by `/commander-plan` are listed in the root task tree
- **Move to pending before execution** - Approve tasks before they're worked on
- **Comment at every transition** - Comments are mandatory for knowledge capture

### Lifecycle for `/commander-task`

Since `/commander-task` creates AND executes a single task, the lifecycle is compressed:

1. **Create** → Task starts in `pending`
2. **Claim** → Move to `in-progress` when execution begins
3. **Complete/Fail** → Final state based on outcome (typically `done`, or `todo` for retry/review)

### State Transitions

| From | To | When | Required Action |
|------|-----|------|-----------------|
| (new) | pending | Task created | `cmd task add ...` |
| pending | in-progress | Agent starts work | `cmd task update <id> --status in-progress` |
| in-progress | done | Success | `cmd task update <id> --status done` |
| in-progress | todo | Blocked / needs review | `cmd task update <id> --status todo` |

---

## Comparison with Other Commands

| Command | Planning | Creates Tasks | Executes | Best For |
|---------|----------|---------------|----------|----------|
| `/commander-task` | ✅ scout+planner | ✅ Single | ✅ Direct | Single task with context |
| `/commander-plan` | ✅ scout+planner | ✅ Multiple | ❌ No | Multi-task planning |
| `/commander-execute` | ✅ Analysis | ❌ No | ✅ Batch | Running existing tasks |
