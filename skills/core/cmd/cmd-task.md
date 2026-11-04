---
description: "Plan and execute a single task end-to-end with cmd CLI tracking — Haiku scouts gather context, Opus plans, then implement directly with progress comments on the cmd-tracked task"
argument-hint: "[task description — what to implement, fix, or build]"
allowed-tools: ["Task", "Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebFetch", "WebSearch", "AskUserQuestion"]
---

# cmd Task — Planning + Execution with Full Tracking

This command combines **planning agent architecture** with **direct execution** for single-task workflows. Unlike `/cmd-plan` (multi-task planning) or `/cmd-execute` (batch execution), this command:

1. Uses Haiku agents to gather context in parallel
2. Uses Opus agent to create an implementation plan
3. Creates the task via `cmd task add`
4. **Executes the task directly with full observability** (progress comments via `cmd task comment`)

## Planning + Execution Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN AGENT                                  │
│                    (Orchestrator + Executor)                        │
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
│ HAIKU AGENT 1 │   │ HAIKU AGENT 2 │   │ HAIKU AGENT 3 │
│  Codebase     │   │   Related     │   │   Patterns    │
│  Structure    │   │   Files       │   │   & Context   │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────────────┬─┴───────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │    OPUS AGENT       │
              │  (Planning Agent)   │
              │   Detailed Plan     │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │    MAIN AGENT       │
              │  cmd task add →     │
              │  claim → execute    │
              │  with comments      │
              └─────────────────────┘
```

**Key Principle: The main agent does NO context gathering — delegates to subagents, then executes the plan directly with continuous comment-tracking.**

---

## When to Use

Use `/cmd-task` for:
- **Single tasks** that benefit from codebase context
- Bug fixes where you need to understand surrounding code
- Feature additions that should follow existing patterns
- Any work that needs planning before implementation
- Tasks where you want **full observability** via `cmd task comments`

Use `/cmd-plan` instead if:
- Task decomposes into **multiple subtasks**
- You want tasks created but NOT executed immediately
- Feature requires parallel agent execution

Use the simpler direct approach if:
- Task is trivial (e.g., "fix typo in README")
- No context gathering needed
- You don't need cmd tracking

---

## Prerequisites

Same as `/cmd-plan`:
- `cmd` on PATH
- Current project is initialized for `cmd` (run `cmd init` if needed)

---

## Input

Task description: **$ARGUMENTS**

Examples:
- `Fix the null pointer exception in UserService.findById`
- `Add email validation to the signup form`
- `Refactor the date utilities to use the new library`

---

## Workflow

### Phase 1: Parse Task (Main Agent)

The main agent parses the task description and identifies:

1. **Task type** — bug fix, feature, refactor, test, doc
2. **Likely scope** — which areas of the codebase
3. **Required context dimensions** — see Phase 2

Decide which Haiku agents to spawn (3 by default; add more if scope is unusually broad).

### Phase 2: Parallel Context Gathering (Haiku 4.5 Subagents)

**Spawn ALL Haiku agents in a single message with multiple Task tool calls.**

#### Agent 1: Codebase Structure Scout

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Codebase Structure for: [TASK_DESCRIPTION]

    **Quick mailbox glance:** `cmd mailbox inbox` — pick up any prior scout findings.

    **Mission:** Map the structure relevant to this task.

    **Tasks:**
    1. Find entry points and module structure
    2. Identify the directory(ies) most relevant to this task
    3. List the 5–10 most-likely-relevant files
    4. Note testing setup and conventions

    **Return Format (JSON):**
    ```json
    {
      "relevant_dirs": ["src/auth/", "src/users/"],
      "likely_files": [
        {"path": "src/auth/middleware.ts", "why": "..."}
      ],
      "test_setup": {"framework": "vitest", "test_dir": "tests/"},
      "notes": ["..."]
    }
    ```
```

#### Agent 2: Related Files Scout

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Related Files for: [TASK_DESCRIPTION]

    **Mission:** Find files that import, are imported by, or share patterns with the task target.

    **Tasks:**
    1. Grep for symbols mentioned in the task description
    2. Map import graph centered on those files
    3. Find similar implementations to use as templates

    **Return Format (JSON):**
    ```json
    {
      "direct_matches": [{"file": "...", "symbol": "...", "line": 42}],
      "import_graph": [{"from": "...", "to": "...", "type": "imports|imported-by"}],
      "templates": [{"file": "...", "why_similar": "..."}]
    }
    ```
```

#### Agent 3: Patterns & Conventions Scout

```
Use the Task tool with:
- subagent_type: "Explore"
- model: "haiku"
- prompt: |
    ## Patterns & Conventions for: [TASK_DESCRIPTION]

    **Mission:** Identify code conventions this task must respect.

    **Tasks:**
    1. Naming conventions (camelCase, PascalCase, snake_case)
    2. Error handling patterns
    3. Testing patterns (file location, naming, framework)
    4. Common helpers (e.g., logger, validators)
    5. CLAUDE.md / AGENTS.md rules in scope

    **Return Format (JSON):**
    ```json
    {
      "naming": {"functions": "camelCase", "types": "PascalCase"},
      "error_handling": "...",
      "test_pattern": "co-located *.test.ts using vitest",
      "helpers": [{"name": "...", "import_path": "..."}],
      "claude_md_rules": ["..."]
    }
    ```
```

### Phase 3: Synthesize Plan (Opus Subagent)

```
Use the Task tool with:
- subagent_type: "general-purpose"
- model: "opus"
- prompt: |
    ## Implementation Plan for: [TASK_DESCRIPTION]

    **Haiku findings (paste verbatim):**
    [STRUCTURE_JSON]
    [RELATED_FILES_JSON]
    [PATTERNS_JSON]

    **Mission:** Produce a concrete, executable plan.

    **Return Format (JSON):**
    ```json
    {
      "task_summary": "1-2 sentence summary",
      "files_to_modify": [
        {"path": "...", "action": "edit|create|delete", "lines": "X-Y", "change_summary": "..."}
      ],
      "steps": [
        {
          "n": 1,
          "description": "...",
          "file": "...",
          "details": "...",
          "pattern_reference": "follows pattern from src/foo/bar.ts:30"
        }
      ],
      "success_criteria": ["..."],
      "risks": [{"risk": "...", "mitigation": "..."}],
      "tests_to_run": ["npm run test:unit", "..."],
      "estimated_complexity": "low|medium|high"
    }
    ```
```

### Phase 4: Create Task & Present Plan (Main Agent)

#### 4.1 Create the cmd-tracked task

```bash
result=$(cmd task add "$TASK_DESCRIPTION" \
  --priority 2 \
  --type task \
  --json)

task_id=$(echo "$result" | jq -r '.id')
```

Save `$task_id` for later steps.

#### 4.2 Stash the plan as an `info` comment

The cmd Task contract has no structured `context` field, so the Opus plan lives as an `info` comment on the task. Future commands (`/cmd-execute`, manual review) can read it via `cmd task comments <id>`.

```bash
cmd task comment "$task_id" "$OPUS_PLAN_JSON" --type info
```

#### 4.3 Present the plan to the user

```
## Implementation Plan

### Summary
[task_summary from Opus]

### Files to Modify
- `file1.ts` — [action]: [change_summary]
- `file2.ts` — [action]: [change_summary]

### Steps
1. [step description]
   - File: [file]
   - Details: [details]
   - Pattern: [reference]
2. [step 2]
   - ...

### Success Criteria
- [ ] [criterion 1]
- [ ] [criterion 2]

### Tests to Run
- npm run test:unit

### Risks
- [risk]: [mitigation]

---

**Task created:** #[task_id]

Ready to execute this plan?
- **Yes** — Begin implementation with full tracking
- **Modify** — Let me adjust the plan first
- **Cancel** — Don't execute (task stays at status `pending`)
```

Use AskUserQuestion to gate the execution.

### Phase 5: Execute with Full Tracking (Main Agent)

**On approval, execute the plan with continuous `cmd task comment` updates.**

#### 5.0 Awareness Check

```bash
cmd mailbox inbox
```

If another agent is already working on this exact task or a closely related one, surface the conflict to the user before continuing.

While you work, you have these tools available if useful (none are required):
- Share a discovery: `cmd mailbox send @all "discovery" "Found: [discovery]"`
- Ask for help (stuck after 2+ attempts): `cmd mailbox send commander "stuck" "Stuck on: [problem]"`

#### 5.1 Claim and Start

```bash
cmd task claim "$task_id"

cmd task comment "$task_id" \
  "STARTED: Beginning implementation. Plan: [brief summary]. First step: [step 1 summary]" \
  --type progress
```

#### 5.2 Execute Each Step with Comments

For every step in the plan:

```bash
# Before starting step
cmd task comment "$task_id" "STEP $N: Starting — $description" --type progress

# Pre-edit analysis (optional, if non-trivial)
cmd task comment "$task_id" "ANALYZING: $file — $what_youre_looking_for" --type progress

# (do the actual work via Read / Edit / Write tools)

# After modifying a file
cmd task comment "$task_id" "MODIFIED: $file lines $X-$Y — $what_changed" --type progress

# After completing the step
cmd task comment "$task_id" "STEP $N: Complete — $summary" --type progress
```

#### 5.3 Comment Patterns

Use these exact prefixes inside `message` so `cmd task comments` reads as a clear timeline:

```
STEP [N]: Starting — [description]
ANALYZING: [file] — [what you're looking for]
FOUND: [discovery] — [relevance]
DECISION: [choice] because [reasoning]
PLANNING: [what you will do] — [why]
MODIFIED: [file] lines [X-Y] — [what changed]
STEP [N]: Complete — [summary]
TESTING: Running [test] — [expected outcome]
RESULT: [passed/failed] — [details]
ISSUE: [problem] — attempting [solution]
RESOLVED: [issue] by [solution]
BLOCKER: [issue]. Tried: [attempts]. Need: [help]
INSIGHT: [pattern or learning]
```

### Phase 6: Complete or Fail

#### 6a. On Successful Completion

```bash
# Final verification comment
cmd task comment "$task_id" \
  "COMPLETING: Final verification — [what you checked]" \
  --type progress

# Mark done
cmd task update "$task_id" --status done

# Final summary as info comment (this is the "result" field in the old MCP API)
cmd task comment "$task_id" \
  "COMPLETED: [detailed summary]. Files: [list]. Tests: [status]. Changes: [brief]" \
  --type info
```

#### 6b. On Failure

```bash
cmd task comment "$task_id" "FAILING: [immediate reason]" --type error

cmd task update "$task_id" --status failed

cmd task comment "$task_id" \
  "FAILED: [root cause]. Attempted: [what tried]. Files touched: [partial changes]. Suggestion: [retry guidance]" \
  --type handoff
```

#### 6c. If Task Needs Human Review

```bash
cmd task update "$task_id" --status needs_review

cmd task comment "$task_id" \
  "NEEDS REVIEW: [what needs checking]. Work completed: [list]. Question: [specific question]. Recommendation: [suggestion]" \
  --type handoff
```

Note: cmd's `needs_review` status round-trips through `cmd task list --status needs_review`, so it round-trips through `cmd task list --status needs_review`.

---

### Phase 6.5: Continue with Related Tasks (Optional Claim-Loop)

After completing the primary task, check whether there are unblocked tasks in the same project to continue with:

```bash
ready_count=$(cmd task list --status pending --json | jq 'length')
pending_count=$(cmd task list --status pending --json \
  | sed -E 's/\x1b\[[0-9;]*m//g' \
  | python3 -c 'import json,sys,re; d=sys.stdin.read(); s=d.find("["); e=d.rfind("]")+1; print(len(json.loads(d[s:e])))')

if [[ $ready_count -gt 0 || $pending_count -gt 0 ]]; then
  echo "Found $ready_count ready / $pending_count pending tasks."
fi
```

If non-zero, ask the user:

```
AskUserQuestion({
  questions: [{
    question: "Primary task complete. Found X ready / Y pending tasks. Continue executing?",
    header: "Continue?",
    options: [
      { label: "Continue", description: "Enter claim-loop and pick the next ready task" },
      { label: "Done", description: "Stop here, leave remaining tasks for later" }
    ],
    multiSelect: false
  }]
})
```

If the user chooses Continue, enter claim-loop mode (same shape as `/cmd-execute` Phase 5):

```
CLAIM_LOOP:
  WHILE TRUE:
    next=$(cmd task list --status pending --json | jq -r '.[0].id // empty')
    if [[ -z "$next" ]]; then
      echo "No more ready work; exiting loop."
      break
    fi

    # Resolve task lookup id via cmd task list
    numeric=$(cmd task list --json \
      | sed -E 's/\x1b\[[0-9;]*m//g' \
      | python3 -c "import json,sys; arr=json.load(sys.stdin); print(next(t['id'] for t in arr if str(t.get('id')) == '$next'))")

    cmd task claim "$numeric"
    # Re-run a focused planning pass on this new task, or execute directly if it has an `info` comment with a pre-baked plan.
    # On done: cmd task update <numeric> --status done && comment summary
    # On fail: cmd task update <numeric> --status failed && comment error
```

---

## MANDATORY: Comment Protocol

| Type | When to Use |
|------|-------------|
| `progress` | Normal work updates (step starts/ends, file edits) |
| `error` | When something goes wrong |
| `attempt` | When trying a solution |
| `handoff` | Information for next agent (especially on failure or needs-review) |
| `info` | Synthesized context (the Opus plan, completion summary) |

**Posting from Bash:**

```bash
cmd task comment "$task_id" "STEP 1: Starting — adding email validator" --type progress
```

If the message contains shell-special characters, write it to a tempfile and use a heredoc:

```bash
cat <<'EOF' > /tmp/comment.txt
COMPLETED: Added email validator using zod. Files: src/auth/validators.ts (+18 -0).
Tests: 3 new tests pass. Lint: clean.
EOF
cmd task comment "$task_id" "$(cat /tmp/comment.txt)" --type info
```

---

## cmd CLI quick reference

| Operation | Command |
|---|---|
| Create task | `cmd task add "..." --priority N --type task --json` (parse `.id`) |
| Show task | `cmd task show <id> --json` |
| Update status | `cmd task update <id> --status <pending\|working\|done\|failed\|needs_review>` |
| Claim | `cmd task claim <id>` |
| Release | `cmd task release <id>` |
| Add comment | `cmd task comment <id> "msg" --type progress\|error\|attempt\|handoff\|info` |
| List comments | `cmd task comments <id>` |
| Find unblocked work | `cmd task list --status pending --json` |
| List by status | `cmd task list --status pending --json` |
| Mailbox | `cmd mailbox send <to> "<subj>" "<body>"`, `cmd mailbox inbox`, `cmd mailbox read <id>` |
| Hierarchy view | `cmd tree` |

---

## Status lifecycle

| From → To | Trigger | Command |
|---|---|---|
| (new) → pending | Task created | `cmd task add "..." --json` |
| pending → working | Agent claims task | `cmd task claim <id>` (and optionally `cmd task update <id> --status working`) |
| working → completed | Success | `cmd task update <id> --status done` |
| working → failed | Error | `cmd task update <id> --status failed` |
| working → needs_review | Human input needed | `cmd task update <id> --status needs_review` |

Note: `cmd task claim` records the agent identity in the claims sidecar but does **not** by itself flip the task status. If you want the kanban view to reflect "in progress", run both `cmd task claim` and `cmd task update <id> --status working`.

---

## Usage Examples

```bash
# Bug fix
/cmd-task Fix the null pointer exception in UserService.findById

# Feature addition
/cmd-task Add email validation to the signup form using zod

# Refactor
/cmd-task Extract the date helpers from utils.ts into a dedicated date/ module

# Test addition
/cmd-task Write tests for the new auth middleware
```
