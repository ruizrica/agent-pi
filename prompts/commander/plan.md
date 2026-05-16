---
description: "Break down an active plan into CodeRabbit-style microtasks in Commander using deep codebase analysis, then coordinate parallel agent execution"
argument-hint: "[plan description or horizon plan ID]"
allowed-tools: ["Task", "Bash", "AskUserQuestion"]
---

# Commander Plan - Multi-Agent Task Orchestration

**⚠️ COMMANDER CLI RULE: NO AD-HOC TASKS — create a Commander root task, then add microtask children under it using `cmd task add` with `--parent`. Avoid standalone task creation.**

This command breaks down a plan into microtasks using a **planning agent architecture**, then writes task structure to Commander via the `cmd` CLI (`cmd task add`, `cmd dep add`, comments + status updates). It can also consume approved INVESTIGATE remediation artifacts, as long as those findings already define the intended fix scope clearly enough for execution breakdown.

## Commander CLI Mapping (for this workflow)

- Create root plan: `cmd task add "<plan>" --type feature --priority high`
- Add each microtask as a child: `cmd task add "<microtask>" --parent <root_id> --type task`
- Chain dependencies: `cmd dep add <blocked-task-id> <dependency-task-id>...` (optional)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN AGENT                                  │
│                    (Orchestrator Only)                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Phase 1: Parse   │
                    │   & Delegate       │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ SCOUT AGENT 1 │   │ SCOUT AGENT 2 │   │ SCOUT AGENT 3 │
│  Architecture │   │   Security    │   │   Quality     │
│   Analysis    │   │   Analysis    │   │   Analysis    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────────────┬─┴───────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │    PLANNER AGENT       │
              │  (Planning Agent)   │
              │   Synthesize &      │
              │   Create Plan       │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │    MAIN AGENT       │
              │  Present Plan to    │
              │  User for Approval  │
              └─────────────────────┘
```

**Key Principle: The main agent does NO context gathering itself.**

- **scout Subagents** - Fast, parallel context gathering (cheap, efficient)
- **planner Subagent** - Deep reasoning for plan synthesis (smart, thorough)
- **Main Agent** - Orchestration and user presentation only

---

## Input

Plan or feature to implement: **$ARGUMENTS**

---

## Workflow

### Phase 1: Parse & Delegate (Main Agent)

**The main agent ONLY parses input and delegates - it does NOT read files or gather context.**

1. **Extract Plan Intent**
   - If $ARGUMENTS references a Horizon plan, note the plan ID
   - If $ARGUMENTS is a description, parse the goal
   - Identify keywords that suggest scope (files, features, areas)

2. **Determine Analysis Dimensions**
   Based on the plan description, identify which analyses are needed:
   - **Architecture** - Always needed
   - **Security** - If auth, validation, data handling mentioned
   - **Quality** - If refactor, cleanup, improve mentioned
   - **Testing** - If test, coverage, spec mentioned
   - **Performance** - If optimize, speed, cache mentioned
   - **API** - If endpoint, route, API mentioned

3. **Spawn scout Agents in Parallel**
   Launch 3-5 scout subagents simultaneously for context gathering.

### Phase 2: Parallel Context Gathering (scout Subagents)

**Spawn multiple scout agents IN PARALLEL using the Task tool.**

Each agent receives a focused exploration task and returns structured findings.

**CRITICAL: Launch ALL scout agents in a SINGLE message with multiple Task tool calls.**

#### Agent 1: Architecture Explorer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Architecture Analysis for: [PLAN_DESCRIPTION]

    **You Are Part of a Team**
    You work independently, but other scout agents may be exploring in parallel.
    Quick glance — check your inbox for context from other agents:
    `cmd mailbox inbox`
    If relevant findings already exist, incorporate them rather than redoing the work.
    If you discover something broadly useful, share it:
    `cmd mailbox send @all "Found: [discovery]"`

    **Your Mission:** Explore the codebase architecture relevant to this feature.

    **Exploration Tasks:**
    1. Find the main entry points and module structure
    2. Identify relevant files that will need modification
    3. Map dependencies and imports between modules
    4. Document existing patterns (naming, structure, conventions)
    5. Find similar implementations to use as reference

    **Search Strategy:**
    - Glob for structure: `src/**/*.ts`, `lib/**/*.ts`
    - Grep for imports: `import.*from`, `require\(`
    - Read key files: entry points, configs, types

    **MANDATORY: Comment During Every Step**

    You MUST use Commander CLI-backed tools to log progress at EVERY step:

    ```
    cmd task comment 0 "[PREFIX]: [details]"
    ```

    **Required Prefixes (use for EACH operation):**
    - `ANALYZING:` Before reading any file
    - `FOUND:` After discovering relevant code
    - `DECISION:` When making analysis choices
    - `INSIGHT:` For patterns or learnings
    - `COMPLETE:` Summary at end of analysis

    **This is mandatory. Do not skip comments.**

    **Return Format (JSON):**
    ```json
    {
      "relevant_files": [
        {"path": "...", "purpose": "...", "lines_of_interest": "..."}
      ],
      "patterns_found": [
        {"pattern": "...", "example_file": "...", "description": "..."}
      ],
      "dependencies": [
        {"from": "...", "to": "...", "type": "..."}
      ],
      "reference_implementations": [
        {"file": "...", "relevance": "..."}
      ],
      "key_insights": ["...", "..."]
    }
    ```
```

#### Agent 2: Security Analyzer (if needed)

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Security Analysis for: [PLAN_DESCRIPTION]

    **Your Mission:** Identify security-relevant code and patterns.

    **Exploration Tasks:**
    1. Find authentication/authorization code
    2. Identify input validation patterns
    3. Look for data sanitization
    4. Find sensitive data handling
    5. Check for security vulnerabilities

    **Search Strategy:**
    - Glob: `**/*auth*`, `**/*valid*`, `**/*secur*`, `**/*sanitiz*`
    - Grep: `password`, `token`, `secret`, `api.?key`, `credential`
    - Read auth middleware, validation utilities

    **MANDATORY: Comment During Every Step**

    You MUST use Commander CLI-backed tools to log progress at EVERY step:

    ```
    cmd task comment 0 "[PREFIX]: [details]"
    ```

    **Required Prefixes (use for EACH operation):**
    - `ANALYZING:` Before reading any file
    - `FOUND:` After discovering security patterns
    - `DECISION:` When making analysis choices
    - `INSIGHT:` For security patterns or concerns
    - `COMPLETE:` Summary at end of analysis

    **This is mandatory. Do not skip comments.**

    **Return Format (JSON):**
    ```json
    {
      "auth_patterns": [
        {"file": "...", "mechanism": "...", "notes": "..."}
      ],
      "validation_patterns": [
        {"file": "...", "what": "...", "how": "..."}
      ],
      "security_concerns": [
        {"file": "...", "line": "...", "issue": "...", "severity": "..."}
      ],
      "recommendations": ["...", "..."]
    }
    ```
```

#### Agent 3: Quality Analyzer (if needed)

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Code Quality Analysis for: [PLAN_DESCRIPTION]

    **Your Mission:** Assess code quality and identify improvement opportunities.

    **Exploration Tasks:**
    1. Find code duplication
    2. Identify complex functions (>50 lines)
    3. Look for code smells
    4. Check for consistent patterns
    5. Find technical debt markers (TODO, FIXME, HACK)

    **Search Strategy:**
    - Grep: `TODO`, `FIXME`, `HACK`, `XXX`
    - Analyze function lengths
    - Look for duplicate patterns

    **MANDATORY: Comment During Every Step**

    You MUST use Commander CLI-backed tools to log progress at EVERY step:

    ```
    cmd task comment 0 "[PREFIX]: [details]"
    ```

    **Required Prefixes (use for EACH operation):**
    - `ANALYZING:` Before reading any file
    - `FOUND:` After discovering code smells or debt
    - `DECISION:` When making analysis choices
    - `INSIGHT:` For quality patterns or refactoring opportunities
    - `COMPLETE:` Summary at end of analysis

    **This is mandatory. Do not skip comments.**

    **Return Format (JSON):**
    ```json
    {
      "duplications": [
        {"files": ["...", "..."], "pattern": "...", "suggestion": "..."}
      ],
      "complex_functions": [
        {"file": "...", "function": "...", "lines": "...", "complexity": "..."}
      ],
      "tech_debt": [
        {"file": "...", "line": "...", "marker": "...", "context": "..."}
      ],
      "refactoring_opportunities": ["...", "..."]
    }
    ```
```

#### Agent 4: Test Coverage Analyzer (if needed)

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## Test Coverage Analysis for: [PLAN_DESCRIPTION]

    **Your Mission:** Map test coverage and identify gaps.

    **Exploration Tasks:**
    1. Find all test files
    2. Map tests to source files
    3. Identify untested functions
    4. Check test patterns and frameworks
    5. Find integration vs unit test split

    **Search Strategy:**
    - Glob: `**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/*`
    - Grep: `describe\(`, `it\(`, `test\(`
    - Read test configs: jest.config, vitest.config

    **MANDATORY: Comment During Every Step**

    You MUST use Commander CLI-backed tools to log progress at EVERY step:

    ```
    cmd task comment 0 "[PREFIX]: [details]"
    ```

    **Required Prefixes (use for EACH operation):**
    - `ANALYZING:` Before reading any file
    - `FOUND:` After discovering test coverage info
    - `DECISION:` When making analysis choices
    - `INSIGHT:` For test patterns or coverage gaps
    - `COMPLETE:` Summary at end of analysis

    **This is mandatory. Do not skip comments.**

    **Return Format (JSON):**
    ```json
    {
      "test_files": [
        {"path": "...", "tests_for": "...", "count": "..."}
      ],
      "coverage_gaps": [
        {"source_file": "...", "untested_functions": ["..."]}
      ],
      "test_patterns": {
        "framework": "...",
        "conventions": ["..."]
      },
      "recommendations": ["...", "..."]
    }
    ```
```

#### Agent 5: API/Integration Analyzer (if needed)

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "scout"
- prompt: |
    ## API/Integration Analysis for: [PLAN_DESCRIPTION]

    **Your Mission:** Map API structure and integration points.

    **Exploration Tasks:**
    1. Find all API routes/endpoints
    2. Identify request/response patterns
    3. Map external service integrations
    4. Document API conventions
    5. Find API documentation

    **Search Strategy:**
    - Glob: `**/routes/*`, `**/api/*`, `**/controllers/*`
    - Grep: `router\.`, `app\.(get|post|put|delete)`, `fetch\(`
    - Read API handlers and middleware

    **MANDATORY: Comment During Every Step**

    You MUST use Commander CLI-backed tools to log progress at EVERY step:

    ```
    cmd task comment 0 "[PREFIX]: [details]"
    ```

    **Required Prefixes (use for EACH operation):**
    - `ANALYZING:` Before reading any file
    - `FOUND:` After discovering API endpoints or integrations
    - `DECISION:` When making analysis choices
    - `INSIGHT:` For API patterns or integration points
    - `COMPLETE:` Summary at end of analysis

    **This is mandatory. Do not skip comments.**

    **Return Format (JSON):**
    ```json
    {
      "endpoints": [
        {"path": "...", "method": "...", "handler": "...", "file": "..."}
      ],
      "integrations": [
        {"service": "...", "usage": "...", "file": "..."}
      ],
      "api_patterns": {
        "auth": "...",
        "error_handling": "...",
        "response_format": "..."
      },
      "documentation": ["...", "..."]
    }
    ```
```

### Phase 3: Planning Agent (planner Subagent)

**After ALL scout agents return, spawn a single planner agent to synthesize findings into a plan.**

```
Use the Task tool with:
- subagent_type: "Plan"
- model: "planner"
- prompt: |
    ## Create Implementation Plan for: [PLAN_DESCRIPTION]

    **Context from Parallel Analysis:**

    ### Architecture Findings:
    [INSERT ARCHITECTURE AGENT RESULTS]

    ### Security Findings:
    [INSERT SECURITY AGENT RESULTS - if applicable]

    ### Quality Findings:
    [INSERT QUALITY AGENT RESULTS - if applicable]

    ### Test Coverage Findings:
    [INSERT TEST AGENT RESULTS - if applicable]

    ### API Findings:
    [INSERT API AGENT RESULTS - if applicable]

    ---

    **Your Mission:** Synthesize all findings into a comprehensive implementation plan.

    **Planning Tasks:**

    1. **Analyze Dependencies**
       - Which changes depend on others?
       - What must be done first (foundation)?
       - What can be parallelized?

    2. **Create CodeRabbit-Style Microtasks**
       For each task, use this format:

       ```
       In {file} around lines {start} to {end}, {problem} is {diagnosis};
       {solution} by {implementation_details} with {fallback} and {error_handling}.
       ```

       Include:
       - Specific file and line numbers
       - Clear problem statement
       - Actionable solution
       - Implementation details
       - Error handling considerations

    3. **Organize into Waves**
       - Wave 1: Foundation/independent tasks
       - Wave 2: Tasks depending on Wave 1
       - Wave 3: Final integration/testing

    4. **Assign Work Types**
       Classify each task:
       - backend, frontend, testing, documentation, devops, refactoring

    5. **Set Priorities**
       1-10 scale (1=highest) based on:
       - Wave number
       - Severity (security > bugs > features)
       - Blocking status

    6. **Synthesize Scout Findings into Context** ⚠️ CRITICAL

       For EACH microtask, you MUST populate the full context object by synthesizing the scout agent findings:

       **context.source**: Always "commander-plan"

       **context.original_prompt**: The user's original $ARGUMENTS (cleaned up and concise)

       **context.wave**: The wave number (1, 2, or 3)

       **context.work_type**: Classify the task (backend, frontend, testing, documentation, devops, refactoring)

       **context.file**: Primary file path this task modifies

       **context.lines**: Line range to modify (e.g., "45-52")

       **context.severity**: HIGH/MEDIUM/LOW based on impact and risk

       **context.assigned_agent**: "reviewer" for complex tasks, "builder" for simple ones

       **context.backup_agent**: Fallback agent if primary fails

       **context.file_scope**: ⚠️ CRITICAL: file_scope is REQUIRED for policy generation
       - **allowed**: Array of files/directories this task CAN modify (from Architecture Explorer analysis)
         - **MUST contain at least one file path** - empty arrays will result in fallback policy (less restrictive)
         - Extract from Architecture Explorer findings: files that need modification
         - Include related files: imports, dependencies, test files
       - **forbidden**: Array of files/directories this task must NOT touch (core files, unrelated modules)
       
       **⚠️ VALIDATION CHECKLIST** - Before creating tasks, verify:
       1. Each microtask has `context.file_scope`
       2. `context.file_scope.allowed` is a non-empty array
       3. At least one allowed path is a specific file or directory relevant to the task
       4. If validation fails, STOP and report error - DO NOT create tasks without proper file_scope

       **context.implementation_guide**: Your detailed step-by-step guide for this specific task

       **context.analysis_context** ← THIS IS WHERE YOU SYNTHESIZE ALL SCOUT FINDINGS:
       - **architecture**: Extract relevant architecture findings from Architecture Explorer
         - Relevant file paths and their purposes
         - Module structure and organization
         - Import/export patterns
         Example: "This task modifies the auth middleware which is called by all protected routes. Dependencies: jwt library, user model."

       - **patterns**: Extract coding patterns and conventions from Architecture Explorer and Quality Analyzer
         - Naming conventions
         - Code style patterns
         - Common idioms used in the codebase
         Example: "Use async/await with try-catch. Follow existing error handling pattern with AppError class."

       - **dependencies**: Extract related imports/modules from Architecture Explorer's dependency analysis
         Example: ["import jwt from 'jsonwebtoken'", "import { User } from './models/User'"]

       - **reference_implementations**: Extract similar code examples from Architecture Explorer
         Example: ["See authMiddleware.ts:120-150 for similar token validation", "Follow pattern in refreshToken.ts"]

       **IMPORTANT**: Do NOT leave these fields empty! Synthesize the relevant parts of the scout analysis into each microtask's context. Each task should have context tailored to its specific implementation needs.

    **MANDATORY: Comment During Every Step**

    You MUST use Commander CLI-backed tools to log progress at EVERY step:

    ```
    cmd task comment 0 "[PREFIX]: [details]"
    ```

    **Required Prefixes (use for EACH operation):**
    - `SYNTHESIZING:` When combining agent findings
    - `DECISION:` When making architectural or priority choices
    - `PLANNING:` When creating microtask structure
    - `INSIGHT:` For patterns in the analysis data
    - `COMPLETE:` Summary at end of planning

    **This is mandatory. Do not skip comments.**

    **Return Format (JSON):**

    **⚠️ CRITICAL: `initiative_summary` and `total_waves` are REQUIRED fields for the Initiative Progress UI!**

    ```json
    {
      "plan_summary": "Brief summary of the implementation plan",
      "initiative_summary": "REQUIRED - 1-2 sentence summary of what this initiative accomplishes and why it matters. This appears in the dashboard UI!",
      "total_tasks": 10,
      "total_waves": 3,  // REQUIRED - Number of waves (derived from max wave number)
      "microtasks": [
        {
          "id": 1,
          "description": "In {file} around lines {X} to {Y}, {problem}; {solution}",
          "file": "path/to/file.ts",
          "lines": "45-52",
          "wave": 1,
          "priority": 1,
          "work_type": "backend",
          "dependencies": [],
          "context": {
            "source": "commander-plan",
            "original_prompt": "[user's original request, cleaned up]",
            "wave": 1,
            "work_type": "backend",
            "file": "path/to/file.ts",
            "lines": "45-52",
            "severity": "HIGH",
            "assigned_agent": "reviewer",
            "backup_agent": "builder",
            "file_scope": {
              "allowed": ["path/to/file.ts", "related/module/"],
              "forbidden": ["src/core/", "tests/"]
            },
            "implementation_guide": "## Steps\n1. Step 1\n2. Step 2\n\n## Tests\n- Test 1",
            "analysis_context": {
              "architecture": "[Synthesized from Architecture Explorer: relevant files, patterns, structure]",
              "patterns": "[Coding patterns and conventions from analysis]",
              "dependencies": ["related imports", "module dependencies"],
              "reference_implementations": ["similar code examples to follow"]
            }
          },
          "implementation_guide": "## Steps\n1. ...\n2. ...\n\n## Tests\n- ..."
        }
      ],
      "wave_summary": {
        "wave_1": {"count": 4, "types": ["backend", "security"]},
        "wave_2": {"count": 3, "types": ["frontend", "testing"]},
        "wave_3": {"count": 3, "types": ["integration", "documentation"]}
      },
      "files_to_modify": ["file1.ts", "file2.ts"],
      "key_decisions": [
        "Decision 1: ... because ...",
        "Decision 2: ... because ..."
      ],
      "risks": [
        "Risk 1: ... mitigation: ..."
      ]
    }
    ```
```

### Phase 3.5: Validate Planner Response (Main Agent)

**⚠️ CRITICAL VALIDATION - Before proceeding, verify the planner response contains:**

1. **`initiative_summary`** - A 1-2 sentence summary (NOT empty, NOT null)
2. **`total_waves`** - A number > 0 (typically 2-4)

If either field is missing or invalid:
- Extract from the plan: `initiative_summary` = first sentence of `plan_summary`
- Calculate: `total_waves` = max wave number from microtasks

**Example validation:**
```
If planner returns:
  initiative_summary: null or ""  → Use: "{plan_summary first sentence}"
  total_waves: null or 0          → Use: max(microtasks[].wave)
```

**DO NOT proceed to Phase 6 without valid values for both fields!**

---

### Phase 4: Present Plan to User (Main Agent)

**The main agent receives the plan from planner and presents it to the user.**

Display the plan in a clear format:

```
## Implementation Plan: [PLAN_DESCRIPTION]

### Initiative Summary
[initiative_summary from planner agent - 1-2 sentence summary]

### Overview
[plan_summary from planner agent]

### Wave Overview
- Wave 1: [count] tasks ([types]) - Foundation
- Wave 2: [count] tasks ([types]) - Implementation
- Wave 3: [count] tasks ([types]) - Integration

---

### Wave 1 (Foundation - Independent)

**[work_type]**
- [ ] **Task 1** (priority: 1, severity: HIGH)
      In `file.ts:45-52` - [problem]; [solution]

**[work_type]**
- [ ] **Task 2** (priority: 2, severity: MEDIUM)
      In `file.ts:100-120` - [problem]; [solution]

---

### Wave 2 (Implementation - depends on Wave 1)

**[work_type]**
- [ ] **Task 3** (priority: 3, depends on: Task 1)
      In `file.ts:200-220` - [problem]; [solution]

---

### Key Decisions
1. [decision 1]
2. [decision 2]

### Risks
1. [risk 1]

### Files to Modify
- file1.ts
- file2.ts
- file3.ts
```

### Phase 5: Approval Gate

**Use AskUserQuestion tool to present options:**

```
AskUserQuestion({
  questions: [{
    question: "I've created a plan with X tasks organized into Y waves. How would you like to proceed?",
    header: "Plan Ready",
    options: [
      { label: "Create Tasks", description: "Create all tasks in Commander and start execution" },
      { label: "Modify Plan", description: "Let me adjust the plan based on your feedback" },
      { label: "Cancel", description: "Don't create tasks, discard the plan" }
    ],
    multiSelect: false
  }]
})
```

Wait for user response before proceeding to Phase 6.

### Phase 6: Create Tasks in Commander (On Approval)

**Create tasks in Commander pending status with FULL CONTEXT.**

**CRITICAL: Persist all gathered context so execute phase can skip re-analysis.**

**⚠️ Policy Auto-Generation:**
- Policies are automatically generated from `file_scope` in each task's context
- If `file_scope.allowed` is missing or empty, a fallback policy will be generated (less restrictive, working directory scope)
- Fallback policies are logged with warnings for visibility
- Ensure `file_scope.allowed` contains at least one file path for proper policy generation

**⚠️ CRITICAL: The planner agent has already created the full context for each microtask.**

Your job as the Main agent is to **PASS THROUGH** what planner provides, NOT construct it yourself.

**⚠️⚠️⚠️ MANDATORY FIELDS FOR INITIATIVE UI ⚠️⚠️⚠️**

Your created root task and children should include these metadata fields:
- `initiative_summary` (root task description) - required for progress visibility
- Keep each microtask's `dependency_order` (0/1/2...) to preserve wave order.

**NEVER omit these fields. ALWAYS include them from the planner agent's response.**

**⚠️ CRITICAL VALIDATION - Before creating initiative and child tasks:**

**Policy Generation Validation:**
1. Each microtask has a non-empty `context` field
2. Each microtask has `context.file_scope` (REQUIRED for policy generation)
3. Each microtask has `context.file_scope.allowed` as a non-empty array
4. At least one allowed path is a specific file or directory relevant to the task
5. `context.analysis_context` exists and has data from scout agents

**If validation fails:**
- STOP immediately
- Report error: "Task [N] missing required file_scope.allowed - cannot generate policy"
- DO NOT create tasks without proper file_scope
- DO NOT create placeholders

**Note:** Policies are auto-generated from `file_scope` in context. Missing `file_scope` will result in fallback policy (less restrictive, working directory scope).

```
ROOT_ID=$(cmd task add "[PLAN_DESCRIPTION]" --type feature --priority high --json | jq -r '.id')
for microtask in "${microtasks[@]}"; do
  cmd task add "${microtask.desc}" --type task --parent "$ROOT_ID" --json >/dev/null
done
```

**Field Purposes:**
- `description`: Format the microtask description as markdown for Commander dashboard UI
- `task_prompt`: Use the microtask description as the CodeRabbit-style prompt for agent execution
- `context`: **PASS THROUGH** planner-provided context unchanged (already has all scout findings synthesized)

**IMPORTANT: Create ONE root initiative task with ALL microtasks:**

The dashboard's Initiative Progress UI tracks a single root initiative with multiple waves.
Each task's `dependency_order` field determines which wave it belongs to:
- `dependency_order: 0` = Wave 1 (foundation/independent tasks)
- `dependency_order: 1` = Wave 2 (depends on Wave 1)
- `dependency_order: 2` = Wave 3 (depends on Wave 2)

**Example - Single initiative with all tasks across waves:**

```
// Root task for the initiative
ROOT_ID=$(cmd task add "[PLAN_DESCRIPTION]" --type feature --priority high --json | jq -r '.id')

# Add each planned microtask as child of ROOT_ID
for microtask in "${opusPlan[@]}"; do
  child_id=$(cmd task add "${microtask.description}" --type task --parent "$ROOT_ID" --priority "${microtask.priority}" --json | jq -r '.id')
  if [[ -n "${microtask.dependency_ids}" ]]; then
    # optional: preserve planner dependency edges on the task tree
    cmd dep add "$child_id" ${microtask.dependency_ids}
  fi
done
```

**Key Points:**
- Loop through `opusPlan.microtasks` - don't construct tasks manually
- Use `JSON.stringify(microtask.context)` - don't build context object yourself
- Planner has already synthesized all scout findings into each microtask's context

**DO NOT create separate initiatives per wave** - this breaks initiative progress tracking.

**Why save all this context?**

When `/commander-execute` runs:
- `dependency_order` already defines execution sequence
- `file_scope` is already computed - no need to re-analyze
- `assigned_agent` is already determined - no need to re-classify
- `implementation_guide` has all the details - agents can execute directly

**Execute phase can skip planning for these tasks!**

### Phase 7: Display Task Board

Show created tasks:

```
## Tasks Created in Commander (Pending)

### Wave 1 (Foundation)
- [ID:123] PENDING - In file.ts:45-52 - Fix auth bug (priority: 1)
- [ID:124] PENDING - In file.ts:100-120 - Add validation (priority: 2)

### Wave 2 (Implementation)
- [ID:125] PENDING - In module.ts:200-220 - Implement handler (priority: 3)

### Wave 3 (Integration)
- [ID:126] PENDING - In test.ts:1-50 - Add tests (priority: 4)

---

### Execution Model: Claim-Loop (Multi-Agent Aware)

When user chooses "Execute All" or "Execute Wave 1", tasks are executed using the **claim-loop pattern**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAIM-LOOP EXECUTION                          │
│                                                                  │
│  Each agent:                                                     │
│  1. Claims ONE task at a time (atomic, race-safe)               │
│  2. Works on it, completes it                                   │
│  3. Claims the next available task                               │
│  4. Continues until all tasks in all waves complete              │
└─────────────────────────────────────────────────────────────────┘
```

**Multi-Agent Support:**
- Multiple `/commander-execute` instances can run in parallel
- Agents naturally distribute work via atomic claiming
- No central coordinator needed
- Race conditions are handled gracefully (just try the next task)

**Wave Boundaries:**
- All Wave N tasks must complete before Wave N+1 starts
- Agents wait if no tasks available but wave incomplete
- Commit checkpoint created after each wave

**Trigger execution:**
- `/commander-execute pending` - Execute all pending tasks
- `/commander-execute` - Execute pending tasks
- Run from multiple terminals for parallel execution

---

**Use AskUserQuestion for next steps:**

```
AskUserQuestion({
  questions: [{
    question: "Tasks created successfully! What would you like to do next?",
    header: "Next Steps",
    options: [
      { label: "Execute All", description: "Run /commander-execute to begin claim-loop execution" },
      { label: "Execute Wave 1", description: "Start with foundation tasks only" },
      { label: "Review First", description: "I'll review the tasks in Commander dashboard before executing" },
      { label: "Done", description: "Tasks are saved, I'll execute them later" }
    ],
    multiSelect: false
  }]
})
```

---

## MANDATORY: Comment Protocol

**ALL agents (scout explorers and planner) follow this protocol.**

### Comment Types
| Type | When to Use |
|------|-------------|
| `progress` | Normal work updates |
| `error` | When something goes wrong |
| `attempt` | When trying a solution |
| `handoff` | Information for next agent |
| `info` | General observations |

### Comment Prefixes
```
ANALYZING: [file] - [what you are looking for]
FOUND: [discovery] - [relevance to task]
DECISION: [choice] because [reasoning]
PLANNING: [what you will do] - [why]
INSIGHT: [pattern or learning]
```

---

## Agent Roles Summary

| Agent | Name | Role | When Used |
|-------|------|------|-----------|
| Main Agent | `pi` | Orchestrator | Always |
| Architecture Explorer | `scout` | Find structure, patterns, dependencies | Always |
| Security Analyzer | `scout` | Find auth, validation, vulnerabilities | If security-related |
| Quality Analyzer | `scout` | Find duplication, tech debt, smells | If quality-related |
| Test Analyzer | `scout` | Map coverage, find gaps | If testing-related |
| API Analyzer | `scout` | Map endpoints, integrations | If API-related |
| Planning Agent | `planner` | Synthesize findings into plan | Always |

---

## Commander CLI Reference

| Tool | Purpose |
|------|---------|
| `cmd task add` | Create root task and microtasks |
| `cmd task update` | Update status/comments |
| `cmd task show` | Inspect tasks + comments |
| `cmd task comment` | Add structured progress comments |
| `cmd dep add` | Declare blockers/dependencies |

---

## Usage Examples

```bash
# Feature implementation
/commander-plan Implement user authentication with JWT tokens

# From Horizon plan
/commander-plan horizon:plan_auth_system

# UI feature
/commander-plan Add dark mode support to the application

# Refactoring
/commander-plan Refactor the payment processing module

# API development
/commander-plan Create REST API for user management
```
