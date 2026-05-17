---
description: "Break down a feature into cmd-tracked microtasks via the cmd CLI using deep codebase analysis, then coordinate parallel agent execution"
argument-hint: "[plan description or feature to implement]"
allowed-tools: ["Task", "Bash", "Read", "Glob", "Grep", "AskUserQuestion"]
---

# cmd Plan — Multi-Agent Task Orchestration via cmd CLI

Same workflow shape as `/commander-plan`, but tasks are managed through **cmd** (backed internally by the cmd adapter) instead of the Commander MCP server. Dependency wiring uses `cmd dep add` so cmd dependency queries and task context report blocked and unblocked work for the claim-loop.

## Planning Agent Architecture

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
│ HAIKU AGENT 1 │   │ HAIKU AGENT 2 │   │ HAIKU AGENT 3 │
│  Architecture │   │   Security    │   │   Quality     │
│   Analysis    │   │   Analysis    │   │   Analysis    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────────────┬─┴───────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │    OPUS AGENT       │
              │  (Planning Agent)   │
              │   Synthesize &      │
              │   Create Plan       │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │    MAIN AGENT       │
              │  Present Plan, then │
              │  cmd task add  │
              │  dep add (waves)    │
              └─────────────────────┘
```

**Key Principle: The main agent does NO context gathering itself.**

- **Haiku 4.5 Subagents** — fast, parallel context gathering
- **Opus 4.5 Subagent** — deep reasoning for plan synthesis
- **Main Agent** — orchestration and user presentation only

---

## Prerequisites

This command requires:

1. `cmd` CLI on PATH (the Commander v2 CLI; ships from `commander-v2/cli/cmd`)
2. `cmd` wrapper on PATH (it owns any backend access)
3. The current project is initialized for `cmd`. If not, run `cmd init` first.
4. The cmd CLI backend is the default. To use the JSON mock backend instead, set `CMD_BACKEND=mock`.

If you're not sure: `cmd whoami` shows the active project and working directory in use.

---

## Input

Plan or feature to implement: **$ARGUMENTS**

---

## Workflow

### Phase 1: Parse & Delegate (Main Agent)

**The main agent ONLY parses input and delegates — it does NOT read files or gather context.**

1. **Extract Plan Intent**
   - Parse the goal from $ARGUMENTS
   - Identify keywords that suggest scope (files, features, areas)

2. **Determine Analysis Dimensions**
   Based on the plan description, identify which analyses are needed:
   - **Architecture** — always needed
   - **Security** — if auth, validation, data handling mentioned
   - **Quality** — if refactor, cleanup, improve mentioned
   - **Testing** — if test, coverage, spec mentioned
   - **Performance** — if optimize, speed, cache mentioned
   - **API** — if endpoint, route, API mentioned

3. **Spawn Haiku Agents in Parallel**
   Launch 3–5 Haiku 4.5 subagents simultaneously for context gathering.

### Phase 2: Parallel Context Gathering (Haiku 4.5 Subagents)

**Spawn multiple Haiku agents IN PARALLEL using the Task tool.**

**CRITICAL: Launch ALL Haiku agents in a SINGLE message with multiple Task tool calls.**

Each agent gets a focused exploration brief and returns structured JSON findings.

#### Agent 1: Architecture Explorer

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Architecture Analysis for: [PLAN_DESCRIPTION]

    **You Are Part of a Team**
    Other scout agents may be exploring in parallel. Quick mailbox check:
    Bash: `cmd mailbox inbox`
    If relevant findings exist, incorporate them; if you discover something
    broadly useful, share it:
    Bash: `cmd mailbox send @all "scout finding" "Found: [discovery]"`

    **Your Mission:** Explore codebase architecture relevant to this feature.

    **Exploration Tasks:**
    1. Find the main entry points and module structure
    2. Identify relevant files that will need modification
    3. Map dependencies and imports between modules
    4. Document existing patterns (naming, structure, conventions)
    5. Find similar implementations to use as reference

    **Search Strategy:**
    - Glob: `src/**/*.ts`, `lib/**/*.ts`
    - Grep: `import.*from`, `require\(`
    - Read: entry points, configs, types

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
- model: "haiku"
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
    - Glob: `**/*auth*`, `**/*valid*`, `**/*secur*`
    - Grep: `password`, `token`, `secret`, `api.?key`, `credential`

    **Return Format (JSON):**
    ```json
    {
      "auth_patterns": [{"file": "...", "mechanism": "...", "notes": "..."}],
      "validation_patterns": [{"file": "...", "what": "...", "how": "..."}],
      "security_concerns": [{"file": "...", "line": "...", "issue": "...", "severity": "..."}],
      "recommendations": ["...", "..."]
    }
    ```
```

#### Agent 3: Quality Analyzer (if needed)

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Code Quality Analysis for: [PLAN_DESCRIPTION]

    **Your Mission:** Assess code quality and identify improvement opportunities.

    **Exploration Tasks:**
    1. Find code duplication
    2. Identify complex functions (>50 lines)
    3. Look for code smells
    4. Check for consistent patterns
    5. Find technical debt markers (TODO, FIXME, HACK)

    **Return Format (JSON):**
    ```json
    {
      "duplication": [{"files": ["...", "..."], "description": "..."}],
      "complex_functions": [{"file": "...", "function": "...", "lines": "...", "complexity_reason": "..."}],
      "tech_debt": [{"file": "...", "marker": "TODO|FIXME|HACK", "context": "..."}],
      "improvement_opportunities": ["...", "..."]
    }
    ```
```

#### Agent 4: Test Analyzer (if needed)

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Test Coverage Analysis for: [PLAN_DESCRIPTION]

    **Your Mission:** Map existing tests and find coverage gaps.

    **Exploration Tasks:**
    1. Find test files relevant to this feature
    2. Identify the testing framework and patterns
    3. Map which production files have tests, which don't
    4. Find similar tests to use as templates

    **Return Format (JSON):**
    ```json
    {
      "framework": "vitest|jest|...",
      "test_patterns": ["...", "..."],
      "covered_files": ["...", "..."],
      "uncovered_files_in_scope": ["...", "..."],
      "template_tests": [{"file": "...", "what_it_covers": "..."}]
    }
    ```
```

#### Agent 5: API Analyzer (if needed)

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## API Surface Analysis for: [PLAN_DESCRIPTION]

    **Your Mission:** Map endpoints, integrations, and external surfaces.

    **Return Format (JSON):**
    ```json
    {
      "endpoints": [{"method": "...", "path": "...", "handler_file": "..."}],
      "integrations": [{"service": "...", "client_file": "..."}],
      "schemas": [{"file": "...", "describes": "..."}]
    }
    ```
```

### Phase 3: Synthesize via Opus (Single Subagent)

**Pass all Haiku findings to a single Opus subagent for plan synthesis.**

```
Use the Task tool with:
- subagent_type: "general-purpose"
- model: "opus"
- prompt: |
    ## Plan Synthesis for: [PLAN_DESCRIPTION]

    **You receive structured JSON findings from N Haiku scouts.**

    **Haiku Findings (paste verbatim):**
    [ARCHITECTURE_JSON]
    [SECURITY_JSON if any]
    [QUALITY_JSON if any]
    [TEST_JSON if any]
    [API_JSON if any]

    **Your Mission:** Synthesize findings into a wave-organized microtask plan.

    **Microtask Format (CodeRabbit-style):**
    Each microtask description follows the pattern:
    `In {file} around lines {X} to {Y}, {problem}; {solution}`

    **Wave Organization:**
    - Wave 1 = foundation/independent tasks (no deps)
    - Wave 2 = depends on Wave 1
    - Wave 3 = depends on Wave 2 (typically tests/integration)

    **Return Format (JSON):**
    ```json
    {
      "plan_summary": "Brief summary of the implementation plan",
      "initiative_summary": "1-2 sentence summary of what this accomplishes and why",
      "total_tasks": 10,
      "total_waves": 3,
      "microtasks": [
        {
          "id": 1,
          "description": "In {file} around lines {X} to {Y}, {problem}; {solution}",
          "file": "path/to/file.ts",
          "lines": "45-52",
          "wave": 1,
          "priority": 1,
          "work_type": "backend|frontend|testing|docs|devops|refactor",
          "dependencies": [],
          "context": {
            "source": "cmd-plan",
            "original_prompt": "...",
            "wave": 1,
            "work_type": "backend",
            "file": "path/to/file.ts",
            "lines": "45-52",
            "severity": "HIGH|MEDIUM|LOW",
            "assigned_agent": "haiku-4.5",
            "file_scope": {
              "allowed": ["path/to/file.ts", "related/module/"],
              "forbidden": ["src/core/", "tests/"]
            },
            "implementation_guide": "## Steps\n1. ...\n2. ...\n\n## Tests\n- ...",
            "analysis_context": {
              "architecture": "[Synthesized from Architecture Explorer]",
              "patterns": "[Coding patterns and conventions]",
              "dependencies": ["related imports", "module dependencies"],
              "reference_implementations": ["similar code examples"]
            }
          }
        }
      ],
      "wave_summary": {
        "wave_1": {"count": 4, "types": ["backend", "security"]},
        "wave_2": {"count": 3, "types": ["frontend", "testing"]},
        "wave_3": {"count": 3, "types": ["integration", "documentation"]}
      },
      "files_to_modify": ["file1.ts", "file2.ts"],
      "key_decisions": ["..."],
      "risks": ["..."]
    }
    ```

    **CRITICAL FIELDS:** Every microtask MUST have a non-empty
    `context.file_scope.allowed`. Execution agents use it as their write
    allowlist; without it, they default to a broad fallback policy.
```

### Phase 3.5: Validate Opus Response (Main Agent)

Before proceeding, verify:

1. `initiative_summary` is non-empty
2. `total_waves` is a number > 0 (typically 2–4)
3. Every microtask has `context.file_scope.allowed` with at least one path

If any field is missing:
- Derive `initiative_summary` from the first sentence of `plan_summary`
- Derive `total_waves` from `max(microtasks[].wave)`
- For missing `file_scope.allowed`, fall back to `["."]` (project root) and warn

### Phase 4: Present Plan to User (Main Agent)

Display the plan in a clear format:

```
## Implementation Plan: [PLAN_DESCRIPTION]

### Initiative Summary
[initiative_summary from Opus]

### Overview
[plan_summary from Opus]

### Wave Overview
- Wave 1: [count] tasks ([types]) — Foundation
- Wave 2: [count] tasks ([types]) — Implementation
- Wave 3: [count] tasks ([types]) — Integration

---

### Wave 1 (Foundation — Independent)

**[work_type]**
- [ ] **Task 1** (priority: 1, severity: HIGH)
      In `file.ts:45-52` — [problem]; [solution]

---

### Wave 2 (Implementation — depends on Wave 1)

**[work_type]**
- [ ] **Task 3** (priority: 3, depends on: Wave 1 outputs)
      In `file.ts:200-220` — [problem]; [solution]

---

### Key Decisions
1. ...

### Risks
1. ...

### Files to Modify
- file1.ts
- file2.ts
```

### Phase 5: Approval Gate

```
AskUserQuestion({
  questions: [{
    question: "I've created a plan with X tasks across Y waves. How would you like to proceed?",
    header: "Plan Ready",
    options: [
      { label: "Create Tasks", description: "Create all tasks in cmd and start execution" },
      { label: "Modify Plan", description: "Let me adjust the plan based on your feedback" },
      { label: "Cancel", description: "Don't create tasks, discard the plan" }
    ],
    multiSelect: false
  }]
})
```

Wait for user response before proceeding to Phase 6.

### Phase 6: Create Tasks and Wire Deps via cmd

**Use one CLI.** `cmd task` and `cmd dep` own the full Commander task contract: typed comments, `claimedBy: AgentIdentity`, sidecar metadata, and dependency edges. Do not bypass `cmd` for dependency wiring.

#### 6.1 Create each microtask via `cmd task add`

For each microtask, in the order Opus emitted them:

```bash
# Capture both numeric id and task_id for later use
result=$(cmd task add "$DESC" \
  --priority "$PRIORITY" \
  --type task \
  --json)

numeric_id=$(echo "$result" | jq -r '.id')
task_id=$(echo "$result"   | jq -r '.task_id')
```

Where:
- `$DESC` — the microtask description, formatted as the CodeRabbit-style line:
  `"In <file> around lines <X> to <Y>, <problem>; <solution>"`
- `$PRIORITY` — 0–4 (cmd clamps; 0 is highest)

Save a mapping `{wave_number: [{numeric_id, task_id, description}]}` for the next step.

#### 6.2 Stash full task context as a comment

The cmd Task contract has no structured `context` field — comments are the durable home for the implementation guide and analysis context emitted by Opus.

For each created task:

```bash
cmd task comment "$numeric_id" \
  "$(jq -nc --arg ctx "$CONTEXT_JSON" '{wrap: $ctx}' | jq -r .wrap)" \
  --type info
```

Or simpler when the message is short — just inline the JSON:

```bash
cmd task comment "$numeric_id" "$CONTEXT_JSON" --type info
```

The execution-side commands (`/cmd-execute`, `/cmd-task`) read these `info` comments to recover the file_scope and implementation guide without re-running scouts.

#### 6.3 Wire wave dependencies via `cmd dep add`

For each task in Wave N (where N ≥ 2), add a `blocks` edge from each Wave N-1 task:

```bash
# For every (waveN_task, waveN_minus_1_task) pair:
cmd dep add "$waveN_task" "$waveN_minus_1_task"
```

The default edge type is `blocks`, which is what `cmd task list --status pending` honors. This means:
- Wave 2 tasks won't appear in `cmd task list --status pending` until ALL Wave 1 tasks are closed
- `cmd-execute` claim-loops can rely on `cmd task list --status pending --json` to find unblocked work

**Avoid `cmd dep add`** for now — that bridge still routes through the JSON mock and won't persist into the cmd dependency graph.

#### 6.4 (Optional) Mark wave-1 tasks ready, others backlog

If you want a clean "backlog vs ready" split for the dashboard, leave Wave 1 tasks at the cmd default status (`pending`) and tag downstream waves with a status label:

```bash
cmd task update "$numeric_id" --status backlog
```

Note: cmd's status alias `backlog` round-trips through `cmd task list --status backlog`, so it round-trips through `cmd task list`.

### Phase 7: Display Task Board

Show created tasks:

```
## Tasks Created (cmd)

### Wave 1 (Foundation)
- #1  v2-abc  [pending]   In file.ts:45-52  Fix auth bug             (p1)
- #2  v2-def  [pending]   In file.ts:100-120 Add validation          (p2)

### Wave 2 (Implementation, blocked by Wave 1)
- #3  v2-ghi  [pending]   In module.ts:200-220 Implement handler     (p3)

### Wave 3 (Integration, blocked by Wave 2)
- #4  v2-jkl  [pending]   In test.ts:1-50 Add tests                  (p4)

Sanity check:
  cmd task list --status pending              # should list only Wave 1 tasks
  cmd tree              # hierarchical view
  cmd task list --json  # full state
```

---

### Execution Model: Claim-Loop (Multi-Agent Aware)

When the user runs `/cmd-execute`, tasks execute via the **claim-loop pattern**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAIM-LOOP EXECUTION                          │
│                                                                  │
│  Each agent:                                                     │
│  1. Calls `cmd task list --status pending --json` to find unblocked work               │
│  2. Picks one task, calls `cmd task claim <id>`                  │
│  3. Works on it; logs progress via `cmd task comment`            │
│  4. On success: `cmd task update <id> --status done`             │
│  5. Loops back to step 1                                         │
└─────────────────────────────────────────────────────────────────┘
```

**Multi-Agent Support:**
- Multiple `/cmd-execute` instances can run in parallel
- Agents distribute work via `cmd task claim`'s claim semantics (sidecar `byTask` map is set atomically per claim call)
- Wave boundaries fall out naturally from the cmd dependency graph — Wave N+1 only becomes ready when Wave N closes

**Trigger execution:**
- `/cmd-execute` — process all unblocked tasks
- `/cmd-execute backlog` — process backlog-flagged tasks
- Run from multiple terminals for parallel execution

---

### Phase 8: Next-Step Prompt

```
AskUserQuestion({
  questions: [{
    question: "Tasks created successfully! What would you like to do next?",
    header: "Next Steps",
    options: [
      { label: "Execute All", description: "Run /cmd-execute to begin claim-loop" },
      { label: "Execute Wave 1", description: "Start with foundation tasks only (`cmd task list --status pending` already gates this)" },
      { label: "Review First", description: "I'll review with `cmd task list` / `cmd tree` before executing" },
      { label: "Done", description: "Tasks are saved, I'll execute them later" }
    ],
    multiSelect: false
  }]
})
```

---

## MANDATORY: Comment Protocol

**ALL agents (Haiku scouts and Opus planner) follow this protocol when they have a task id to comment on. During Phase 1–3, scouts haven't been assigned a task yet — they post mailbox-style updates instead via `cmd mailbox send @all ...`.**

### Comment Types (mapped to cmd Task contract)

| Type | When to Use |
|------|-------------|
| `progress` | Normal work updates |
| `error` | When something goes wrong |
| `attempt` | When trying a solution |
| `handoff` | Information for the next agent |
| `info` | General observations / synthesized context |
| `planner_question` | Planner asking the human/agent for missing context |
| `context_answer` | Reply to a planner_question |
| `research_finding` | Scout posting a discovery |
| `planner_microtask` | Planner emitting the final microtask spec |

### Comment Prefixes (free-form, used inside `message`)

```
ANALYZING: [file] — [what you are looking for]
FOUND:     [discovery] — [relevance to task]
DECISION:  [choice] because [reasoning]
PLANNING:  [what you will do] — [why]
INSIGHT:   [pattern or learning]
COMPLETE:  [summary at end of phase]
```

### Posting a comment from a subagent

```bash
cmd task comment <id> "ANALYZING: src/foo.ts — looking for auth flow" --type progress
```

Without an id (during Phase 1 scouting), use the mailbox:

```bash
cmd mailbox send @all "scout-arch" "Found: auth lives in src/auth/middleware.ts"
```

---

## cmd ↔ commander tool reference

| Old MCP tool | New cmd CLI |
|---|---|
| `commander_task(operation="create", description, priority, context)` | `cmd task add "..." --priority N --type task --json` (parse `.id`) |
| `commander_task(operation="list", status, working_directory)` | `cmd task list --status <s> --json` (current cwd is implicit) |
| `commander_task(operation="get", task_id)` | `cmd task show <id> --json` |
| `commander_task(operation="update", task_id, status="X")` | `cmd task update <id> --status X` |
| `commander_task_lifecycle(operation="claim")` | `cmd task claim <id>` |
| `commander_task_lifecycle(operation="release")` | `cmd task release <id>` |
| `commander_task_lifecycle(operation="complete", result)` | `cmd task update <id> --status done` then `cmd task comment <id> "result" --type info` |
| `commander_task_lifecycle(operation="fail", error)` | `cmd task update <id> --status failed` then `cmd task comment <id> "err" --type error` |
| `commander_comment(operation="add", type, message)` | `cmd task comment <id> "msg" --type T` |
| `commander_log(message)` | `cmd task comment <id> "msg" --type progress` (cmd has no separate log surface) |
| `commander_mailbox(operation="send", from_agent, to_agent, body, message_type)` | `cmd mailbox send <to> "<subject>" "<body>"` |
| `commander_mailbox(operation="inbox")` | `cmd mailbox inbox` |
| `commander_mailbox(operation="read", message_id)` | `cmd mailbox read <id>` |
| `commander_task_group(operation="create", tasks, total_waves, ...)` | Loop `cmd task add` + `cmd dep add` per wave (no native group object) |
| `commander_task_group(operation="get", group_id)` | No direct equivalent. Reconstruct from the `cmd dep` graph or use a parent-task convention. |

---

## Usage Examples

```bash
# Feature implementation
/cmd-plan Implement user authentication with JWT tokens

# UI feature
/cmd-plan Add dark mode support to the application

# Refactoring
/cmd-plan Refactor the payment processing module

# API development
/cmd-plan Create REST API for user management
```
